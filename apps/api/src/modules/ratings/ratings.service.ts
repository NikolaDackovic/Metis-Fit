import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { PendingRatingDto, RateBody, RatingsSummaryDto } from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError } from '../../shared/errors';
import { memberIdFor } from '../classes/bookings.service';

/**
 * F13-7 ratings. A member can rate a group class they were booked on (confirmed or attended,
 * class not cancelled) or a personal session with them, after it ended and within 14 days.
 */
const WINDOW = sql`interval '14 days'`;
const rule = (key: string) => new AppError('BUSINESS_RULE', `errors.rating.${key}`);
const className = (locale: string) => sql<string | null>`coalesce(
  (select t.name from public.class_type_translations t where t.class_type_id = c.class_type_id and t.locale = ${locale}),
  (select t.name from public.class_type_translations t where t.class_type_id = c.class_type_id and t.locale = 'sr'))`;

async function pendingFor(tx: Tx, memberId: string, locale: string): Promise<PendingRatingDto[]> {
  const rows = await sql<{
    kind: 'class' | 'appointment';
    id: string;
    title: string | null;
    trainer_name: string | null;
    starts_at: Date;
  }>`
    select 'class' as kind, b.id, ${className(locale)} as title,
           tr.first_name || ' ' || tr.last_name as trainer_name, c.starts_at
    from public.bookings b
    join public.classes c on c.id = b.class_id and c.status = 'scheduled'
    left join public.trainers tr on tr.id = c.trainer_id
    where b.member_id = ${memberId} and b.status in ('confirmed', 'attended')
      and c.ends_at < now() and c.ends_at > now() - ${WINDOW}
      and not exists (select 1 from public.ratings r where r.booking_id = b.id)
    union all
    select 'appointment', a.id, null, tr.first_name || ' ' || tr.last_name, a.starts_at
    from public.trainer_appointments a
    join public.trainers tr on tr.id = a.trainer_id
    where a.member_id = ${memberId} and a.status in ('scheduled', 'done') and a.kind = 'pt'
      and a.ends_at < now() and a.ends_at > now() - ${WINDOW}
      and not exists (select 1 from public.ratings r where r.appointment_id = a.id)
    order by starts_at desc
    limit 5`
    .execute(tx)
    .then((r) => r.rows);
  return rows.map((r) => ({
    kind: r.kind,
    id: r.id,
    title: r.title,
    trainerName: r.trainer_name,
    startsAt: new Date(r.starts_at).toISOString(),
  }));
}

export function createRatingService(db: Kysely<DB>) {
  return {
    pending: (actor: Actor, locale: string) =>
      withStaffTx(db, async (tx) => {
        const m = await tx
          .selectFrom('members')
          .select('id')
          .where('user_id', '=', actor.userId)
          .where('deactivated_at', 'is', null)
          .executeTakeFirst();
        return m ? pendingFor(tx, m.id, locale) : [];
      }),

    rate: (actor: Actor, req: Request, b: RateBody) =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        // The same rules as the "to rate" list: only something the member had, recently.
        const target =
          b.kind === 'class'
            ? await sql<{ trainer_id: string | null; class_type_id: string | null }>`
                select c.trainer_id, c.class_type_id from public.bookings b
                join public.classes c on c.id = b.class_id and c.status = 'scheduled'
                where b.id = ${b.id} and b.member_id = ${memberId}
                  and b.status in ('confirmed', 'attended')
                  and c.ends_at < now() and c.ends_at > now() - ${WINDOW}`
                .execute(tx)
                .then((r) => r.rows[0])
            : await sql<{ trainer_id: string | null; class_type_id: string | null }>`
                select a.trainer_id, null::uuid as class_type_id from public.trainer_appointments a
                where a.id = ${b.id} and a.member_id = ${memberId} and a.kind = 'pt'
                  and a.status in ('scheduled', 'done')
                  and a.ends_at < now() and a.ends_at > now() - ${WINDOW}`
                .execute(tx)
                .then((r) => r.rows[0]);
        if (!target) throw rule('not_allowed');
        try {
          const row = await tx
            .insertInto('ratings')
            .values({
              member_id: memberId,
              booking_id: b.kind === 'class' ? b.id : null,
              appointment_id: b.kind === 'appointment' ? b.id : null,
              trainer_id: target.trainer_id,
              class_type_id: target.class_type_id,
              stars: b.stars,
              comment: b.comment || null,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          await writeAudit(tx, actor, req, {
            action: 'rating.create',
            entityType: 'rating',
            entityId: row.id,
            diff: { after: { kind: b.kind, stars: b.stars } },
          });
          return { id: row.id };
        } catch (e) {
          if ((e as { code?: string }).code === '23505') throw rule('already');
          throw e;
        }
      }),

    summary: (locale: string): Promise<RatingsSummaryDto> =>
      withStaffTx(db, async (tx) => {
        const num = (v: unknown) => Math.round(Number(v) * 10) / 10;
        const overall = await sql<{ avg: string | null; count: number }>`
          select avg(stars) as avg, count(*)::int as count from public.ratings`
          .execute(tx)
          .then((r) => r.rows[0]!);
        const byTrainer = await sql<{ id: string; name: string; avg: string; count: number }>`
          select tr.id, tr.first_name || ' ' || tr.last_name as name, avg(r.stars) as avg, count(*)::int as count
          from public.ratings r join public.trainers tr on tr.id = r.trainer_id
          group by tr.id order by avg(r.stars) desc, count(*) desc`
          .execute(tx)
          .then((r) => r.rows);
        const byClassType = await sql<{
          id: string;
          name: string | null;
          avg: string;
          count: number;
        }>`
          select r.class_type_id as id,
                 coalesce(
                   (select t.name from public.class_type_translations t where t.class_type_id = r.class_type_id and t.locale = ${locale}),
                   (select t.name from public.class_type_translations t where t.class_type_id = r.class_type_id and t.locale = 'sr')) as name,
                 avg(r.stars) as avg, count(*)::int as count
          from public.ratings r where r.class_type_id is not null
          group by r.class_type_id order by avg(r.stars) desc`
          .execute(tx)
          .then((r) => r.rows);
        const latest = await sql<{
          id: string;
          stars: number;
          comment: string | null;
          booking_id: string | null;
          title: string | null;
          trainer_name: string | null;
          member_name: string;
          created_at: Date;
        }>`
          select r.id, r.stars, r.comment, r.booking_id,
                 coalesce(
                   (select t.name from public.class_type_translations t where t.class_type_id = r.class_type_id and t.locale = ${locale}),
                   (select t.name from public.class_type_translations t where t.class_type_id = r.class_type_id and t.locale = 'sr')) as title,
                 tr.first_name || ' ' || tr.last_name as trainer_name,
                 m.first_name || ' ' || left(m.last_name, 1) || '.' as member_name, r.created_at
          from public.ratings r
          join public.members m on m.id = r.member_id
          left join public.trainers tr on tr.id = r.trainer_id
          order by r.created_at desc limit 50`
          .execute(tx)
          .then((r) => r.rows);
        return {
          overall: { avg: overall.avg ? num(overall.avg) : 0, count: overall.count },
          byTrainer: byTrainer.map((r) => ({
            trainerId: r.id,
            name: r.name,
            avg: num(r.avg),
            count: r.count,
          })),
          byClassType: byClassType.map((r) => ({
            classTypeId: r.id,
            name: r.name ?? '-',
            avg: num(r.avg),
            count: r.count,
          })),
          latest: latest.map((r) => ({
            id: r.id,
            stars: r.stars,
            comment: r.comment,
            kind: r.booking_id ? ('class' as const) : ('appointment' as const),
            title: r.title,
            trainerName: r.trainer_name,
            memberName: r.member_name,
            createdAt: new Date(r.created_at).toISOString(),
          })),
        };
      }),

    /** Public averages (shown from 3 ratings up), keyed by trainer id. */
    trainerAverages: () =>
      withStaffTx(db, (tx) =>
        sql<{ trainer_id: string; avg: string; count: number }>`
          select trainer_id, avg(stars) as avg, count(*)::int as count
          from public.ratings where trainer_id is not null
          group by trainer_id having count(*) >= 3`
          .execute(tx)
          .then(
            (r) =>
              new Map(
                r.rows.map((x) => [
                  x.trainer_id,
                  { avg: Math.round(Number(x.avg) * 10) / 10, count: x.count },
                ]),
              ),
          ),
      ),
  };
}
