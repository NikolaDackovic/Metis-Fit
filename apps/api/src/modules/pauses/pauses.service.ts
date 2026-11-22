import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  MyPausesDto,
  PauseAllowanceDto,
  PauseDto,
  PauseRequestBody,
  PauseStatus,
  StaffPauseBody,
} from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';
import { memberIdFor } from '../classes/bookings.service';
import { notify } from '../notifications/notify';

/**
 * F13-2 membership pause ("freeze"), docs/BUSINESS_RULES.md §2.4.
 * - Limits from the plan: `max_pauses` (how many) and `max_pause_days` (total days per membership).
 * - Only an active membership with an end date can be paused, inside its period.
 * - Approval moves the end date by the pause length; ending a pause early gives the unused days back.
 * - While an approved pause runs the membership is "paused" (membership_overview) and gives no entry.
 */
const rule = (key: string, details: unknown[] = []) =>
  new AppError('BUSINESS_RULE', `errors.pause.${key}`, details);
const days = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function today(tx: Tx) {
  return sql<{ d: string }>`select public.club_today()::text as d`
    .execute(tx)
    .then((r) => r.rows[0]!.d);
}

interface Row {
  id: string;
  membership_id: string;
  plan_name: string | null;
  starts_on: string;
  ends_on: string;
  status: PauseStatus;
  reason: string | null;
  decision_note: string | null;
  created_at: Date;
  decided_at: Date | null;
  member_id: string;
  first_name: string;
  last_name: string;
  member_number: string;
}

async function loadPauses(
  tx: Tx,
  where: { id?: string; memberId?: string; membershipId?: string; status?: PauseStatus },
  locale: string,
  withMember: boolean,
): Promise<PauseDto[]> {
  const rows = await sql<Row>`
    select mp.id, mp.membership_id, coalesce(t.name, ts.name) as plan_name,
           mp.starts_on::text, mp.ends_on::text, mp.status, mp.reason, mp.decision_note,
           mp.created_at, mp.decided_at,
           m.id as member_id, m.first_name, m.last_name, m.member_number
    from public.membership_pauses mp
    join public.memberships ms on ms.id = mp.membership_id
    join public.members m on m.id = ms.member_id
    left join public.membership_plan_translations t on t.plan_id = ms.plan_id and t.locale = ${locale}
    left join public.membership_plan_translations ts on ts.plan_id = ms.plan_id and ts.locale = 'sr'
    where true
      ${where.id ? sql`and mp.id = ${where.id}` : sql``}
      ${where.memberId ? sql`and ms.member_id = ${where.memberId}` : sql``}
      ${where.membershipId ? sql`and mp.membership_id = ${where.membershipId}` : sql``}
      ${where.status ? sql`and mp.status = ${where.status}` : sql``}
    order by mp.starts_on desc, mp.created_at desc
    limit 200`
    .execute(tx)
    .then((r) => r.rows);
  return rows.map((r) => ({
    id: r.id,
    membershipId: r.membership_id,
    planName: r.plan_name ?? '-',
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    days: days(r.starts_on, r.ends_on),
    status: r.status,
    reason: r.reason,
    decisionNote: r.decision_note,
    createdAt: new Date(r.created_at).toISOString(),
    decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
    member: withMember
      ? { id: r.member_id, name: `${r.first_name} ${r.last_name}`, memberNumber: r.member_number }
      : null,
  }));
}

interface MembershipFacts {
  id: string;
  member_id: string;
  state: string;
  display_status: string;
  end_date: string | null;
  max_pauses: number;
  max_pause_days: number;
  plan_name: string | null;
  user_id: string | null;
}

/** The membership with its plan limits, locked so two pauses cannot pass the checks together. */
async function membershipFacts(tx: Tx, membershipId: string, locale = 'sr') {
  await tx
    .selectFrom('memberships')
    .select('id')
    .where('id', '=', membershipId)
    .forUpdate()
    .execute();
  const f = await sql<MembershipFacts>`
    select o.id, o.member_id, o.state::text, o.display_status, o.end_date::text,
           p.max_pauses, p.max_pause_days, coalesce(t.name, ts.name) as plan_name, m.user_id
    from public.membership_overview o
    join public.membership_plans p on p.id = o.plan_id
    join public.members m on m.id = o.member_id
    left join public.membership_plan_translations t on t.plan_id = o.plan_id and t.locale = ${locale}
    left join public.membership_plan_translations ts on ts.plan_id = o.plan_id and ts.locale = 'sr'
    where o.id = ${membershipId}`
    .execute(tx)
    .then((r) => r.rows[0]);
  if (!f) throw notFound('membership');
  return f;
}

async function used(tx: Tx, membershipId: string, exceptId?: string) {
  const r = await sql<{ n: number; d: number }>`
    select count(*)::int as n, coalesce(sum(ends_on - starts_on + 1), 0)::int as d
    from public.membership_pauses
    where membership_id = ${membershipId} and status in ('requested', 'approved')
      ${exceptId ? sql`and id <> ${exceptId}` : sql``}`
    .execute(tx)
    .then((x) => x.rows[0]!);
  return { pauses: r.n, days: r.d };
}

/** Every rule a new (or newly approved) pause must meet. */
async function check(
  tx: Tx,
  ms: MembershipFacts,
  startsOn: string,
  endsOn: string,
  opts: { byMember: boolean; exceptId?: string },
) {
  // Only a membership that has started (not a renewal paid in advance).
  if (
    ms.state !== 'active' ||
    !ms.end_date ||
    !['active', 'expiring_soon', 'paused'].includes(ms.display_status)
  )
    throw rule('not_pausable');
  if (ms.max_pauses <= 0 || ms.max_pause_days <= 0) throw rule('not_allowed');
  const day = await today(tx);
  if (opts.byMember && startsOn < day) throw rule('past_start');
  if (startsOn > ms.end_date) throw rule('after_end');
  const u = await used(tx, ms.id, opts.exceptId);
  if (u.pauses + 1 > ms.max_pauses) throw rule('limit_count', [{ max: ms.max_pauses }]);
  const left = ms.max_pause_days - u.days;
  if (days(startsOn, endsOn) > left) throw rule('limit_days', [{ left: Math.max(0, left) }]);
}

/** Overlapping live pauses are refused by the database (exclusion constraint). */
async function guardOverlap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if ((e as { code?: string }).code === '23P01') throw rule('overlap');
    throw e;
  }
}

/**
 * Moves the end date by `delta` days, together with renewals paid in advance that follow it day
 * after day (they would overlap otherwise). Rows are moved in an order that never overlaps.
 */
async function moveEnd(tx: Tx, membershipId: string, delta: number) {
  const chain: Array<{ id: string; end: string }> = [];
  const row = await sql<{ id: string; end: string; member_id: string }>`
    select id, end_date::text as end, member_id from public.memberships where id = ${membershipId}`
    .execute(tx)
    .then((r) => r.rows[0]);
  if (!row) return;
  const memberId = row.member_id;
  chain.push({ id: row.id, end: row.end });
  for (;;) {
    const next = await sql<{ id: string; end: string }>`
      select id, end_date::text as end from public.memberships
      where member_id = ${memberId} and state <> 'cancelled' and end_date is not null
        and start_date = ${chain[chain.length - 1]!.end}::date + 1
        and id <> all(${chain.map((c) => c.id)}::uuid[])
      order by created_at limit 1`
      .execute(tx)
      .then((r) => r.rows[0]);
    if (!next) break;
    chain.push(next);
  }
  const order = delta > 0 ? [...chain].reverse() : chain;
  for (const c of order) {
    const first = c.id === membershipId;
    await sql`update public.memberships
              set end_date = end_date + ${delta}::int
                  ${first ? sql`` : sql`, start_date = start_date + ${delta}::int`}
              where id = ${c.id}`.execute(tx);
  }
}

async function tellMember(
  tx: Tx,
  ms: MembershipFacts,
  kind: 'pause_approved' | 'pause_rejected',
  p: { startsOn: string; endsOn: string },
) {
  if (!ms.user_id) return;
  const end = await sql<{ d: string | null }>`
    select end_date::text as d from public.memberships where id = ${ms.id}`
    .execute(tx)
    .then((r) => r.rows[0]?.d ?? null);
  await notify(tx, {
    userId: ms.user_id,
    kind,
    category: 'membership',
    params: { from: p.startsOn, to: p.endsOn, endDate: end },
    link: '/membership',
  });
}

export function createPauseService(db: Kysely<DB>) {
  const one = async (tx: Tx, id: string, locale: string, withMember: boolean) => {
    const [p] = await loadPauses(tx, { id }, locale, withMember);
    if (!p) throw notFound('pause');
    return p;
  };
  const lockPause = async (tx: Tx, id: string) => {
    const p = await tx
      .selectFrom('membership_pauses')
      .select(['id', 'membership_id', 'starts_on', 'ends_on', 'status'])
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    if (!p) throw notFound('pause');
    return { ...p, starts_on: String(p.starts_on), ends_on: String(p.ends_on) };
  };

  return {
    // ── Member ────────────────────────────────────────────────────────────────
    mine: (actor: Actor, locale: string): Promise<MyPausesDto> =>
      withStaffTx(db, async (tx) => {
        const m = await tx
          .selectFrom('members')
          .select('id')
          .where('user_id', '=', actor.userId)
          .executeTakeFirst();
        if (!m) return { items: [], allowance: [] };
        const items = await loadPauses(tx, { memberId: m.id }, locale, false);
        const rows = await sql<{
          id: string;
          plan_name: string | null;
          end_date: string;
          max_pauses: number;
          max_pause_days: number;
        }>`
          select o.id, coalesce(t.name, ts.name) as plan_name, o.end_date::text,
                 p.max_pauses, p.max_pause_days
          from public.membership_overview o
          join public.membership_plans p on p.id = o.plan_id
          left join public.membership_plan_translations t on t.plan_id = o.plan_id and t.locale = ${locale}
          left join public.membership_plan_translations ts on ts.plan_id = o.plan_id and ts.locale = 'sr'
          where o.member_id = ${m.id} and o.state = 'active' and o.end_date is not null
            and o.end_date >= public.club_today()
            and o.display_status in ('active', 'expiring_soon', 'paused')
            and p.max_pauses > 0 and p.max_pause_days > 0
          order by o.end_date`
          .execute(tx)
          .then((r) => r.rows);
        const allowance: PauseAllowanceDto[] = [];
        for (const r of rows) {
          const u = await used(tx, r.id);
          allowance.push({
            membershipId: r.id,
            planName: r.plan_name ?? '-',
            endDate: r.end_date,
            maxPauses: r.max_pauses,
            maxDays: r.max_pause_days,
            usedPauses: u.pauses,
            usedDays: u.days,
          });
        }
        return { items, allowance };
      }),

    request: (actor: Actor, req: Request, b: PauseRequestBody, locale: string) =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        const ms = await membershipFacts(tx, b.membershipId, locale);
        if (ms.member_id !== memberId) throw notFound('membership');
        await check(tx, ms, b.startsOn, b.endsOn, { byMember: true });
        const row = await guardOverlap(() =>
          tx
            .insertInto('membership_pauses')
            .values({
              membership_id: ms.id,
              starts_on: b.startsOn,
              ends_on: b.endsOn,
              status: 'requested',
              reason: b.reason || null,
              requested_by: actor.userId,
            })
            .returning('id')
            .executeTakeFirstOrThrow(),
        );
        await writeAudit(tx, actor, req, {
          action: 'pause.request',
          entityType: 'membership_pause',
          entityId: row.id,
          diff: { after: { membershipId: ms.id, startsOn: b.startsOn, endsOn: b.endsOn } },
        });
        return one(tx, row.id, locale, false);
      }),

    cancelMine: (actor: Actor, req: Request, id: string, locale: string) =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        const p = await lockPause(tx, id);
        const ms = await membershipFacts(tx, p.membership_id, locale);
        if (ms.member_id !== memberId) throw notFound('pause');
        if (p.status !== 'requested') throw rule('not_requested');
        await tx
          .updateTable('membership_pauses')
          .set({ status: 'cancelled' })
          .where('id', '=', id)
          .execute();
        await writeAudit(tx, actor, req, {
          action: 'pause.cancel',
          entityType: 'membership_pause',
          entityId: id,
          diff: { before: { status: 'requested' }, after: { status: 'cancelled' } },
        });
        return one(tx, id, locale, false);
      }),

    // ── Staff ─────────────────────────────────────────────────────────────────
    list: (q: { status?: PauseStatus; membershipId?: string }, locale: string) =>
      withStaffTx(db, (tx) => loadPauses(tx, q, locale, true)),

    create: (actor: Actor, req: Request, membershipId: string, b: StaffPauseBody, locale: string) =>
      withStaffTx(db, async (tx) => {
        const ms = await membershipFacts(tx, membershipId, locale);
        await check(tx, ms, b.startsOn, b.endsOn, { byMember: false });
        const row = await guardOverlap(() =>
          tx
            .insertInto('membership_pauses')
            .values({
              membership_id: ms.id,
              starts_on: b.startsOn,
              ends_on: b.endsOn,
              status: 'approved',
              reason: b.reason || null,
              requested_by: actor.userId,
              decided_by: actor.userId,
              decided_at: new Date(),
            })
            .returning('id')
            .executeTakeFirstOrThrow(),
        );
        await moveEnd(tx, ms.id, days(b.startsOn, b.endsOn));
        await writeAudit(tx, actor, req, {
          action: 'pause.create',
          entityType: 'membership_pause',
          entityId: row.id,
          diff: { after: { membershipId: ms.id, startsOn: b.startsOn, endsOn: b.endsOn } },
        });
        await tellMember(tx, ms, 'pause_approved', b);
        return one(tx, row.id, locale, true);
      }),

    approve: (actor: Actor, req: Request, id: string, note: string | undefined, locale: string) =>
      withStaffTx(db, async (tx) => {
        const p = await lockPause(tx, id);
        if (p.status !== 'requested') throw rule('not_requested');
        const ms = await membershipFacts(tx, p.membership_id, locale);
        await check(tx, ms, p.starts_on, p.ends_on, { byMember: false, exceptId: id });
        await tx
          .updateTable('membership_pauses')
          .set({
            status: 'approved',
            decided_by: actor.userId,
            decided_at: new Date(),
            decision_note: note || null,
          })
          .where('id', '=', id)
          .execute();
        await moveEnd(tx, ms.id, days(p.starts_on, p.ends_on));
        await writeAudit(tx, actor, req, {
          action: 'pause.approve',
          entityType: 'membership_pause',
          entityId: id,
          diff: { before: { status: 'requested' }, after: { status: 'approved' } },
        });
        await tellMember(tx, ms, 'pause_approved', { startsOn: p.starts_on, endsOn: p.ends_on });
        return one(tx, id, locale, true);
      }),

    reject: (actor: Actor, req: Request, id: string, note: string | undefined, locale: string) =>
      withStaffTx(db, async (tx) => {
        const p = await lockPause(tx, id);
        if (p.status !== 'requested') throw rule('not_requested');
        const ms = await membershipFacts(tx, p.membership_id, locale);
        await tx
          .updateTable('membership_pauses')
          .set({
            status: 'rejected',
            decided_by: actor.userId,
            decided_at: new Date(),
            decision_note: note || null,
          })
          .where('id', '=', id)
          .execute();
        await writeAudit(tx, actor, req, {
          action: 'pause.reject',
          entityType: 'membership_pause',
          entityId: id,
          diff: { before: { status: 'requested' }, after: { status: 'rejected' } },
        });
        await tellMember(tx, ms, 'pause_rejected', { startsOn: p.starts_on, endsOn: p.ends_on });
        return one(tx, id, locale, true);
      }),

    /**
     * Ends an approved pause today (the member is back early) or cancels one that has not
     * started; the unused days are taken back from the end date.
     */
    end: (actor: Actor, req: Request, id: string, locale: string) =>
      withStaffTx(db, async (tx) => {
        const p = await lockPause(tx, id);
        if (p.status !== 'approved') throw rule('not_approved');
        const day = await today(tx);
        if (p.ends_on < day) throw rule('already_over');
        await membershipFacts(tx, p.membership_id, locale);
        const newEnd = addDays(day, -1);
        const cancelWhole = newEnd < p.starts_on;
        const giveBack = cancelWhole ? days(p.starts_on, p.ends_on) : days(newEnd, p.ends_on) - 1;
        await tx
          .updateTable('membership_pauses')
          .set(cancelWhole ? { status: 'cancelled' } : { ends_on: newEnd })
          .where('id', '=', id)
          .execute();
        await moveEnd(tx, p.membership_id, -giveBack);
        await writeAudit(tx, actor, req, {
          action: 'pause.end',
          entityType: 'membership_pause',
          entityId: id,
          diff: {
            before: { endsOn: p.ends_on, status: 'approved' },
            after: cancelWhole ? { status: 'cancelled' } : { endsOn: newEnd },
          },
        });
        return one(tx, id, locale, true);
      }),
  };
}
