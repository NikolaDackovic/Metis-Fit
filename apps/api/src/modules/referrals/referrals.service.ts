import { randomInt } from 'node:crypto';
import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { AdminReferralsDto, MyReferralDto, ReferralSettings } from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError } from '../../shared/errors';
import { memberIdFor } from '../classes/bookings.service';

/**
 * F13-3 "Bring a friend". Points are given by the database (payments trigger, migration 040)
 * with the friend's first recorded membership payment, so every way of paying counts.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const rule = (key: string) => new AppError('BUSINESS_RULE', `errors.referral.${key}`);
const KEYS = ['referral.enabled', 'referral.points_referrer', 'referral.points_friend'] as const;

async function settingsOf(tx: Tx): Promise<ReferralSettings> {
  const rows = await tx
    .selectFrom('settings')
    .select(['key', 'value'])
    .where('key', 'in', [...KEYS])
    .execute();
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  // Defaults until the gym saves its own (migration 041): on, 200 and 100 points.
  const int = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 ? Math.floor(v) : d);
  return {
    enabled: get('referral.enabled') !== false,
    pointsReferrer: int(get('referral.points_referrer'), 200),
    pointsFriend: int(get('referral.points_friend'), 100),
  };
}

/** The member's code, created on first use (random, unique per gym). */
async function codeFor(tx: Tx, memberId: string): Promise<string> {
  const m = await tx
    .selectFrom('members')
    .select('referral_code')
    .where('id', '=', memberId)
    .executeTakeFirstOrThrow();
  if (m.referral_code) return m.referral_code;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    const taken = await tx
      .selectFrom('members')
      .select('id')
      .where('referral_code', '=', code)
      .executeTakeFirst();
    if (taken) continue;
    await tx
      .updateTable('members')
      .set({ referral_code: code })
      .where('id', '=', memberId)
      .where('referral_code', 'is', null)
      .execute();
    const again = await tx
      .selectFrom('members')
      .select('referral_code')
      .where('id', '=', memberId)
      .executeTakeFirstOrThrow();
    return again.referral_code!;
  }
  throw new AppError('INTERNAL', 'errors.internal');
}

/** Already paid for a membership: too late to say who brought you. */
const hasPaid = (tx: Tx, memberId: string) =>
  sql<{ ok: boolean }>`
    select exists (select 1 from public.payments p
                   where p.member_id = ${memberId} and p.status = 'recorded'
                     and p.amount > 0 and p.membership_id is not null) as ok`
    .execute(tx)
    .then((r) => r.rows[0]!.ok);

const shortName = (first: string, last: string) =>
  `${first} ${last ? `${last.charAt(0)}.` : ''}`.trim();

export function createReferralService(db: Kysely<DB>) {
  return {
    mine: (actor: Actor): Promise<MyReferralDto> =>
      withStaffTx(db, async (tx) => {
        const cfg = await settingsOf(tx);
        const m = await tx
          .selectFrom('members')
          .select(['id', 'deactivated_at'])
          .where('user_id', '=', actor.userId)
          .executeTakeFirst();
        const base: MyReferralDto = {
          enabled: cfg.enabled,
          code: null,
          pointsReferrer: cfg.pointsReferrer,
          pointsFriend: cfg.pointsFriend,
          invited: [],
          earned: 0,
          canClaim: false,
          referredBy: null,
        };
        if (!m || m.deactivated_at) return base;
        const invited = await sql<{
          first_name: string;
          last_name: string;
          status: 'pending' | 'rewarded';
          referrer_points: number;
          created_at: Date;
        }>`
          select f.first_name, f.last_name, r.status, r.referrer_points, r.created_at
          from public.referrals r join public.members f on f.id = r.friend_id
          where r.referrer_id = ${m.id} order by r.created_at desc limit 50`
          .execute(tx)
          .then((r) => r.rows);
        const by = await sql<{ first_name: string; last_name: string }>`
          select rm.first_name, rm.last_name
          from public.referrals r join public.members rm on rm.id = r.referrer_id
          where r.friend_id = ${m.id}`
          .execute(tx)
          .then((r) => r.rows[0]);
        return {
          ...base,
          code: cfg.enabled ? await codeFor(tx, m.id) : null,
          invited: invited.map((i) => ({
            name: shortName(i.first_name, i.last_name),
            status: i.status,
            points: i.referrer_points,
            createdAt: new Date(i.created_at).toISOString(),
          })),
          earned: invited.reduce(
            (s, i) => s + (i.status === 'rewarded' ? i.referrer_points : 0),
            0,
          ),
          canClaim: cfg.enabled && !by && !(await hasPaid(tx, m.id)),
          referredBy: by ? shortName(by.first_name, by.last_name) : null,
        };
      }),

    claim: (actor: Actor, req: Request, code: string) =>
      withStaffTx(db, async (tx) => {
        const cfg = await settingsOf(tx);
        if (!cfg.enabled) throw rule('disabled');
        const me = await memberIdFor(tx, actor);
        await tx.selectFrom('members').select('id').where('id', '=', me).forUpdate().execute();
        const friend = await tx
          .selectFrom('members')
          .select(['id', 'deactivated_at'])
          .where('referral_code', '=', code)
          .executeTakeFirst();
        if (!friend || friend.deactivated_at) throw rule('invalid_code');
        if (friend.id === me) throw rule('own_code');
        const already = await tx
          .selectFrom('referrals')
          .select('id')
          .where('friend_id', '=', me)
          .executeTakeFirst();
        if (already) throw rule('already');
        if (await hasPaid(tx, me)) throw rule('too_late');
        const row = await tx
          .insertInto('referrals')
          .values({ referrer_id: friend.id, friend_id: me })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, actor, req, {
          action: 'referral.claim',
          entityType: 'referral',
          entityId: row.id,
          diff: { after: { referrerId: friend.id, friendId: me } },
        });
        return { ok: true };
      }),

    list: (): Promise<AdminReferralsDto> =>
      withStaffTx(db, async (tx) => {
        const rows = await sql<{
          id: string;
          status: 'pending' | 'rewarded';
          referrer_points: number;
          friend_points: number;
          created_at: Date;
          rewarded_at: Date | null;
          r_id: string;
          r_first: string;
          r_last: string;
          r_no: string;
          f_id: string;
          f_first: string;
          f_last: string;
          f_no: string;
        }>`
          select r.id, r.status, r.referrer_points, r.friend_points, r.created_at, r.rewarded_at,
                 a.id as r_id, a.first_name as r_first, a.last_name as r_last, a.member_number as r_no,
                 b.id as f_id, b.first_name as f_first, b.last_name as f_last, b.member_number as f_no
          from public.referrals r
          join public.members a on a.id = r.referrer_id
          join public.members b on b.id = r.friend_id
          order by r.created_at desc limit 100`
          .execute(tx)
          .then((r) => r.rows);
        return {
          settings: await settingsOf(tx),
          items: rows.map((r) => ({
            id: r.id,
            referrer: { id: r.r_id, name: `${r.r_first} ${r.r_last}`, memberNumber: r.r_no },
            friend: { id: r.f_id, name: `${r.f_first} ${r.f_last}`, memberNumber: r.f_no },
            status: r.status,
            referrerPoints: r.referrer_points,
            friendPoints: r.friend_points,
            createdAt: new Date(r.created_at).toISOString(),
            rewardedAt: r.rewarded_at ? new Date(r.rewarded_at).toISOString() : null,
          })),
        };
      }),

    updateSettings: (actor: Actor, req: Request, body: ReferralSettings) =>
      withStaffTx(db, async (tx) => {
        const before = await settingsOf(tx);
        const values: Record<(typeof KEYS)[number], unknown> = {
          'referral.enabled': body.enabled,
          'referral.points_referrer': body.pointsReferrer,
          'referral.points_friend': body.pointsFriend,
        };
        for (const key of KEYS) {
          const v = JSON.stringify(values[key]);
          await tx
            .insertInto('settings')
            .values({ key, value: v, updated_by: actor.userId })
            .onConflict((oc) =>
              oc.columns(['club_id', 'key']).doUpdateSet({ value: v, updated_by: actor.userId }),
            )
            .execute();
        }
        await writeAudit(tx, actor, req, {
          action: 'referral.settings',
          entityType: 'settings',
          entityId: null,
          diff: { before, after: body },
        });
        return body;
      }),
  };
}
