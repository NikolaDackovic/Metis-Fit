import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { AvailabilityBody, FreeSlotsDto } from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';
import { memberIdFor } from '../classes/bookings.service';
import { notify } from '../notifications/notify';

/**
 * F14-4 trainer availability. Free slots = the trainer's weekly windows (Europe/Belgrade) cut into
 * `slot_minutes`, minus their appointments and the classes they lead, from 2 hours ahead for 14
 * days. Booking re-checks the slot; the no-overlap constraint stops double booking.
 */
const rule = (key: string) => new AppError('BUSINESS_RULE', `errors.slot.${key}`);
const MAX_UPCOMING = 4;
const CANCEL_HOURS = 6;

async function freeSlots(tx: Tx, trainerId: string): Promise<string[]> {
  const rows = await sql<{ starts_at: Date }>`
    with days as (select public.club_today() + d as day from generate_series(0, 13) d),
    slots as (
      select ((day + a.starts_at) + make_interval(mins => n * t.slot_minutes)) at time zone 'Europe/Belgrade' as s,
             t.slot_minutes as len
      from days
      join public.trainer_availability a on a.trainer_id = ${trainerId}
           and a.weekday = extract(isodow from day)::int
      join public.trainers t on t.id = a.trainer_id
      cross join generate_series(0, 47) n
      -- time + interval wraps past midnight, so compare as intervals from 00:00.
      where (a.starts_at - time '00:00') + make_interval(mins => (n + 1) * t.slot_minutes)
            <= (a.ends_at - time '00:00')
    )
    select s as starts_at from slots
    where s > now() + interval '2 hours'
      and not exists (
        select 1 from public.trainer_appointments ap
        where ap.trainer_id = ${trainerId} and ap.status <> 'cancelled'
          and tstzrange(ap.starts_at, ap.ends_at) && tstzrange(s, s + make_interval(mins => len)))
      and not exists (
        select 1 from public.classes c
        where c.trainer_id = ${trainerId} and c.status = 'scheduled'
          and tstzrange(c.starts_at, c.ends_at) && tstzrange(s, s + make_interval(mins => len)))
    order by s`
    .execute(tx)
    .then((r) => r.rows);
  return rows.map((r) => new Date(r.starts_at).toISOString());
}

async function bookableTrainer(tx: Tx, trainerId: string) {
  const t = await tx
    .selectFrom('trainers')
    .select(['id', 'slot_minutes', 'user_id', 'first_name', 'last_name'])
    .where('id', '=', trainerId)
    .where('archived_at', 'is', null)
    .where('offers_personal_training', '=', true)
    .executeTakeFirst();
  if (!t) throw notFound('trainer');
  return t;
}

async function myTrainerId(tx: Tx, actor: Actor) {
  const t = await tx
    .selectFrom('trainers')
    .select('id')
    .where('user_id', '=', actor.userId)
    .executeTakeFirst();
  if (!t) throw new AppError('FORBIDDEN', 'errors.message.not_trainer');
  return t.id;
}

async function readWindows(tx: Tx, trainerId: string): Promise<AvailabilityBody> {
  const t = await tx
    .selectFrom('trainers')
    .select(['id', 'slot_minutes'])
    .where('id', '=', trainerId)
    .executeTakeFirst();
  if (!t) throw notFound('trainer');
  const rules = await tx
    .selectFrom('trainer_availability')
    .select(['weekday', 'starts_at', 'ends_at'])
    .where('trainer_id', '=', t.id)
    .orderBy('weekday')
    .orderBy('starts_at')
    .execute();
  return {
    slotMinutes: t.slot_minutes,
    rules: rules.map((r) => ({
      weekday: r.weekday,
      startsAt: String(r.starts_at).slice(0, 5),
      endsAt: String(r.ends_at).slice(0, 5),
    })),
  };
}

async function writeWindows(
  tx: Tx,
  actor: Actor,
  req: Request,
  trainerId: string,
  b: AvailabilityBody,
) {
  const t = await tx
    .selectFrom('trainers')
    .select('id')
    .where('id', '=', trainerId)
    .executeTakeFirst();
  if (!t) throw notFound('trainer');
  await tx
    .updateTable('trainers')
    .set({ slot_minutes: b.slotMinutes })
    .where('id', '=', t.id)
    .execute();
  await tx.deleteFrom('trainer_availability').where('trainer_id', '=', t.id).execute();
  if (b.rules.length)
    await tx
      .insertInto('trainer_availability')
      .values(
        b.rules.map((r) => ({
          trainer_id: t.id,
          weekday: r.weekday,
          starts_at: r.startsAt,
          ends_at: r.endsAt,
        })),
      )
      .execute();
  await writeAudit(tx, actor, req, {
    action: 'availability.update',
    entityType: 'trainer',
    entityId: t.id,
    diff: { after: b },
  });
  return b;
}

export function createAvailabilityService(db: Kysely<DB>) {
  return {
    // ── Trainer: my weekly windows; staff: any trainer's ──────────────────────
    mine: (actor: Actor) =>
      withStaffTx(db, async (tx) => readWindows(tx, await myTrainerId(tx, actor))),
    setMine: (actor: Actor, req: Request, b: AvailabilityBody) =>
      withStaffTx(db, async (tx) => writeWindows(tx, actor, req, await myTrainerId(tx, actor), b)),
    ofTrainer: (trainerId: string) => withStaffTx(db, (tx) => readWindows(tx, trainerId)),
    setOfTrainer: (actor: Actor, req: Request, trainerId: string, b: AvailabilityBody) =>
      withStaffTx(db, (tx) => writeWindows(tx, actor, req, trainerId, b)),

    // ── Member: free slots, book, cancel ──────────────────────────────────────
    slots: (trainerId: string): Promise<FreeSlotsDto> =>
      withStaffTx(db, async (tx) => {
        const t = await bookableTrainer(tx, trainerId);
        return { trainerId, slotMinutes: t.slot_minutes, slots: await freeSlots(tx, trainerId) };
      }),

    book: (actor: Actor, req: Request, trainerId: string, startsAt: string) =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        const t = await bookableTrainer(tx, trainerId);
        const start = new Date(startsAt);
        if (!(await freeSlots(tx, trainerId)).includes(start.toISOString())) throw rule('taken');
        const upcoming = await tx
          .selectFrom('trainer_appointments')
          .select(sql<number>`count(*)::int`.as('n'))
          .where('member_id', '=', memberId)
          .where('kind', '=', 'pt')
          .where('status', '=', 'scheduled')
          .where('starts_at', '>', new Date())
          .executeTakeFirstOrThrow();
        if (upcoming.n >= MAX_UPCOMING) throw rule('limit');
        let id: string;
        try {
          id = (
            await tx
              .insertInto('trainer_appointments')
              .values({
                trainer_id: trainerId,
                member_id: memberId,
                kind: 'pt',
                starts_at: start,
                ends_at: new Date(start.getTime() + t.slot_minutes * 60_000),
                created_by: actor.userId,
              })
              .returning('id')
              .executeTakeFirstOrThrow()
          ).id;
        } catch (e) {
          if ((e as { code?: string }).code === '23P01') throw rule('taken');
          throw e;
        }
        if (t.user_id) {
          const m = await tx
            .selectFrom('members')
            .select(['first_name', 'last_name'])
            .where('id', '=', memberId)
            .executeTakeFirstOrThrow();
          await notify(tx, {
            userId: t.user_id,
            kind: 'pt_booked',
            category: 'classes',
            params: { member: `${m.first_name} ${m.last_name}`, startsAt: start.toISOString() },
            link: '/coach',
            dedupeKey: `pt_booked:${id}`,
          });
        }
        await writeAudit(tx, actor, req, {
          action: 'appointment.self_book',
          entityType: 'trainer_appointment',
          entityId: id,
          diff: { after: { trainerId, startsAt: start.toISOString() } },
        });
        return { id };
      }),

    cancel: (actor: Actor, req: Request, appointmentId: string) =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        const a = await tx
          .selectFrom('trainer_appointments as a')
          .innerJoin('trainers as t', 't.id', 'a.trainer_id')
          .select(['a.id', 'a.starts_at', 'a.status', 't.user_id'])
          .where('a.id', '=', appointmentId)
          .where('a.member_id', '=', memberId)
          .executeTakeFirst();
        if (!a) throw notFound('appointment');
        if (a.status !== 'scheduled') throw rule('not_open');
        if (new Date(a.starts_at).getTime() - Date.now() < CANCEL_HOURS * 3600_000)
          throw rule('late');
        await tx
          .updateTable('trainer_appointments')
          .set({ status: 'cancelled' })
          .where('id', '=', a.id)
          .execute();
        if (a.user_id) {
          const m = await tx
            .selectFrom('members')
            .select(['first_name', 'last_name'])
            .where('id', '=', memberId)
            .executeTakeFirstOrThrow();
          await notify(tx, {
            userId: a.user_id,
            kind: 'pt_cancelled',
            category: 'classes',
            params: {
              member: `${m.first_name} ${m.last_name}`,
              startsAt: new Date(a.starts_at).toISOString(),
            },
            link: '/coach',
            dedupeKey: `pt_cancelled:${a.id}`,
          });
        }
        await writeAudit(tx, actor, req, {
          action: 'appointment.self_cancel',
          entityType: 'trainer_appointment',
          entityId: a.id,
          diff: { before: { status: 'scheduled' }, after: { status: 'cancelled' } },
        });
        return { ok: true };
      }),
  };
}
