import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { WorkoutPlanBody, WorkoutPlanDto } from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';
import { memberIdFor } from '../classes/bookings.service';

async function plans(tx: Tx, memberId: string, locale: string, onlyActive: boolean, id?: string) {
  const rows = await sql<{
    id: string;
    member_id: string;
    title: string;
    notes: string | null;
    is_active: boolean;
    trainer_name: string | null;
    updated_at: Date;
    days: Array<{ title: string; items: WorkoutPlanDto['days'][number]['items'] }> | null;
  }>`
    select p.id, p.member_id, p.title, p.notes, p.is_active, p.updated_at,
           t.first_name || ' ' || t.last_name as trainer_name,
           (select json_agg(json_build_object('title', d.title, 'items', coalesce((
              select json_agg(json_build_object(
                'exerciseId', i.exercise_id,
                'exerciseName', coalesce(et.name, ets.name, e.key),
                'tracking', e.tracking::text,
                'sets', i.sets, 'reps', i.reps, 'weightNote', i.weight_note,
                'restS', i.rest_s, 'note', i.note) order by i.position)
              from public.workout_plan_items i
              join public.exercises e on e.id = i.exercise_id
              left join public.exercise_translations et on et.exercise_id = e.id and et.locale = ${locale}
              left join public.exercise_translations ets on ets.exercise_id = e.id and ets.locale = 'sr'
              where i.day_id = d.id), '[]'::json)) order by d.position)
            from public.workout_plan_days d where d.plan_id = p.id) as days
    from public.workout_plans p
    left join public.trainers t on t.id = p.trainer_id
    where p.member_id = ${memberId}
      and (${!onlyActive} or p.is_active)
      and (${id ?? null}::uuid is null or p.id = ${id ?? null}::uuid)
    order by p.is_active desc, p.updated_at desc
  `
    .execute(tx)
    .then((r) => r.rows);
  return rows.map((r): WorkoutPlanDto => ({
    id: r.id,
    memberId: r.member_id,
    title: r.title,
    notes: r.notes,
    isActive: r.is_active,
    trainerName: r.trainer_name,
    updatedAt: new Date(r.updated_at).toISOString(),
    days: r.days ?? [],
  }));
}

/** Managers may plan for anyone; a trainer only for their active clients. Returns the trainer id. */
export async function assertCanPlan(
  tx: Tx,
  actor: Actor,
  memberId: string,
): Promise<string | null> {
  const trainer = await tx
    .selectFrom('trainers')
    .select('id')
    .where('user_id', '=', actor.userId)
    .where('archived_at', 'is', null)
    .executeTakeFirst();
  if (actor.permissions.has('trainers.manage')) return trainer?.id ?? null;
  if (!trainer) throw new AppError('FORBIDDEN', 'errors.plan.not_your_client');
  const client = await tx
    .selectFrom('trainer_clients')
    .select('id')
    .where('trainer_id', '=', trainer.id)
    .where('member_id', '=', memberId)
    .where('status', '=', 'active')
    .executeTakeFirst();
  if (!client) throw new AppError('FORBIDDEN', 'errors.plan.not_your_client');
  return trainer.id;
}

async function writeDays(tx: Tx, planId: string, days: WorkoutPlanBody['days']) {
  await tx.deleteFrom('workout_plan_days').where('plan_id', '=', planId).execute();
  for (const [position, day] of days.entries()) {
    const d = await tx
      .insertInto('workout_plan_days')
      .values({ plan_id: planId, position, title: day.title })
      .returning('id')
      .executeTakeFirstOrThrow();
    if (day.items.length)
      await tx
        .insertInto('workout_plan_items')
        .values(
          day.items.map((it, i) => ({
            day_id: d.id,
            position: i,
            exercise_id: it.exerciseId,
            sets: it.sets ?? null,
            reps: it.reps ?? null,
            weight_note: it.weightNote ?? null,
            rest_s: it.restS ?? null,
            note: it.note ?? null,
          })),
        )
        .execute();
  }
}

export function createWorkoutPlanService(db: Kysely<DB>) {
  return {
    mine: (actor: Actor, locale: string) =>
      withStaffTx(db, async (tx) => plans(tx, await memberIdFor(tx, actor), locale, true)),

    forMember: (actor: Actor, memberId: string, locale: string) =>
      withStaffTx(db, async (tx) => {
        await assertCanPlan(tx, actor, memberId);
        return plans(tx, memberId, locale, false);
      }),

    create: (actor: Actor, req: Request, memberId: string, b: WorkoutPlanBody, locale: string) =>
      withStaffTx(db, async (tx) => {
        const m = await tx
          .selectFrom('members')
          .select('id')
          .where('id', '=', memberId)
          .executeTakeFirst();
        if (!m) throw notFound('member');
        const trainerId = await assertCanPlan(tx, actor, memberId);
        const p = await tx
          .insertInto('workout_plans')
          .values({
            member_id: memberId,
            trainer_id: trainerId,
            title: b.title,
            notes: b.notes ?? null,
            is_active: b.isActive,
            created_by: actor.userId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeDays(tx, p.id, b.days);
        await writeAudit(tx, actor, req, {
          action: 'workout_plan.create',
          entityType: 'workout_plan',
          entityId: p.id,
          diff: { after: { memberId, title: b.title, days: b.days.length } },
        });
        return (await plans(tx, memberId, locale, false, p.id))[0]!;
      }),

    update: (actor: Actor, req: Request, planId: string, b: WorkoutPlanBody, locale: string) =>
      withStaffTx(db, async (tx) => {
        const p = await tx
          .selectFrom('workout_plans')
          .select(['member_id'])
          .where('id', '=', planId)
          .forUpdate()
          .executeTakeFirst();
        if (!p) throw notFound('workout_plan');
        await assertCanPlan(tx, actor, p.member_id);
        await tx
          .updateTable('workout_plans')
          .set({ title: b.title, notes: b.notes ?? null, is_active: b.isActive })
          .where('id', '=', planId)
          .execute();
        await writeDays(tx, planId, b.days);
        await writeAudit(tx, actor, req, {
          action: 'workout_plan.update',
          entityType: 'workout_plan',
          entityId: planId,
          diff: { after: { title: b.title, active: b.isActive, days: b.days.length } },
        });
        return (await plans(tx, p.member_id, locale, false, planId))[0]!;
      }),
  };
}
