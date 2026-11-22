import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { ChallengeBody, ChallengeDto, MyChallengeDto } from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { notFound } from '../../shared/errors';
import { categoryAllowed, pushStateFor } from '../notifications/notify';

/**
 * F13-4 challenges. Progress is counted live (Europe/Belgrade days):
 * - visits: days with a granted entry, - classes: attended group classes, - workouts: logged sessions.
 * Reaching the target gives the points once per period (ledger ref challenge:<id>:<period>).
 */
const TZ = 'Europe/Belgrade';

/** Current period and progress of active challenges, for one member or for everyone. */
const progressCte = (memberId?: string) => sql`
  ch as (
    select c.*,
           case when c.period = 'week'
                then public.club_today() - (extract(isodow from public.club_today())::int - 1)
                else date_trunc('month', public.club_today())::date end as p_start
    from public.challenges c where c.is_active
  ), bounds as (
    select ch.*,
           case when period = 'week' then p_start + 6
                else (p_start + interval '1 month' - interval '1 day')::date end as p_end,
           case when period = 'week' then to_char(p_start, 'IYYY-IW')
                else to_char(p_start, 'YYYY-MM') end as p_key
    from ch
  ), prog as (
    select b.id as challenge_id, b.club_id, b.kind, b.period, b.target, b.reward_points, b.title,
           b.is_active, b.sort_order, b.p_end, b.p_key, m.id as member_id, m.user_id,
           (case b.kind
              when 'visits' then (
                select count(distinct (a.occurred_at at time zone ${TZ})::date) from public.attendance_attempts a
                where a.member_id = m.id and a.result = 'granted'
                  and (a.occurred_at at time zone ${TZ})::date between b.p_start and b.p_end)
              when 'classes' then (
                select count(*) from public.bookings bk join public.classes cl on cl.id = bk.class_id
                where bk.member_id = m.id and bk.status = 'attended'
                  and (cl.starts_at at time zone ${TZ})::date between b.p_start and b.p_end)
              else (
                select count(*) from public.workout_sessions w
                where w.user_id = m.user_id and w.deleted_at is null
                  and (w.started_at at time zone ${TZ})::date between b.p_start and b.p_end)
            end)::int as progress
    from bounds b
    join public.members m on m.club_id = b.club_id and m.deactivated_at is null
    ${memberId ? sql`where m.id = ${memberId}` : sql``}
  )`;

/**
 * Gives the points for every challenge reached and not yet rewarded in this period, and tells the
 * member. Idempotent (unique ledger ref + notification dedupe key). Returns how many were given.
 */
export async function awardChallenges(db: Kysely<DB> | Tx, memberId?: string): Promise<number> {
  const uid = sql`m.user_id`;
  const r = await sql<{ n: number }>`
    with ${progressCte(memberId)},
    done as (
      insert into public.loyalty_ledger (club_id, member_id, points, reason, ref)
      select club_id, member_id, reward_points, 'challenge', 'challenge:' || challenge_id || ':' || p_key
      from prog where progress >= target and reward_points > 0
      on conflict (member_id, ref) where ref is not null do nothing
      returning club_id, member_id, points, ref
    ), told as (
      insert into public.notifications (club_id, user_id, kind, category, params, link, dedupe_key, push_status)
      select d.club_id, m.user_id, 'challenge_completed', 'coaching',
             jsonb_build_object('points', d.points), '/', d.ref, ${pushStateFor(uid)}
      from done d join public.members m on m.id = d.member_id
      where m.user_id is not null and ${categoryAllowed(uid, 'coaching')}
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
      returning 1
    )
    select count(*)::int as n from done`
    .execute(db)
    .then((x) => x.rows[0]!);
  return r.n;
}

const toDto = (r: {
  id: string;
  kind: string;
  period: string;
  target: number;
  reward_points: number;
  title: string | null;
  is_active: boolean;
  sort_order: number;
}): ChallengeDto => ({
  id: r.id,
  kind: r.kind as ChallengeDto['kind'],
  period: r.period as ChallengeDto['period'],
  target: r.target,
  rewardPoints: r.reward_points,
  title: r.title,
  isActive: r.is_active,
  sortOrder: r.sort_order,
});

export function createChallengeService(db: Kysely<DB>) {
  return {
    mine: (actor: Actor): Promise<MyChallengeDto[]> =>
      withStaffTx(db, async (tx) => {
        const m = await tx
          .selectFrom('members')
          .select('id')
          .where('user_id', '=', actor.userId)
          .where('deactivated_at', 'is', null)
          .executeTakeFirst();
        if (!m) return [];
        await awardChallenges(tx, m.id);
        const rows = await sql<{
          challenge_id: string;
          kind: string;
          period: string;
          target: number;
          reward_points: number;
          title: string | null;
          is_active: boolean;
          sort_order: number;
          p_end: string;
          progress: number;
        }>`with ${progressCte(m.id)}
           select *, p_end::text as p_end from prog order by sort_order, period desc, target`
          .execute(tx)
          .then((x) => x.rows);
        return rows.map((r) => ({
          ...toDto({ ...r, id: r.challenge_id }),
          progress: Math.min(r.progress, r.target),
          completed: r.progress >= r.target,
          periodEnd: r.p_end,
        }));
      }),

    list: () =>
      withStaffTx(db, (tx) =>
        tx
          .selectFrom('challenges')
          .selectAll()
          .orderBy('sort_order')
          .orderBy('created_at')
          .execute()
          .then((rows) => rows.map(toDto)),
      ),

    create: (actor: Actor, req: Request, b: ChallengeBody) =>
      withStaffTx(db, async (tx) => {
        const row = await tx
          .insertInto('challenges')
          .values({
            kind: b.kind,
            period: b.period,
            target: b.target,
            reward_points: b.rewardPoints,
            title: b.title || null,
            is_active: b.isActive,
            sort_order: b.sortOrder,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await writeAudit(tx, actor, req, {
          action: 'challenge.create',
          entityType: 'challenge',
          entityId: row.id,
          diff: { after: b },
        });
        return toDto(row);
      }),

    update: (actor: Actor, req: Request, id: string, b: ChallengeBody) =>
      withStaffTx(db, async (tx) => {
        const row = await tx
          .updateTable('challenges')
          .set({
            kind: b.kind,
            period: b.period,
            target: b.target,
            reward_points: b.rewardPoints,
            title: b.title || null,
            is_active: b.isActive,
            sort_order: b.sortOrder,
          })
          .where('id', '=', id)
          .returningAll()
          .executeTakeFirst();
        if (!row) throw notFound('challenge');
        await writeAudit(tx, actor, req, {
          action: 'challenge.update',
          entityType: 'challenge',
          entityId: id,
          diff: { after: b },
        });
        return toDto(row);
      }),

    remove: (actor: Actor, req: Request, id: string) =>
      withStaffTx(db, async (tx) => {
        const r = await tx.deleteFrom('challenges').where('id', '=', id).executeTakeFirst();
        if (!Number(r.numDeletedRows)) throw notFound('challenge');
        await writeAudit(tx, actor, req, {
          action: 'challenge.delete',
          entityType: 'challenge',
          entityId: id,
          diff: {},
        });
        return { ok: true };
      }),
  };
}
