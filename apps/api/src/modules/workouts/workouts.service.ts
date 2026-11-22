import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  ClientProgressDto,
  ExerciseHistoryDto,
  GoalDto,
  GoalInput,
  MeasurementDto,
  MeasurementInput,
  ProgressDto,
  SharingDto,
  SyncResultDto,
  SyncWorkoutsBody,
  TrainerClientDto,
  WorkoutDetailDto,
  WorkoutSummaryDto,
} from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';
import { memberIdFor } from '../classes/bookings.service';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const iso = (d: Date | string) => new Date(d).toISOString();
const CONSENT_VERSION = 'v1';

// ── Summaries ─────────────────────────────────────────────────────────────────
async function summaries(
  tx: Tx,
  userId: string,
  locale: string,
  opts: { id?: string; limit?: number; offset?: number } = {},
): Promise<WorkoutSummaryDto[]> {
  const rows = await sql<{
    id: string;
    started_at: Date;
    ended_at: Date | null;
    note: string | null;
    set_count: number;
    volume: string | null;
    exercises: Array<{ id: string; name: string; sets: number }> | null;
  }>`
    select s.id, s.started_at, s.ended_at, s.note,
           (select count(*)::int from public.workout_sets w where w.session_id = s.id) as set_count,
           (select sum(coalesce(w.weight_kg, 0) * coalesce(w.reps, 0)) from public.workout_sets w
            where w.session_id = s.id) as volume,
           (select json_agg(x order by x.first) from (
              select w.exercise_id as id, coalesce(t.name, tsr.name) as name, count(*)::int as sets,
                     min(w.set_index) as first
              from public.workout_sets w
              left join public.exercise_translations t on t.exercise_id = w.exercise_id and t.locale = ${locale}
              left join public.exercise_translations tsr on tsr.exercise_id = w.exercise_id and tsr.locale = 'sr'
              where w.session_id = s.id
              group by w.exercise_id, t.name, tsr.name) x) as exercises
    from public.workout_sessions s
    where s.user_id = ${userId} and s.deleted_at is null
      and (${opts.id ?? null}::uuid is null or s.id = ${opts.id ?? null}::uuid)
    order by s.started_at desc
    limit ${opts.limit ?? 1000} offset ${opts.offset ?? 0}
  `
    .execute(tx)
    .then((r) => r.rows);
  return rows.map((r) => ({
    id: r.id,
    startedAt: iso(r.started_at),
    endedAt: r.ended_at ? iso(r.ended_at) : null,
    note: r.note,
    setCount: r.set_count,
    volumeKg: Math.round(Number(r.volume ?? 0)),
    exercises: (r.exercises ?? []).map(({ id, name, sets }) => ({ id, name, sets })),
  }));
}

// ── Progress ──────────────────────────────────────────────────────────────────
async function measurements(tx: Tx, userId: string, limit = 100): Promise<MeasurementDto[]> {
  const rows = await tx
    .selectFrom('body_measurements')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('measured_on', 'desc')
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute();
  // BMI uses the height of the same measurement, or the latest height the member entered.
  const knownHeight = await tx
    .selectFrom('body_measurements')
    .select('height_cm')
    .where('user_id', '=', userId)
    .where('height_cm', 'is not', null)
    .orderBy('measured_on', 'desc')
    .executeTakeFirst();
  return rows.map((m) => {
    const height = num(m.height_cm) ?? num(knownHeight?.height_cm);
    const weight = num(m.weight_kg);
    return {
      id: m.id,
      measuredOn: m.measured_on,
      weightKg: weight,
      bodyFatPct: num(m.body_fat_pct),
      waistCm: num(m.waist_cm),
      chestCm: num(m.chest_cm),
      hipsCm: num(m.hips_cm),
      armCm: num(m.arm_cm),
      thighCm: num(m.thigh_cm),
      heightCm: num(m.height_cm),
      muscleMassKg: num(m.muscle_mass_kg),
      bodyWaterPct: num(m.body_water_pct),
      visceralFat: m.visceral_fat,
      calfCm: num(m.calf_cm),
      bmi: weight && height ? Math.round((weight / (height / 100) ** 2) * 10) / 10 : null,
      note: m.note,
    };
  });
}

async function progress(tx: Tx, userId: string, locale: string): Promise<ProgressDto> {
  const totals = await sql<{ total: number; last30: number }>`
    select count(*)::int as total,
           count(*) filter (where started_at > now() - interval '30 days')::int as last30
    from public.workout_sessions where user_id = ${userId} and deleted_at is null
  `
    .execute(tx)
    .then((r) => r.rows[0]!);
  const weekly = await sql<{ week_start: string; workouts: number; volume: string | null }>`
    with weeks as (
      select generate_series(
        date_trunc('week', (now() at time zone 'Europe/Belgrade'))::date - 7 * 11,
        date_trunc('week', (now() at time zone 'Europe/Belgrade'))::date, interval '7 days')::date as week_start
    )
    select w.week_start::text, count(distinct s.id)::int as workouts,
           sum(coalesce(ws.weight_kg, 0) * coalesce(ws.reps, 0)) as volume
    from weeks w
    left join public.workout_sessions s on s.user_id = ${userId} and s.deleted_at is null
      and date_trunc('week', s.started_at at time zone 'Europe/Belgrade')::date = w.week_start
    left join public.workout_sets ws on ws.session_id = s.id
    group by w.week_start order by w.week_start
  `
    .execute(tx)
    .then((r) => r.rows);
  // Consecutive weeks with ≥1 workout, counting back from this week (or last week if this one is empty).
  let streak = 0;
  const counts = weekly.map((w) => w.workouts);
  let i = counts.length - 1;
  if (counts[i] === 0) i -= 1;
  for (; i >= 0 && counts[i]! > 0; i -= 1) streak += 1;

  const records = await sql<{
    exercise_id: string;
    name: string;
    tracking: ProgressDto['records'][number]['tracking'];
    best_weight: string | null;
    best_reps: number | null;
    e1rm: string | null;
    best_duration: number | null;
    best_distance: number | null;
    achieved_at: Date;
  }>`
    select w.exercise_id, coalesce(t.name, tsr.name, e.key) as name, e.tracking::text as tracking,
           max(w.weight_kg) filter (where coalesce(w.reps, 0) > 0) as best_weight,
           max(w.reps) as best_reps,
           max(round(w.weight_kg * (1 + w.reps / 30.0), 1)) filter (where w.reps between 1 and 10) as e1rm,
           max(w.duration_s) as best_duration, max(w.distance_m) as best_distance,
           max(w.completed_at) as achieved_at
    from public.workout_sets w
    join public.workout_sessions s on s.id = w.session_id and s.user_id = ${userId} and s.deleted_at is null
    join public.exercises e on e.id = w.exercise_id
    left join public.exercise_translations t on t.exercise_id = e.id and t.locale = ${locale}
    left join public.exercise_translations tsr on tsr.exercise_id = e.id and tsr.locale = 'sr'
    group by w.exercise_id, t.name, tsr.name, e.key, e.tracking
    order by max(w.completed_at) desc
    limit 30
  `
    .execute(tx)
    .then((r) => r.rows);
  const [latest] = await measurements(tx, userId, 1);
  return {
    totalWorkouts: totals.total,
    last30Days: totals.last30,
    streakWeeks: streak,
    weekly: weekly.map((w) => ({
      weekStart: w.week_start,
      workouts: w.workouts,
      volumeKg: Math.round(Number(w.volume ?? 0)),
    })),
    records: records.map((r) => ({
      exerciseId: r.exercise_id,
      name: r.name,
      tracking: r.tracking,
      bestWeightKg: num(r.best_weight),
      bestReps: r.best_reps,
      estimated1rmKg: num(r.e1rm),
      bestDurationS: r.best_duration,
      bestDistanceM: r.best_distance,
      achievedAt: iso(r.achieved_at),
    })),
    latestMeasurement: latest ?? null,
  };
}

// ── Goals ─────────────────────────────────────────────────────────────────────
async function goalCurrent(
  tx: Tx,
  userId: string,
  kind: string,
  exerciseId: string | null,
): Promise<number | null> {
  const r = await sql<{ v: string | null }>`
    select case ${kind}
      when 'body_weight' then (select weight_kg from public.body_measurements
                               where user_id = ${userId} and weight_kg is not null
                               order by measured_on desc, created_at desc limit 1)
      when 'exercise_weight' then (select max(w.weight_kg) from public.workout_sets w
                                   join public.workout_sessions s on s.id = w.session_id
                                   where s.user_id = ${userId} and s.deleted_at is null
                                     and w.exercise_id = ${exerciseId} and coalesce(w.reps, 0) > 0)
      when 'workouts_per_week' then (select count(*) from public.workout_sessions
                                     where user_id = ${userId} and deleted_at is null
                                       and started_at >= date_trunc('week', now() at time zone 'Europe/Belgrade')
                                                         at time zone 'Europe/Belgrade')
      else null end as v
  `
    .execute(tx)
    .then((x) => x.rows[0]!);
  return num(r.v);
}

async function goals(tx: Tx, userId: string, locale: string): Promise<GoalDto[]> {
  const rows = await sql<{
    id: string;
    kind: GoalDto['kind'];
    title: string | null;
    exercise_id: string | null;
    exercise_name: string | null;
    start_value: string | null;
    target_value: string | null;
    target_date: string | null;
    status: GoalDto['status'];
    achieved_at: Date | null;
    created_at: Date;
  }>`
    select g.id, g.kind, g.title, g.exercise_id, coalesce(t.name, tsr.name) as exercise_name,
           g.start_value, g.target_value, g.target_date::text, g.status, g.achieved_at, g.created_at
    from public.member_goals g
    left join public.exercise_translations t on t.exercise_id = g.exercise_id and t.locale = ${locale}
    left join public.exercise_translations tsr on tsr.exercise_id = g.exercise_id and tsr.locale = 'sr'
    where g.user_id = ${userId}
    order by (g.status = 'active') desc, g.created_at desc
  `
    .execute(tx)
    .then((r) => r.rows);
  return Promise.all(
    rows.map(async (g) => ({
      id: g.id,
      kind: g.kind,
      title: g.title,
      exerciseId: g.exercise_id,
      exerciseName: g.exercise_name,
      startValue: num(g.start_value),
      targetValue: num(g.target_value),
      currentValue: await goalCurrent(tx, userId, g.kind, g.exercise_id),
      targetDate: g.target_date,
      status: g.status,
      achievedAt: g.achieved_at ? iso(g.achieved_at) : null,
      createdAt: iso(g.created_at),
    })),
  );
}

// ── Service ───────────────────────────────────────────────────────────────────
export function createWorkoutService(db: Kysely<DB>) {
  /** Personal data belongs to the account (F12-2): works with or without a gym membership. */
  const asUser = <T>(actor: Actor, fn: (tx: Tx, userId: string) => Promise<T>) =>
    withStaffTx(db, (tx) => fn(tx, actor.userId));
  /** Gym-specific things (sharing consent, trainers) need the membership in the current gym. */
  const asMember = <T>(actor: Actor, fn: (tx: Tx, memberId: string) => Promise<T>) =>
    withStaffTx(db, async (tx) => fn(tx, await memberIdFor(tx, actor)));

  return {
    /**
     * Idempotent upsert of workouts recorded on the device (possibly offline). The same payload
     * can be sent any number of times; IDs owned by another member are rejected, never touched.
     */
    sync: (actor: Actor, body: SyncWorkoutsBody): Promise<SyncResultDto> =>
      asUser(actor, async (tx, userId) => {
        const saved: string[] = [];
        const rejected: string[] = [];
        const exerciseIds = [
          ...new Set(body.sessions.flatMap((s) => s.sets.map((x) => x.exerciseId))),
        ];
        const known = new Set(
          exerciseIds.length
            ? (
                await tx
                  .selectFrom('exercises')
                  .select('id')
                  .where('id', 'in', exerciseIds)
                  .execute()
              ).map((e) => e.id)
            : [],
        );
        for (const s of body.sessions) {
          const owner = await tx
            .selectFrom('workout_sessions')
            .select(['user_id', 'deleted_at'])
            .where('id', '=', s.id)
            .forUpdate()
            .executeTakeFirst();
          if (owner && owner.user_id !== userId) {
            rejected.push(s.id);
            continue;
          }
          if (owner?.deleted_at) {
            saved.push(s.id); // deleted on another device: accept and keep deleted
            continue;
          }
          const setIds = s.sets.map((x) => x.id);
          const foreignSet = setIds.length
            ? await tx
                .selectFrom('workout_sets')
                .select('id')
                .where('id', 'in', setIds)
                .where('session_id', '<>', s.id)
                .executeTakeFirst()
            : undefined;
          if (foreignSet || s.sets.some((x) => !known.has(x.exerciseId))) {
            rejected.push(s.id);
            continue;
          }
          const values = {
            started_at: new Date(s.startedAt),
            ended_at: s.endedAt ? new Date(s.endedAt) : null,
            note: s.note ?? null,
          };
          await tx
            .insertInto('workout_sessions')
            .values({ id: s.id, user_id: userId, ...values })
            .onConflict((oc) => oc.column('id').doUpdateSet(values))
            .execute();
          let del = tx.deleteFrom('workout_sets').where('session_id', '=', s.id);
          if (setIds.length) del = del.where('id', 'not in', setIds);
          await del.execute();
          for (const x of s.sets) {
            const v = {
              session_id: s.id,
              exercise_id: x.exerciseId,
              set_index: x.setIndex,
              reps: x.reps ?? null,
              weight_kg: x.weightKg ?? null,
              duration_s: x.durationS ?? null,
              distance_m: x.distanceM ?? null,
              rpe: x.rpe ?? null,
              completed_at: new Date(x.completedAt),
            };
            await tx
              .insertInto('workout_sets')
              .values({ id: x.id, ...v })
              .onConflict((oc) => oc.column('id').doUpdateSet(v))
              .execute();
          }
          saved.push(s.id);
        }
        const deleted = body.deletedSessionIds.length
          ? (
              await tx
                .updateTable('workout_sessions')
                .set({ deleted_at: new Date() })
                .where('id', 'in', body.deletedSessionIds)
                .where('user_id', '=', userId)
                .returning('id')
                .execute()
            ).map((r) => r.id)
          : [];
        // Unknown IDs to delete are fine (never synced): report them as deleted so the device forgets them.
        const deletedAll = [
          ...new Set([
            ...deleted,
            ...body.deletedSessionIds.filter((id) => !rejected.includes(id)),
          ]),
        ];
        return { saved, deleted: deletedAll, rejected };
      }),

    list: (actor: Actor, locale: string, page: number, pageSize: number) =>
      asUser(actor, async (tx, userId) => {
        const total = await tx
          .selectFrom('workout_sessions')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('user_id', '=', userId)
          .where('deleted_at', 'is', null)
          .executeTakeFirstOrThrow();
        return {
          items: await summaries(tx, userId, locale, {
            limit: pageSize,
            offset: (page - 1) * pageSize,
          }),
          total: Number(total.n),
        };
      }),

    detail: (actor: Actor, locale: string, id: string): Promise<WorkoutDetailDto> =>
      asUser(actor, async (tx, userId) => {
        const [s] = await summaries(tx, userId, locale, { id });
        if (!s) throw notFound('workout');
        const sets = await tx
          .selectFrom('workout_sets')
          .selectAll()
          .where('session_id', '=', id)
          .orderBy('set_index')
          .execute();
        return {
          ...s,
          sets: sets.map((x) => ({
            id: x.id,
            exerciseId: x.exercise_id,
            setIndex: x.set_index,
            reps: x.reps,
            weightKg: num(x.weight_kg),
            durationS: x.duration_s,
            distanceM: x.distance_m,
            rpe: num(x.rpe),
            completedAt: iso(x.completed_at),
          })),
        };
      }),

    progress: (actor: Actor, locale: string) => asUser(actor, (tx, m) => progress(tx, m, locale)),

    exerciseHistory: (actor: Actor, exerciseId: string): Promise<ExerciseHistoryDto> =>
      asUser(actor, async (tx, userId) => {
        const points = await sql<{
          date: string;
          w: string | null;
          r: number | null;
          e: string | null;
          d: number | null;
          m: number | null;
        }>`
          select (s.started_at at time zone 'Europe/Belgrade')::date::text as date,
                 max(w.weight_kg) filter (where coalesce(w.reps, 0) > 0) as w, max(w.reps) as r,
                 max(round(w.weight_kg * (1 + w.reps / 30.0), 1)) filter (where w.reps between 1 and 10) as e,
                 sum(w.duration_s)::int as d, sum(w.distance_m)::int as m
          from public.workout_sets w
          join public.workout_sessions s on s.id = w.session_id
          where s.user_id = ${userId} and s.deleted_at is null and w.exercise_id = ${exerciseId}
          group by 1 order by 1 desc limit 60
        `
          .execute(tx)
          .then((r) => r.rows.reverse());
        return {
          exerciseId,
          points: points.map((p) => ({
            date: p.date,
            bestWeightKg: num(p.w),
            bestReps: p.r,
            estimated1rmKg: num(p.e),
            totalDurationS: p.d,
            totalDistanceM: p.m,
          })),
        };
      }),

    // Measurements ──────────────────────────────────────────────────────────────
    measurements: (actor: Actor) => asUser(actor, (tx, m) => measurements(tx, m)),
    addMeasurement: (actor: Actor, b: MeasurementInput) =>
      asUser(actor, async (tx, userId) => {
        const existing = await tx
          .selectFrom('body_measurements')
          .select('user_id')
          .where('id', '=', b.id)
          .executeTakeFirst();
        if (existing && existing.user_id !== userId)
          throw new AppError('CONFLICT', 'errors.conflict.duplicate');
        const v = {
          measured_on: b.measuredOn,
          weight_kg: b.weightKg ?? null,
          body_fat_pct: b.bodyFatPct ?? null,
          waist_cm: b.waistCm ?? null,
          chest_cm: b.chestCm ?? null,
          hips_cm: b.hipsCm ?? null,
          arm_cm: b.armCm ?? null,
          thigh_cm: b.thighCm ?? null,
          height_cm: b.heightCm ?? null,
          muscle_mass_kg: b.muscleMassKg ?? null,
          body_water_pct: b.bodyWaterPct ?? null,
          visceral_fat: b.visceralFat ?? null,
          calf_cm: b.calfCm ?? null,
          note: b.note ?? null,
        };
        await tx
          .insertInto('body_measurements')
          .values({ id: b.id, user_id: userId, ...v })
          .onConflict((oc) => oc.column('id').doUpdateSet(v))
          .execute();
        return measurements(tx, userId);
      }),
    deleteMeasurement: (actor: Actor, id: string) =>
      asUser(actor, async (tx, userId) => {
        await tx
          .deleteFrom('body_measurements')
          .where('id', '=', id)
          .where('user_id', '=', userId)
          .execute();
        return measurements(tx, userId);
      }),

    // Goals ─────────────────────────────────────────────────────────────────────
    goals: (actor: Actor, locale: string) => asUser(actor, (tx, m) => goals(tx, m, locale)),
    addGoal: (actor: Actor, locale: string, b: GoalInput) =>
      asUser(actor, async (tx, userId) => {
        const open = await tx
          .selectFrom('member_goals')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('user_id', '=', userId)
          .where('status', '=', 'active')
          .executeTakeFirstOrThrow();
        if (Number(open.n) >= 10) throw new AppError('BUSINESS_RULE', 'errors.goal.limit_reached');
        if (b.exerciseId) {
          const e = await tx
            .selectFrom('exercises')
            .select('id')
            .where('id', '=', b.exerciseId)
            .executeTakeFirst();
          if (!e) throw notFound('exercise');
        }
        await tx
          .insertInto('member_goals')
          .values({
            user_id: userId,
            kind: b.kind,
            title: b.title ?? null,
            exercise_id: b.exerciseId ?? null,
            start_value: await goalCurrent(tx, userId, b.kind, b.exerciseId ?? null),
            target_value: b.targetValue ?? null,
            target_date: b.targetDate ?? null,
          })
          .execute();
        return goals(tx, userId, locale);
      }),
    updateGoal: (actor: Actor, locale: string, id: string, status: GoalDto['status']) =>
      asUser(actor, async (tx, userId) => {
        const r = await tx
          .updateTable('member_goals')
          .set({ status, achieved_at: status === 'achieved' ? new Date() : null })
          .where('id', '=', id)
          .where('user_id', '=', userId)
          .executeTakeFirst();
        if (Number(r.numUpdatedRows) === 0) throw notFound('goal');
        return goals(tx, userId, locale);
      }),

    // Sharing with trainers (consent) ─────────────────────────────────────────
    sharing: (actor: Actor): Promise<SharingDto> =>
      asMember(actor, async (tx, memberId) => {
        const consent = await sql<{ ok: boolean }>`
          select public.has_consent(${memberId}, 'progress_share_trainer') as ok`
          .execute(tx)
          .then((r) => r.rows[0]!.ok);
        const trainers = await tx
          .selectFrom('trainer_clients as tc')
          .innerJoin('trainers as t', 't.id', 'tc.trainer_id')
          .select(['t.id', 't.first_name', 't.last_name', 'tc.started_at'])
          .where('tc.member_id', '=', memberId)
          .where('tc.status', '=', 'active')
          .where('t.archived_at', 'is', null)
          .execute();
        return {
          shareWithTrainer: consent,
          trainers: trainers.map((t) => ({
            id: t.id,
            name: `${t.first_name} ${t.last_name}`,
            since: iso(t.started_at),
          })),
        };
      }),
    setSharing: (actor: Actor, share: boolean) =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        await tx
          .insertInto('member_consents')
          .values({
            member_id: memberId,
            type: 'progress_share_trainer',
            version: CONSENT_VERSION,
            granted: share,
            source: 'app',
          })
          .execute();
      }),

    // Trainers (staff) ─────────────────────────────────────────────────────────
    clients: (trainerId: string): Promise<TrainerClientDto[]> =>
      withStaffTx(db, (tx) => clientsOf(tx, { trainerId })),
    myClients: (actor: Actor): Promise<TrainerClientDto[]> =>
      withStaffTx(db, (tx) => clientsOf(tx, { userId: actor.userId })),

    addClient: (actor: Actor, req: Request, trainerId: string, memberId: string) =>
      withStaffTx(db, async (tx) => {
        const t = await tx
          .selectFrom('trainers')
          .select('archived_at')
          .where('id', '=', trainerId)
          .executeTakeFirst();
        if (!t || t.archived_at) throw notFound('trainer');
        const m = await tx
          .selectFrom('members')
          .select('id')
          .where('id', '=', memberId)
          .executeTakeFirst();
        if (!m) throw notFound('member');
        const row = await tx
          .insertInto('trainer_clients')
          .values({ trainer_id: trainerId, member_id: memberId, created_by: actor.userId })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, actor, req, {
          action: 'trainer_client.add',
          entityType: 'trainer_client',
          entityId: row.id,
          diff: { after: { trainerId, memberId } },
        });
        return clientsOf(tx, { trainerId });
      }),

    endClient: (actor: Actor, req: Request, id: string) =>
      withStaffTx(db, async (tx) => {
        const r = await tx
          .updateTable('trainer_clients')
          .set({ status: 'ended', ended_at: new Date() })
          .where('id', '=', id)
          .where('status', '=', 'active')
          .returning('trainer_id')
          .executeTakeFirst();
        if (!r) throw notFound('trainer_client');
        await writeAudit(tx, actor, req, {
          action: 'trainer_client.end',
          entityType: 'trainer_client',
          entityId: id,
        });
        return clientsOf(tx, { trainerId: r.trainer_id });
      }),

    /** Trainer view of a client's progress: only as the active trainer AND with consent. Audited. */
    clientProgress: (
      actor: Actor,
      req: Request,
      memberId: string,
      locale: string,
    ): Promise<ClientProgressDto> =>
      withStaffTx(db, async (tx) => {
        const ok = await sql<{ ok: boolean }>`
          select public.trainer_can_view_progress(${actor.userId}, ${memberId}) as ok`
          .execute(tx)
          .then((r) => r.rows[0]!.ok);
        if (!ok) throw new AppError('FORBIDDEN', 'errors.progress.no_access');
        const m = await tx
          .selectFrom('members')
          .select(['id', 'first_name', 'last_name', 'user_id'])
          .where('id', '=', memberId)
          .executeTakeFirstOrThrow();
        await writeAudit(tx, actor, req, {
          action: 'progress.view',
          entityType: 'member',
          entityId: memberId,
        });
        return {
          member: { id: m.id, firstName: m.first_name, lastName: m.last_name },
          // The client's personal data lives on their account; a member without the app has none.
          progress: m.user_id
            ? await progress(tx, m.user_id, locale)
            : {
                totalWorkouts: 0,
                last30Days: 0,
                streakWeeks: 0,
                weekly: [],
                records: [],
                latestMeasurement: null,
              },
          recentWorkouts: m.user_id ? await summaries(tx, m.user_id, locale, { limit: 10 }) : [],
          measurements: m.user_id ? await measurements(tx, m.user_id, 20) : [],
          goals: m.user_id ? await goals(tx, m.user_id, locale) : [],
        };
      }),
  };
}

async function clientsOf(
  tx: Tx,
  f: { trainerId?: string; userId?: string },
): Promise<TrainerClientDto[]> {
  const rows = await sql<{
    id: string;
    member_id: string;
    member_number: string;
    first_name: string;
    last_name: string;
    started_at: Date;
    shares: boolean;
  }>`
    select tc.id, m.id as member_id, m.member_number, m.first_name, m.last_name, tc.started_at,
           public.has_consent(m.id, 'progress_share_trainer') as shares
    from public.trainer_clients tc
    join public.trainers t on t.id = tc.trainer_id
    join public.members m on m.id = tc.member_id
    where tc.status = 'active'
      and (${f.trainerId ?? null}::uuid is null or tc.trainer_id = ${f.trainerId ?? null}::uuid)
      and (${f.userId ?? null}::uuid is null or t.user_id = ${f.userId ?? null}::uuid)
    order by m.last_name, m.first_name
  `
    .execute(tx)
    .then((r) => r.rows);
  return rows.map((r) => ({
    id: r.id,
    memberId: r.member_id,
    memberNumber: r.member_number,
    firstName: r.first_name,
    lastName: r.last_name,
    since: iso(r.started_at),
    sharesProgress: r.shares,
  }));
}
