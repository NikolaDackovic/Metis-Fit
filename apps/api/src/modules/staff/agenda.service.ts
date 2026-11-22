import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { AgendaItemDto, AppointmentBody, MyAppointmentDto } from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';
import { memberIdFor } from '../classes/bookings.service';
import { notify } from '../notifications/notify';

const iso = (d: Date | string) => new Date(d).toISOString();

export async function trainerOf(tx: Tx, userId: string) {
  return (
    (await tx.selectFrom('trainers').select('id').where('user_id', '=', userId).executeTakeFirst())
      ?.id ?? null
  );
}

/** A trainer edits only their own calendar; trainers.manage edits anyone's. */
async function assertCanPlan(tx: Tx, actor: Actor, trainerId: string) {
  if (actor.permissions.has('trainers.manage')) return;
  if ((await trainerOf(tx, actor.userId)) !== trainerId)
    throw new AppError('FORBIDDEN', 'errors.auth.forbidden');
}

async function agenda(
  tx: Tx,
  from: string,
  to: string,
  locale: string,
  trainerId?: string,
): Promise<AgendaItemDto[]> {
  const classes = await sql<{
    id: string;
    trainer_id: string | null;
    trainer_name: string | null;
    title: string;
    starts_at: Date;
    ends_at: Date;
    room_key: string | null;
    booked: number;
    capacity: number;
    status: string;
    note: string | null;
  }>`
    select c.id, c.trainer_id, t.first_name || ' ' || t.last_name as trainer_name,
           coalesce(tl.name, ts.name, '-') as title, c.starts_at, c.ends_at, c.room_key,
           (select count(*)::int from public.bookings b where b.class_id = c.id and b.status in ('confirmed', 'attended')) as booked,
           c.capacity, c.status, c.note
    from public.classes c
    left join public.trainers t on t.id = c.trainer_id
    left join public.class_type_translations tl on tl.class_type_id = c.class_type_id and tl.locale = ${locale}
    left join public.class_type_translations ts on ts.class_type_id = c.class_type_id and ts.locale = 'sr'
    where (c.starts_at at time zone 'Europe/Belgrade')::date between ${from}::date and ${to}::date
      ${trainerId ? sql`and c.trainer_id = ${trainerId}` : sql`and c.trainer_id is not null`}`
    .execute(tx)
    .then((r) => r.rows);
  let aq = tx
    .selectFrom('trainer_appointments as a')
    .innerJoin('trainers as t', 't.id', 'a.trainer_id')
    .leftJoin('members as m', 'm.id', 'a.member_id')
    .selectAll('a')
    .select([
      sql<string>`t.first_name || ' ' || t.last_name`.as('trainer_name'),
      sql<string | null>`m.first_name || ' ' || m.last_name`.as('member_name'),
    ])
    .where(
      sql<boolean>`(a.starts_at at time zone 'Europe/Belgrade')::date between ${from}::date and ${to}::date`,
    );
  if (trainerId) aq = aq.where('a.trainer_id', '=', trainerId);
  const appts = await aq.execute();
  return [
    ...classes.map((c): AgendaItemDto => ({
      id: c.id,
      type: 'class',
      trainerId: c.trainer_id,
      trainerName: c.trainer_name,
      title: c.title,
      kind: 'class',
      startsAt: iso(c.starts_at),
      endsAt: iso(c.ends_at),
      location: c.room_key,
      memberId: null,
      memberName: null,
      booked: c.booked,
      capacity: c.capacity,
      status: c.status,
      note: c.note,
    })),
    ...appts.map((a): AgendaItemDto => ({
      id: a.id,
      type: 'appointment',
      trainerId: a.trainer_id,
      trainerName: a.trainer_name,
      title: a.title ?? '',
      kind: a.kind,
      startsAt: iso(a.starts_at),
      endsAt: iso(a.ends_at),
      location: a.location,
      memberId: a.member_id,
      memberName: a.member_name,
      booked: null,
      capacity: null,
      status: a.status,
      note: a.note,
    })),
  ].sort((x, y) => x.startsAt.localeCompare(y.startsAt));
}

export function createAgendaService(db: Kysely<DB>) {
  return {
    agenda: (
      actor: Actor,
      from: string,
      to: string,
      locale: string,
      trainerId?: string,
      mine = false,
    ) =>
      withStaffTx(db, async (tx) => {
        if (to < from || Date.parse(to) - Date.parse(from) > 62 * 86_400_000)
          throw new AppError('VALIDATION_ERROR', 'errors.validation.failed', [
            { path: 'to', message: 'validation.range_too_long' },
          ]);
        if (mine) {
          const own = await trainerOf(tx, actor.userId);
          if (!own) throw new AppError('NOT_FOUND', 'errors.trainer.not_linked');
          return agenda(tx, from, to, locale, own);
        }
        return agenda(tx, from, to, locale, trainerId);
      }),
    create: (actor: Actor, req: Request, b: AppointmentBody) =>
      withStaffTx(db, async (tx) => {
        await assertCanPlan(tx, actor, b.trainerId);
        const start = new Date(b.startsAt);
        const end = new Date(start.getTime() + b.durationMin * 60_000);
        let row: { id: string };
        try {
          row = await tx
            .insertInto('trainer_appointments')
            .values({
              trainer_id: b.trainerId,
              member_id: b.memberId ?? null,
              kind: b.kind,
              title: b.title ?? null,
              starts_at: start,
              ends_at: end,
              location: b.location ?? null,
              note: b.note ?? null,
              created_by: actor.userId,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        } catch (e) {
          if ((e as { code?: string }).code === '23P01')
            throw new AppError('CONFLICT', 'errors.appointment.overlap');
          if ((e as { code?: string }).code === '23503') throw notFound('member');
          throw e;
        }
        // Tell the member (in the app / push) when the session is with them.
        if (b.memberId) {
          const m = await tx
            .selectFrom('members as m')
            .innerJoin('trainers as t', (j) => j.on('t.id', '=', b.trainerId))
            .select(['m.user_id', sql<string>`t.first_name || ' ' || t.last_name`.as('trainer')])
            .where('m.id', '=', b.memberId)
            .executeTakeFirst();
          if (m?.user_id)
            await notify(tx, {
              userId: m.user_id,
              kind: 'appointment_booked',
              category: 'classes',
              params: { trainer: m.trainer, startsAt: start.toISOString() },
              link: '/classes',
              dedupeKey: `appointment:${row.id}`,
            });
        }
        await writeAudit(tx, actor, req, {
          action: 'appointment.create',
          entityType: 'trainer_appointment',
          entityId: row.id,
          diff: { after: { trainerId: b.trainerId, startsAt: b.startsAt } },
        });
        return { id: row.id };
      }),
    setStatus: (actor: Actor, req: Request, id: string, status: string) =>
      withStaffTx(db, async (tx) => {
        const a = await tx
          .selectFrom('trainer_appointments')
          .select(['trainer_id'])
          .where('id', '=', id)
          .executeTakeFirst();
        if (!a) throw notFound('appointment');
        await assertCanPlan(tx, actor, a.trainer_id);
        await tx.updateTable('trainer_appointments').set({ status }).where('id', '=', id).execute();
        await writeAudit(tx, actor, req, {
          action: 'appointment.status',
          entityType: 'trainer_appointment',
          entityId: id,
          diff: { after: { status } },
        });
        return { ok: true as const };
      }),
    mine: (actor: Actor) =>
      withStaffTx(db, async (tx): Promise<MyAppointmentDto[]> => {
        const memberId = await memberIdFor(tx, actor);
        const rows = await tx
          .selectFrom('trainer_appointments as a')
          .innerJoin('trainers as t', 't.id', 'a.trainer_id')
          .select([
            'a.id',
            'a.kind',
            'a.title',
            'a.starts_at',
            'a.ends_at',
            'a.location',
            'a.status',
            sql<string>`t.first_name || ' ' || t.last_name`.as('trainer_name'),
          ])
          .where('a.member_id', '=', memberId)
          .where('a.status', 'in', ['scheduled'])
          .where('a.ends_at', '>', new Date())
          .orderBy('a.starts_at')
          .limit(20)
          .execute();
        return rows.map((r) => ({
          id: r.id,
          kind: r.kind as MyAppointmentDto['kind'],
          title: r.title,
          trainerName: r.trainer_name,
          startsAt: iso(r.starts_at),
          endsAt: iso(r.ends_at),
          location: r.location,
          status: r.status as MyAppointmentDto['status'],
        }));
      }),
  };
}
