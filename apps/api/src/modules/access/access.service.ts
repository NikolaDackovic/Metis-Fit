import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { AccessReasonCode, AccessResultDto, MembershipDisplayStatus } from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';
import { currentClubId } from '../../shared/club-context';
import { memberIdFor } from '../classes/bookings.service';
import { verifyKioskToken } from './kiosk';
import { issueToken, verifyToken } from './token';

/** A repeated scan of the same QR at the same desk within this window returns the first result. */
const DOUBLE_SCAN_GRACE_MS = 5_000;

interface Candidate {
  id: string;
  plan_id: string;
  plan_kind: string;
  plan_name: string | null;
  display_status: string;
  start_date: string;
  end_date: string | null;
  visit_limit: number | null;
  visits_used: number;
  visits_remaining: number | null;
  balance: number;
  currency: string;
  state: string;
}

export interface EntryDecision {
  result: 'granted' | 'denied';
  reasonCode: AccessReasonCode;
  membership: Candidate | null;
  consumedVisit: boolean;
  warnings: AccessResultDto['warnings'];
}

/**
 * Business rules for entering the club (docs/BUSINESS_RULES.md §4, docs/DECISIONS.md §5).
 * Locks the member's memberships so concurrent check-ins cannot double-consume a visit.
 * `dryRun` evaluates without consuming anything (used before issuing a QR token).
 */
export async function evaluateEntry(
  tx: Tx,
  memberId: string,
  opts: { dryRun?: boolean; locale?: string } = {},
): Promise<
  EntryDecision & {
    member: { id: string; member_number: string; first_name: string; last_name: string };
  }
> {
  const member = await tx
    .selectFrom('members')
    .select(['id', 'member_number', 'first_name', 'last_name', 'deactivated_at'])
    .where('id', '=', memberId)
    .forUpdate()
    .executeTakeFirst();
  if (!member) throw notFound('member');
  const deny = (reasonCode: AccessReasonCode, membership: Candidate | null = null) => ({
    member,
    result: 'denied' as const,
    reasonCode,
    membership,
    consumedVisit: false,
    warnings: [],
  });
  if (member.deactivated_at) return deny('MEMBER_DEACTIVATED');

  await tx
    .selectFrom('memberships')
    .select('id')
    .where('member_id', '=', memberId)
    .forUpdate()
    .execute();

  const rows = await sql<Candidate>`
    select o.id, o.plan_id, p.kind::text as plan_kind,
           coalesce(t.name, tsr.name) as plan_name,
           o.display_status, o.start_date::text, o.end_date::text, o.visit_limit, o.visits_used,
           o.visits_remaining, (o.price_amount - o.paid_amount)::int as balance, o.currency, o.state::text
    from public.membership_overview o
    join public.membership_plans p on p.id = o.plan_id
    left join public.membership_plan_translations t on t.plan_id = o.plan_id and t.locale = ${opts.locale ?? 'sr'}
    left join public.membership_plan_translations tsr on tsr.plan_id = o.plan_id and tsr.locale = 'sr'
    where o.member_id = ${memberId} and o.state <> 'cancelled'
    order by o.end_date nulls last
  `
    .execute(tx)
    .then((r) => r.rows);

  const valid = rows.filter(
    (r) => r.display_status === 'active' || r.display_status === 'expiring_soon',
  );
  if (valid.length === 0) {
    const { today } = await sql<{ today: string }>`select public.club_today()::text as today`
      .execute(tx)
      .then((r) => r.rows[0]!);
    const outOfVisits = rows.find(
      (r) =>
        r.state === 'active' &&
        r.start_date <= today &&
        (r.end_date === null || r.end_date >= today) &&
        r.visit_limit !== null &&
        r.visits_used >= r.visit_limit,
    );
    if (!outOfVisits) {
      // F13-2: a running pause is a clear reason of its own for the desk and the member.
      const paused = rows.find((r) => r.display_status === 'paused');
      return paused
        ? deny('MEMBERSHIP_PAUSED', paused)
        : deny('NO_ACTIVE_MEMBERSHIP', rows[0] ?? null);
    }

    // The last visit was used TODAY: re-entering the same day is still allowed (DECISIONS A3).
    const usedToday = await tx
      .selectFrom('attendance_attempts')
      .select('id')
      .where('membership_id', '=', outOfVisits.id)
      .where('result', '=', 'granted')
      .where('consumed_visit', '=', true)
      .where(sql<boolean>`(occurred_at at time zone 'Europe/Belgrade')::date = public.club_today()`)
      .executeTakeFirst();
    if (!usedToday) return deny('NO_VISITS_LEFT', outOfVisits);
    const warnings: AccessResultDto['warnings'] =
      outOfVisits.balance > 0
        ? [{ code: 'DEBT', amount: outOfVisits.balance, currency: outOfVisits.currency }]
        : [];
    return {
      member,
      result: 'granted',
      reasonCode: 'OK',
      membership: outOfVisits,
      consumedVisit: false,
      warnings,
    };
  }

  // Time windows: a plan with windows only admits members inside one of them (club time).
  const windows = await sql<{ plan_id: string; inside: boolean }>`
    select w.plan_id,
           bool_or(w.weekday = extract(isodow from now() at time zone 'Europe/Belgrade')::int
                   and (now() at time zone 'Europe/Belgrade')::time between w.starts_at and w.ends_at) as inside
    from public.membership_plan_time_windows w
    where w.plan_id in (${sql.join(valid.map((v) => v.plan_id))})
    group by w.plan_id
  `
    .execute(tx)
    .then((r) => new Map(r.rows.map((w) => [w.plan_id, w.inside])));
  const allowed = valid.filter((v) => windows.get(v.plan_id) ?? true);
  if (allowed.length === 0) return deny('OUTSIDE_TIME_WINDOW', valid[0]!);

  // Use the membership that expires first (DECISIONS A4): rows are already ordered by end_date.
  const chosen = allowed[0]!;
  let consumedVisit = false;
  // Personal-training sessions are consumed by the trainer, not at the door (DECISIONS §4).
  if (!opts.dryRun && chosen.visit_limit !== null && chosen.plan_kind !== 'personal_training') {
    const already = await tx
      .selectFrom('attendance_attempts')
      .select('id')
      .where('membership_id', '=', chosen.id)
      .where('result', '=', 'granted')
      .where('consumed_visit', '=', true)
      .where(sql<boolean>`(occurred_at at time zone 'Europe/Belgrade')::date = public.club_today()`)
      .executeTakeFirst();
    // Re-entry on the same day does not consume another visit (DECISIONS A3).
    if (!already) {
      await tx
        .updateTable('memberships')
        .set((eb) => ({ visits_used: eb('visits_used', '+', 1) }))
        .where('id', '=', chosen.id)
        .execute();
      consumedVisit = true;
      chosen.visits_used += 1;
      chosen.visits_remaining = chosen.visit_limit - chosen.visits_used;
    }
  }

  const warnings: AccessResultDto['warnings'] =
    chosen.balance > 0 ? [{ code: 'DEBT', amount: chosen.balance, currency: chosen.currency }] : [];
  return {
    member,
    result: 'granted',
    reasonCode: 'OK',
    membership: chosen,
    consumedVisit,
    warnings,
  };
}

function toDto(
  attempt: { id: string; occurred_at: Date },
  d: Pick<EntryDecision, 'result' | 'reasonCode' | 'membership' | 'consumedVisit' | 'warnings'>,
  member: { id: string; member_number: string; first_name: string; last_name: string } | null,
): AccessResultDto {
  return {
    attemptId: attempt.id,
    result: d.result,
    reasonCode: d.reasonCode,
    warnings: d.warnings,
    consumedVisit: d.consumedVisit,
    member: member
      ? {
          id: member.id,
          memberNumber: member.member_number,
          firstName: member.first_name,
          lastName: member.last_name,
        }
      : null,
    membership: d.membership
      ? {
          id: d.membership.id,
          planName: d.membership.plan_name ?? '-',
          displayStatus: d.membership.display_status as MembershipDisplayStatus,
          endDate: d.membership.end_date,
          visitsRemaining: d.membership.visits_remaining,
        }
      : null,
    occurredAt: new Date(attempt.occurred_at).toISOString(),
  };
}

async function recordAttempt(
  tx: Tx,
  input: {
    memberId: string | null;
    jti: string | null;
    source: 'qr' | 'manual' | 'override' | 'self_scan';
    decision: Pick<EntryDecision, 'result' | 'reasonCode' | 'membership' | 'consumedVisit'>;
    terminalId: string;
    actor: Actor;
    overrideReason?: string;
  },
) {
  return tx
    .insertInto('attendance_attempts')
    .values({
      member_id: input.memberId,
      jti: input.jti,
      source: input.source,
      result: input.decision.result,
      reason_code: input.decision.reasonCode,
      membership_id: input.decision.membership?.id ?? null,
      consumed_visit: input.decision.consumedVisit,
      terminal_id: input.terminalId,
      performed_by: input.actor.userId,
      override_reason: input.overrideReason ?? null,
    })
    .returning(['id', 'occurred_at'])
    .executeTakeFirstOrThrow();
}

export function createAccessService(db: Kysely<DB>, secret: string) {
  return {
    /** Member asks for a QR token. Refused (422) when entry would be denied anyway. */
    async issue(actor: Actor, ttlSeconds: number, kind: 'live' | 'offline' = 'live') {
      return withStaffTx(db, async (tx) => {
        const member = await tx
          .selectFrom('members')
          .select('id')
          .where('user_id', '=', actor.userId)
          .executeTakeFirst();
        if (!member)
          throw new AppError('BUSINESS_RULE', 'errors.access.not_linked', [
            { reason: 'MEMBER_NOT_LINKED' },
          ]);
        const decision = await evaluateEntry(tx, member.id, { dryRun: true });
        if (decision.result === 'denied') {
          throw new AppError(
            'BUSINESS_RULE',
            `errors.access.${decision.reasonCode.toLowerCase()}`,
            [{ reason: decision.reasonCode }],
          );
        }
        const { token, jti } = issueToken(secret);
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
        // At most one spare offline pass per member: a new one revokes the previous unused one.
        if (kind === 'offline')
          await tx
            .deleteFrom('access_tokens')
            .where('member_id', '=', member.id)
            .where('kind', '=', 'offline')
            .where('consumed_at', 'is', null)
            .execute();
        await tx
          .insertInto('access_tokens')
          .values({ jti, member_id: member.id, expires_at: expiresAt, kind })
          .execute();
        // Opportunistic cleanup of old tokens (bounded; never blocks issuing).
        if (Math.random() < 0.05) {
          await sql`delete from public.access_tokens where jti in (
            select jti from public.access_tokens where expires_at < now() - interval '1 day' limit 500)`.execute(
            tx,
          );
        }
        return {
          token,
          expiresAt: expiresAt.toISOString(),
          refreshInSec: Math.max(10, Math.floor(ttlSeconds * 0.75)),
        };
      });
    },

    /** Reception scans a QR. Every attempt - valid or not - is recorded. */
    async validate(
      actor: Actor,
      token: string,
      terminalId: string,
      locale: string,
    ): Promise<AccessResultDto> {
      return withStaffTx(db, async (tx) => {
        const jti = verifyToken(secret, token);
        const denyToken = async (reasonCode: AccessReasonCode, memberId: string | null) => {
          const member = memberId
            ? await tx
                .selectFrom('members')
                .select(['id', 'member_number', 'first_name', 'last_name'])
                .where('id', '=', memberId)
                .executeTakeFirst()
            : null;
          const decision = {
            result: 'denied' as const,
            reasonCode,
            membership: null,
            consumedVisit: false,
            warnings: [],
          };
          const attempt = await recordAttempt(tx, {
            memberId,
            jti,
            source: 'qr',
            decision,
            terminalId,
            actor,
          });
          return toDto(attempt, decision, member ?? null);
        };
        if (!jti) return denyToken('TOKEN_INVALID', null);

        // Atomic single use: only one transaction can flip consumed_at for a valid, unexpired token.
        const consumed = await tx
          .updateTable('access_tokens')
          .set({ consumed_at: new Date() })
          .where('jti', '=', jti)
          .where('consumed_at', 'is', null)
          .where('expires_at', '>', new Date())
          .returning('member_id')
          .executeTakeFirst();

        if (!consumed) {
          const row = await tx
            .selectFrom('access_tokens')
            .select(['member_id', 'consumed_at'])
            .where('jti', '=', jti)
            .executeTakeFirst();
          if (!row) return denyToken('TOKEN_INVALID', null);
          if (row.consumed_at) {
            // Scanner double-read at the same desk: return the first result instead of "reused".
            const first = await tx
              .selectFrom('attendance_attempts')
              .selectAll()
              .where('jti', '=', jti)
              .orderBy('occurred_at')
              .executeTakeFirst();
            if (
              first &&
              first.performed_by === actor.userId &&
              first.terminal_id === terminalId &&
              Date.now() - new Date(first.occurred_at).getTime() < DOUBLE_SCAN_GRACE_MS
            ) {
              const replay = await evaluateEntry(tx, row.member_id, { dryRun: true, locale });
              return toDto(
                first,
                {
                  result: first.result,
                  reasonCode: first.reason_code as AccessReasonCode,
                  membership: replay.membership,
                  consumedVisit: first.consumed_visit,
                  warnings: replay.warnings,
                },
                replay.member,
              );
            }
            return denyToken('TOKEN_REUSED', row.member_id);
          }
          return denyToken('TOKEN_EXPIRED', row.member_id);
        }

        const decision = await evaluateEntry(tx, consumed.member_id, { locale });
        const attempt = await recordAttempt(tx, {
          memberId: consumed.member_id,
          jti,
          source: 'qr',
          decision,
          terminalId,
          actor,
        });
        return toDto(attempt, decision, decision.member);
      });
    },

    /**
     * F13-6: the member scanned the door code (entry screen) with the app. Same rules as at the
     * desk; the code must be fresh and from the gym the app is working in.
     */
    async selfScan(actor: Actor, token: string, locale: string): Promise<AccessResultDto> {
      const door = verifyKioskToken(secret, token);
      if (door.clubId !== currentClubId())
        throw new AppError('BUSINESS_RULE', 'errors.kiosk.other_gym');
      return withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        const decision = await evaluateEntry(tx, memberId, { locale });
        const attempt = await recordAttempt(tx, {
          memberId,
          jti: null,
          source: 'self_scan',
          decision,
          terminalId: door.terminalId,
          actor,
        });
        return toDto(attempt, decision, decision.member);
      });
    },

    /** Member without a phone / offline: reception checks them in by search. Same rules apply. */
    async manual(
      actor: Actor,
      memberId: string,
      terminalId: string,
      locale: string,
    ): Promise<AccessResultDto> {
      return withStaffTx(db, async (tx) => {
        const decision = await evaluateEntry(tx, memberId, { locale });
        const attempt = await recordAttempt(tx, {
          memberId,
          jti: null,
          source: 'manual',
          decision,
          terminalId,
          actor,
        });
        return toDto(attempt, decision, decision.member);
      });
    },

    /** Authorized manual approval despite a denial. Never consumes a visit; reason + audit required. */
    async override(
      actor: Actor,
      req: Request,
      memberId: string,
      terminalId: string,
      reason: string,
      locale: string,
    ) {
      return withStaffTx(db, async (tx) => {
        const info = await evaluateEntry(tx, memberId, { dryRun: true, locale });
        const decision = {
          result: 'granted' as const,
          reasonCode: 'OVERRIDE' as const,
          membership: info.membership,
          consumedVisit: false,
          warnings: info.warnings,
        };
        const attempt = await recordAttempt(tx, {
          memberId,
          jti: null,
          source: 'override',
          decision,
          terminalId,
          actor,
          overrideReason: reason,
        });
        await writeAudit(tx, actor, req, {
          action: 'attendance.override',
          entityType: 'member',
          entityId: memberId,
          diff: { after: { reason, attemptId: attempt.id, wouldHaveBeen: info.reasonCode } },
        });
        return toDto(attempt, decision, info.member);
      });
    },
  };
}
