import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import {
  workoutTemplateBody,
  type CoachDashboardDto,
  type WorkoutTemplateBody,
  type WorkoutTemplateDto,
} from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';
import { insertPlan } from './workout-plans.service';

/**
 * F17-2 program templates: a trainer writes a program once and assigns it to many clients (each
 * gets a normal plan, a copy they can adjust). Shared templates are visible to every trainer of
 * the gym; managers see and edit all of them.
 */
type Days = WorkoutTemplateBody['days'];

async function myTrainerId(tx: Tx, actor: Actor) {
  const t = await tx
    .selectFrom('trainers')
    .select('id')
    .where('user_id', '=', actor.userId)
    .where('archived_at', 'is', null)
    .executeTakeFirst();
  return t?.id ?? null;
}
const isManager = (actor: Actor) => actor.permissions.has('trainers.manage');

/** Adds exercise names (in the reader's language) to stored days. */
async function withNames(tx: Tx, days: Days, locale: string): Promise<WorkoutTemplateDto['days']> {
  const ids = [...new Set(days.flatMap((d) => d.items.map((i) => i.exerciseId)))];
  const names = new Map<string, { name: string; tracking: string }>();
  if (ids.length) {
    const rows = await sql<{ id: string; name: string; tracking: string }>`
      select e.id, coalesce(tl.name, ts.name, e.key) as name, e.tracking::text as tracking
      from public.exercises e
      left join public.exercise_translations tl on tl.exercise_id = e.id and tl.locale = ${locale}
      left join public.exercise_translations ts on ts.exercise_id = e.id and ts.locale = 'sr'
      where e.id = any(${ids}::uuid[])`
      .execute(tx)
      .then((r) => r.rows);
    for (const r of rows) names.set(r.id, { name: r.name, tracking: r.tracking });
  }
  return days.map((d) => ({
    title: d.title,
    items: d.items.map((i) => ({
      exerciseId: i.exerciseId,
      exerciseName: names.get(i.exerciseId)?.name ?? '?',
      tracking: names.get(i.exerciseId)?.tracking ?? 'reps',
      sets: i.sets ?? null,
      reps: i.reps ?? null,
      weightNote: i.weightNote ?? null,
      restS: i.restS ?? null,
      note: i.note ?? null,
    })),
  }));
}

async function editable(tx: Tx, actor: Actor, id: string) {
  const t = await tx
    .selectFrom('workout_templates')
    .selectAll()
    .where('id', '=', id)
    .forUpdate()
    .executeTakeFirst();
  if (!t) throw notFound('workout_template');
  if (!isManager(actor) && t.trainer_id !== (await myTrainerId(tx, actor)))
    throw new AppError('FORBIDDEN', 'errors.template.not_yours');
  return t;
}

/** Exercises in a template must exist (they are copied into plans). */
async function checkExercises(tx: Tx, days: Days) {
  const ids = [...new Set(days.flatMap((d) => d.items.map((i) => i.exerciseId)))];
  if (!ids.length) return;
  const n = await tx
    .selectFrom('exercises')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('id', 'in', ids)
    .executeTakeFirstOrThrow();
  if (Number(n.n) !== ids.length) throw new AppError('BUSINESS_RULE', 'errors.template.exercise');
}

export function createWorkoutTemplateService(db: Kysely<DB>) {
  return {
    list: (actor: Actor, locale: string): Promise<WorkoutTemplateDto[]> =>
      withStaffTx(db, async (tx) => {
        const me = await myTrainerId(tx, actor);
        let q = tx
          .selectFrom('workout_templates as w')
          .leftJoin('trainers as t', 't.id', 'w.trainer_id')
          .select([
            'w.id',
            'w.title',
            'w.notes',
            'w.days',
            'w.shared',
            'w.trainer_id',
            'w.updated_at',
            sql<string | null>`t.first_name || ' ' || t.last_name`.as('trainer_name'),
          ]);
        if (!isManager(actor))
          q = q.where((eb) =>
            eb.or([
              eb('w.shared', '=', true),
              eb('w.trainer_id', '=', me ?? '00000000-0000-0000-0000-000000000000'),
            ]),
          );
        const rows = await q.orderBy('w.title').execute();
        const out: WorkoutTemplateDto[] = [];
        for (const r of rows)
          out.push({
            id: r.id,
            title: r.title,
            notes: r.notes,
            shared: r.shared,
            trainerName: r.trainer_name,
            updatedAt: new Date(r.updated_at).toISOString(),
            mine: isManager(actor) || (me != null && r.trainer_id === me),
            days: await withNames(tx, r.days as unknown as Days, locale),
          });
        return out;
      }),

    create: (actor: Actor, req: Request, raw: WorkoutTemplateBody) =>
      withStaffTx(db, async (tx) => {
        const b = workoutTemplateBody.parse(raw);
        await checkExercises(tx, b.days);
        const trainerId = await myTrainerId(tx, actor);
        if (!trainerId && !isManager(actor))
          throw new AppError('FORBIDDEN', 'errors.message.not_trainer');
        const t = await tx
          .insertInto('workout_templates')
          .values({
            trainer_id: trainerId,
            title: b.title,
            notes: b.notes ?? null,
            shared: b.shared,
            days: JSON.stringify(b.days),
            created_by: actor.userId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, actor, req, {
          action: 'workout_template.create',
          entityType: 'workout_template',
          entityId: t.id,
          diff: { after: { title: b.title, days: b.days.length, shared: b.shared } },
        });
        return { id: t.id };
      }),

    update: (actor: Actor, req: Request, id: string, raw: WorkoutTemplateBody) =>
      withStaffTx(db, async (tx) => {
        const b = workoutTemplateBody.parse(raw);
        await editable(tx, actor, id);
        await checkExercises(tx, b.days);
        await tx
          .updateTable('workout_templates')
          .set({
            title: b.title,
            notes: b.notes ?? null,
            shared: b.shared,
            days: JSON.stringify(b.days),
          })
          .where('id', '=', id)
          .execute();
        await writeAudit(tx, actor, req, {
          action: 'workout_template.update',
          entityType: 'workout_template',
          entityId: id,
          diff: { after: { title: b.title, days: b.days.length, shared: b.shared } },
        });
        return { id };
      }),

    remove: (actor: Actor, req: Request, id: string) =>
      withStaffTx(db, async (tx) => {
        await editable(tx, actor, id);
        await tx.deleteFrom('workout_templates').where('id', '=', id).execute();
        await writeAudit(tx, actor, req, {
          action: 'workout_template.delete',
          entityType: 'workout_template',
          entityId: id,
        });
        return { ok: true };
      }),

    /** One plan (a copy) per member; a trainer only for their own active clients. */
    assign: (actor: Actor, req: Request, id: string, memberIds: string[]) =>
      withStaffTx(db, async (tx) => {
        const me = await myTrainerId(tx, actor);
        const t = await tx
          .selectFrom('workout_templates')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirst();
        if (!t || (!isManager(actor) && !t.shared && t.trainer_id !== me))
          throw notFound('workout_template');
        const days = t.days as unknown as Days;
        for (const memberId of [...new Set(memberIds)])
          await insertPlan(tx, actor, req, memberId, {
            title: t.title,
            notes: t.notes,
            isActive: true,
            days,
          });
        return { created: new Set(memberIds).size };
      }),

    /** The "Work" tab summary: clients, today's sessions, programs, who still needs one. */
    dashboard: (actor: Actor): Promise<CoachDashboardDto> =>
      withStaffTx(db, async (tx) => {
        const me = await myTrainerId(tx, actor);
        if (!me) throw new AppError('FORBIDDEN', 'errors.message.not_trainer');
        const r = await sql<{ clients: number; today: number; programs: number }>`
          select
            (select count(*)::int from public.trainer_clients c
              where c.trainer_id = ${me} and c.status = 'active') as clients,
            (select count(*)::int from public.classes c
              where c.trainer_id = ${me} and c.status = 'scheduled'
                and (c.starts_at at time zone 'Europe/Belgrade')::date = public.club_today())
            + (select count(*)::int from public.trainer_appointments a
              where a.trainer_id = ${me} and a.status = 'scheduled'
                and (a.starts_at at time zone 'Europe/Belgrade')::date = public.club_today()) as today,
            (select count(*)::int from public.workout_plans p
              join public.trainer_clients c on c.member_id = p.member_id
                and c.trainer_id = ${me} and c.status = 'active'
              where p.is_active) as programs`
          .execute(tx)
          .then((x) => x.rows[0]!);
        const waiting = await sql<{ member_id: string; name: string }>`
          select m.id as member_id, m.first_name || ' ' || m.last_name as name
          from public.trainer_clients c
          join public.members m on m.id = c.member_id and m.deactivated_at is null
          where c.trainer_id = ${me} and c.status = 'active'
            and not exists (select 1 from public.workout_plans p
                            where p.member_id = m.id and p.is_active)
          order by name limit 50`
          .execute(tx)
          .then((x) => x.rows);
        return {
          clients: r.clients,
          today: r.today,
          activePrograms: r.programs,
          waiting: waiting.map((w) => ({ memberId: w.member_id, name: w.name })),
        };
      }),
  };
}
