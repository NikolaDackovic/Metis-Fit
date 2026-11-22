import { z } from 'zod';
import { uuid } from './common';

/** Self-tracking beyond the gym: activities, daily habits and the weekly overview. */

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'validation.invalid_date' });

export const ACTIVITY_KINDS = [
  'running',
  'walking',
  'cycling',
  'swimming',
  'hiking',
  'yoga',
  'team_sport',
  'martial_arts',
  'other',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_INTENSITIES = ['light', 'moderate', 'hard'] as const;

/** MET values (Compendium of Physical Activities, rounded) per intensity. */
export const ACTIVITY_MET: Record<ActivityKind, [number, number, number]> = {
  running: [7, 9.8, 11.5],
  walking: [2.8, 3.5, 5],
  cycling: [4, 6.8, 10],
  swimming: [5.8, 7, 9.8],
  hiking: [5.3, 6, 7.8],
  yoga: [2.3, 3, 4],
  team_sport: [5, 7, 9],
  martial_arts: [5.3, 7.5, 10.3],
  other: [3, 5, 7],
};

/** Approximate kcal: MET × kg × hours (70 kg when the weight is unknown). */
export function estimateKcal(
  kind: ActivityKind,
  intensity: (typeof ACTIVITY_INTENSITIES)[number],
  minutes: number,
  weightKg: number | null,
) {
  const met = ACTIVITY_MET[kind][ACTIVITY_INTENSITIES.indexOf(intensity)]!;
  return Math.round(met * (weightKg ?? 70) * (minutes / 60));
}

export const activityInput = z.object({
  id: uuid,
  kind: z.enum(ACTIVITY_KINDS),
  doneOn: isoDay,
  durationMin: z.number().int().min(1, { error: 'validation.min' }).max(1440),
  distanceKm: z.number().min(0).max(1000).nullable().optional(),
  intensity: z.enum(ACTIVITY_INTENSITIES).default('moderate'),
  note: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().trim().max(300, { error: 'validation.too_long' }).nullable().optional(),
  ),
});
export type ActivityInput = z.infer<typeof activityInput>;
export const activityDto = z.object({
  id: z.string(),
  kind: z.enum(ACTIVITY_KINDS),
  doneOn: z.string(),
  durationMin: z.number(),
  distanceKm: z.number().nullable(),
  intensity: z.enum(ACTIVITY_INTENSITIES),
  kcal: z.number().nullable(),
  note: z.string().nullable(),
});
export type ActivityDto = z.infer<typeof activityDto>;

export const checkinBody = z.object({
  waterMl: z.number().int().min(0).max(10000).nullable().optional(),
  sleepH: z.number().min(0).max(24).nullable().optional(),
  steps: z.number().int().min(0).max(100000).nullable().optional(),
  mood: z.number().int().min(1).max(5).nullable().optional(),
  energy: z.number().int().min(1).max(5).nullable().optional(),
  note: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().trim().max(300, { error: 'validation.too_long' }).nullable().optional(),
  ),
});
export type CheckinBody = z.infer<typeof checkinBody>;
export const checkinDto = z.object({
  day: z.string(),
  waterMl: z.number().nullable(),
  sleepH: z.number().nullable(),
  steps: z.number().nullable(),
  mood: z.number().nullable(),
  energy: z.number().nullable(),
  note: z.string().nullable(),
});
export type CheckinDto = z.infer<typeof checkinDto>;
export const habitGoalsDto = z.object({
  waterMl: z.number(),
  sleepH: z.number(),
  steps: z.number(),
});
export const checkinDayDto = z.object({
  checkin: checkinDto,
  goals: habitGoalsDto,
  /** Last 14 days (oldest first) for the small charts. */
  recent: z.array(checkinDto),
});
export type CheckinDayDto = z.infer<typeof checkinDayDto>;
export const dayParams = z.object({ day: isoDay });

/** Monday-to-Sunday overview of everything the member tracks. */
export const weekSummaryDto = z.object({
  from: z.string(),
  to: z.string(),
  workouts: z.number(),
  workoutMinutes: z.number(),
  activities: z.number(),
  activityMinutes: z.number(),
  activityKcal: z.number(),
  classesAttended: z.number(),
  visits: z.number(),
  avgSleepH: z.number().nullable(),
  avgSteps: z.number().nullable(),
  waterGoalDays: z.number(),
  avgKcalIn: z.number().nullable(),
  kcalTarget: z.number().nullable(),
  weightChangeKg: z.number().nullable(),
  /** Days (0 = Monday) with any workout, activity or visit. */
  activeDays: z.array(z.number()),
});
export type WeekSummaryDto = z.infer<typeof weekSummaryDto>;
export const weekQuery = z.object({ date: isoDay.optional() });
