import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import {
  estimateKcal,
  type ActivityDto,
  type ActivityInput,
  type CheckinBody,
  type CheckinDayDto,
  type CheckinDto,
  type WeekSummaryDto,
} from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { AppError } from '../../shared/errors';

const num = (v: unknown) => (v == null ? null : Number(v));

const activityDto = (r: {
  id: string;
  kind: string;
  done_on: unknown;
  duration_min: number;
  distance_km: unknown;
  intensity: string;
  kcal: number | null;
  note: string | null;
}): ActivityDto => ({
  id: r.id,
  kind: r.kind as ActivityDto['kind'],
  doneOn: String(r.done_on),
  durationMin: r.duration_min,
  distanceKm: num(r.distance_km),
  intensity: r.intensity as ActivityDto['intensity'],
  kcal: r.kcal,
  note: r.note,
});

const emptyCheckin = (day: string): CheckinDto => ({
  day,
  waterMl: null,
  sleepH: null,
  steps: null,
  mood: null,
  energy: null,
  note: null,
});
const checkinDto = (r: {
  day: unknown;
  water_ml: number | null;
  sleep_h: unknown;
  steps: number | null;
  mood: number | null;
  energy: number | null;
  note: string | null;
}): CheckinDto => ({
  day: String(r.day),
  waterMl: r.water_ml,
  sleepH: num(r.sleep_h),
  steps: r.steps,
  mood: r.mood,
  energy: r.energy,
  note: r.note,
});

async function activities(tx: Tx, userId: string) {
  const rows = await tx
    .selectFrom('activities')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('done_on', 'desc')
    .orderBy('created_at', 'desc')
    .limit(100)
    .execute();
  return rows.map(activityDto);
}

async function checkinDay(tx: Tx, userId: string, day: string): Promise<CheckinDayDto> {
  const goals = await sql<{ water: number; sleep: number; steps: number }>`
    select public.setting_int('habits.water_goal_ml', 2500) as water,
           public.setting_int('habits.sleep_goal_h', 8) as sleep,
           public.setting_int('habits.steps_goal', 8000) as steps`
    .execute(tx)
    .then((r) => r.rows[0]!);
  const rows = await tx
    .selectFrom('daily_checkins')
    .selectAll()
    .where('user_id', '=', userId)
    .where('day', '<=', day as never)
    .where('day', '>', sql<string>`${day}::date - 14` as never)
    .orderBy('day')
    .execute();
  const recent = rows.map(checkinDto);
  return {
    checkin: recent.find((c) => c.day === day) ?? emptyCheckin(day),
    goals: { waterMl: goals.water, sleepH: goals.sleep, steps: goals.steps },
    recent,
  };
}

export function createWellbeingService(db: Kysely<DB>) {
  /** Personal data belongs to the account (F12-2): works with or without a gym membership. */
  const asUser = <T>(actor: Actor, fn: (tx: Tx, userId: string) => Promise<T>) =>
    withStaffTx(db, (tx) => fn(tx, actor.userId));

  return {
    activities: (actor: Actor) => asUser(actor, activities),
    saveActivity: (actor: Actor, b: ActivityInput) =>
      asUser(actor, async (tx, userId) => {
        const existing = await tx
          .selectFrom('activities')
          .select('user_id')
          .where('id', '=', b.id)
          .executeTakeFirst();
        if (existing && existing.user_id !== userId)
          throw new AppError('CONFLICT', 'errors.conflict.duplicate');
        const weight = await tx
          .selectFrom('body_measurements')
          .select('weight_kg')
          .where('user_id', '=', userId)
          .where('weight_kg', 'is not', null)
          .orderBy('measured_on', 'desc')
          .executeTakeFirst();
        const v = {
          kind: b.kind,
          done_on: b.doneOn,
          duration_min: b.durationMin,
          distance_km: b.distanceKm ?? null,
          intensity: b.intensity,
          kcal: estimateKcal(b.kind, b.intensity, b.durationMin, num(weight?.weight_kg)),
          note: b.note ?? null,
        };
        await tx
          .insertInto('activities')
          .values({ id: b.id, user_id: userId, ...v })
          .onConflict((oc) => oc.column('id').doUpdateSet(v))
          .execute();
        return activities(tx, userId);
      }),
    deleteActivity: (actor: Actor, id: string) =>
      asUser(actor, async (tx, userId) => {
        await tx
          .deleteFrom('activities')
          .where('id', '=', id)
          .where('user_id', '=', userId)
          .execute();
        return activities(tx, userId);
      }),

    checkin: (actor: Actor, day: string) => asUser(actor, (tx, m) => checkinDay(tx, m, day)),
    saveCheckin: (actor: Actor, day: string, b: CheckinBody) =>
      asUser(actor, async (tx, userId) => {
        const { today } = await sql<{ today: string }>`select public.club_today()::text as today`
          .execute(tx)
          .then((r) => r.rows[0]!);
        if (day > today) throw new AppError('BUSINESS_RULE', 'errors.checkin.future');
        const v = {
          water_ml: b.waterMl ?? null,
          sleep_h: b.sleepH ?? null,
          steps: b.steps ?? null,
          mood: b.mood ?? null,
          energy: b.energy ?? null,
          note: b.note ?? null,
        };
        await tx
          .insertInto('daily_checkins')
          .values({ user_id: userId, day, ...v })
          .onConflict((oc) => oc.columns(['user_id', 'day']).doUpdateSet(v))
          .execute();
        return checkinDay(tx, userId, day);
      }),

    week: (actor: Actor, date?: string) =>
      asUser(actor, async (tx, userId): Promise<WeekSummaryDto> => {
        // Classes, visits and the trainer's nutrition plan belong to the membership in this gym.
        const member = await tx
          .selectFrom('members')
          .select('id')
          .where('user_id', '=', userId)
          .executeTakeFirst();
        const memberId = member?.id ?? null;
        const r = await sql<{
          from: string;
          to: string;
          workouts: number;
          workout_min: number;
          activities: number;
          activity_min: number;
          activity_kcal: number;
          classes: number;
          visits: number;
          avg_sleep: string | null;
          avg_steps: string | null;
          water_days: number;
          avg_kcal: string | null;
          kcal_target: string | null;
          weight_change: string | null;
          active_days: number[] | null;
        }>`
          with w as (
            select d - (extract(isodow from d)::int - 1) as from_d
            from (select coalesce(${date ?? null}::date, public.club_today()) as d) x
          ), b as (select from_d, from_d + 6 as to_d from w),
          bel as (select 'Europe/Belgrade'::text as tz)
          select b.from_d::text as from, b.to_d::text as to,
            (select count(*)::int from public.workout_sessions s, bel
              where s.user_id = ${userId} and s.deleted_at is null
                and (s.started_at at time zone bel.tz)::date between b.from_d and b.to_d) as workouts,
            (select coalesce(sum(extract(epoch from (s.ended_at - s.started_at)) / 60), 0)::int
               from public.workout_sessions s, bel
              where s.user_id = ${userId} and s.deleted_at is null and s.ended_at is not null
                and (s.started_at at time zone bel.tz)::date between b.from_d and b.to_d) as workout_min,
            (select count(*)::int from public.activities a
              where a.user_id = ${userId} and a.done_on between b.from_d and b.to_d) as activities,
            (select coalesce(sum(a.duration_min), 0)::int from public.activities a
              where a.user_id = ${userId} and a.done_on between b.from_d and b.to_d) as activity_min,
            (select coalesce(sum(a.kcal), 0)::int from public.activities a
              where a.user_id = ${userId} and a.done_on between b.from_d and b.to_d) as activity_kcal,
            (select count(*)::int from public.bookings bk join public.classes c on c.id = bk.class_id, bel
              where bk.member_id = ${memberId} and bk.status = 'attended'
                and (c.starts_at at time zone bel.tz)::date between b.from_d and b.to_d) as classes,
            (select count(*)::int from public.visits v, bel
              where v.member_id = ${memberId}
                and (v.started_at at time zone bel.tz)::date between b.from_d and b.to_d) as visits,
            (select round(avg(c.sleep_h), 1) from public.daily_checkins c
              where c.user_id = ${userId} and c.day between b.from_d and b.to_d) as avg_sleep,
            (select round(avg(c.steps)) from public.daily_checkins c
              where c.user_id = ${userId} and c.day between b.from_d and b.to_d) as avg_steps,
            (select count(*)::int from public.daily_checkins c
              where c.user_id = ${userId} and c.day between b.from_d and b.to_d
                and c.water_ml >= public.setting_int('habits.water_goal_ml', 2500)) as water_days,
            (select round(avg(t.kcal)) from (select f.eaten_on, sum(f.kcal) as kcal from public.food_log_entries f
              where f.user_id = ${userId} and f.eaten_on between b.from_d and b.to_d group by 1) t) as avg_kcal,
            (select (n.targets ->> 'kcal') from public.nutrition_plans n
              where n.member_id = ${memberId} order by n.created_at desc limit 1) as kcal_target,
            (select (select m1.weight_kg from public.body_measurements m1
                      where m1.user_id = ${userId} and m1.weight_kg is not null and m1.measured_on <= b.to_d
                      order by m1.measured_on desc limit 1)
                  - (select m0.weight_kg from public.body_measurements m0
                      where m0.user_id = ${userId} and m0.weight_kg is not null and m0.measured_on < b.from_d
                      order by m0.measured_on desc limit 1)) as weight_change,
            (select array_agg(distinct (day - b.from_d)::int order by (day - b.from_d)::int) from (
               select (s.started_at at time zone bel.tz)::date as day from public.workout_sessions s, bel
                where s.user_id = ${userId} and s.deleted_at is null
               union all select a.done_on from public.activities a where a.user_id = ${userId}
               union all select (v.started_at at time zone bel.tz)::date from public.visits v, bel
                where v.member_id = ${memberId}
             ) d where day between b.from_d and b.to_d) as active_days
          from b`
          .execute(tx)
          .then((x) => x.rows[0]!);
        return {
          from: r.from,
          to: r.to,
          workouts: r.workouts,
          workoutMinutes: r.workout_min,
          activities: r.activities,
          activityMinutes: r.activity_min,
          activityKcal: r.activity_kcal,
          classesAttended: r.classes,
          visits: r.visits,
          avgSleepH: num(r.avg_sleep),
          avgSteps: num(r.avg_steps),
          waterGoalDays: r.water_days,
          avgKcalIn: num(r.avg_kcal),
          kcalTarget: num(r.kcal_target),
          weightChangeKg:
            r.weight_change == null ? null : Math.round(Number(r.weight_change) * 10) / 10,
          activeDays: r.active_days ?? [],
        };
      }),
  };
}
