import { z } from 'zod';
import { isoDate, normalizeLocaleParam, pagination, uuid } from './common';

/** Exercise library, offline workout log, progress (PRs, measurements, goals), trainer sharing. */

export const EXERCISE_CATEGORIES = [
  'strength',
  'crossfit',
  'cardio',
  'boxing',
  'mobility',
] as const;
export const EXERCISE_TRACKING = ['weight_reps', 'reps', 'time', 'distance_time'] as const;
export type ExerciseTracking = (typeof EXERCISE_TRACKING)[number];

const optText = (max: number) =>
  z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().trim().max(max, { error: 'validation.too_long' }).nullable().optional(),
  );
const name = z
  .string()
  .trim()
  .min(1, { error: 'validation.required' })
  .max(80, { error: 'validation.too_long' });

// ── Library ───────────────────────────────────────────────────────────────────
export const listExercisesQuery = z.object({
  locale: normalizeLocaleParam,
  q: z.string().trim().max(60).optional(),
  category: z.enum(EXERCISE_CATEGORIES).optional(),
  muscle: z.string().max(40).optional(),
});

export const exerciseDto = z.object({
  id: z.string(),
  key: z.string(),
  category: z.enum(EXERCISE_CATEGORIES),
  tracking: z.enum(EXERCISE_TRACKING),
  name: z.string(),
  instructions: z.string().nullable(),
  videoUrl: z.string().nullable(),
  equipmentCategoryKey: z.string().nullable(),
  muscles: z.array(z.object({ key: z.string(), name: z.string(), primary: z.boolean() })),
  isActive: z.boolean(),
});
export type ExerciseDto = z.infer<typeof exerciseDto>;
export const exerciseDetailDto = exerciseDto.extend({
  machines: z.array(
    z.object({ id: z.string(), name: z.string(), roomName: z.string().nullable() }),
  ),
  translations: z
    .record(z.string(), z.object({ name: z.string(), instructions: z.string().nullable() }))
    .optional(),
  equipmentIds: z.array(z.string()).optional(),
});
export type ExerciseDetailDto = z.infer<typeof exerciseDetailDto>;

export const muscleGroupDto = z.object({ key: z.string(), name: z.string() });
export type MuscleGroupDto = z.infer<typeof muscleGroupDto>;

const exerciseTranslation = z.object({ name, instructions: optText(3000) });
export const createExerciseBody = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{2,60}$/, { error: 'validation.invalid_key' }),
  category: z.enum(EXERCISE_CATEGORIES),
  tracking: z.enum(EXERCISE_TRACKING),
  equipmentCategoryKey: z.string().max(40).nullable().optional(),
  videoUrl: z.preprocess(
    (v) => (v === '' ? null : v),
    z
      .string()
      .regex(/^https:\/\//, { error: 'validation.invalid_url' })
      .max(500)
      .nullable()
      .optional(),
  ),
  isActive: z.boolean().default(true),
  muscles: z.array(z.string().max(40)).min(1, { error: 'validation.required' }).max(6),
  equipmentIds: z.array(uuid).max(30).optional(),
  translations: z.object({
    sr: exerciseTranslation,
    en: exerciseTranslation.optional(),
    ru: exerciseTranslation.optional(),
  }),
});
export type CreateExerciseBody = z.infer<typeof createExerciseBody>;
export const updateExerciseBody = createExerciseBody.omit({ key: true }).partial();
export type UpdateExerciseBody = z.infer<typeof updateExerciseBody>;

// ── Workout log (offline sync) ────────────────────────────────────────────────
const timestamp = z.iso.datetime({ offset: true, error: 'validation.invalid_date' });
export const workoutSetInput = z.object({
  id: uuid,
  exerciseId: uuid,
  setIndex: z.number().int().min(0).max(500),
  reps: z.number().int().min(0).max(1000).nullable().optional(),
  weightKg: z.number().min(0).max(1000).nullable().optional(),
  durationS: z.number().int().min(0).max(86400).nullable().optional(),
  distanceM: z.number().int().min(0).max(1_000_000).nullable().optional(),
  rpe: z.number().min(1).max(10).nullable().optional(),
  completedAt: timestamp,
});
export type WorkoutSetInput = z.infer<typeof workoutSetInput>;
export const workoutSessionInput = z.object({
  id: uuid,
  startedAt: timestamp,
  endedAt: timestamp.nullable().optional(),
  note: optText(1000),
  /** Full set list of the session: sets missing here are removed (the device is the source). */
  sets: z.array(workoutSetInput).max(300),
});
export type WorkoutSessionInput = z.infer<typeof workoutSessionInput>;
export const syncWorkoutsBody = z.object({
  sessions: z.array(workoutSessionInput).max(20),
  deletedSessionIds: z.array(uuid).max(50).default([]),
});
export type SyncWorkoutsBody = z.infer<typeof syncWorkoutsBody>;
export const syncResultDto = z.object({
  saved: z.array(z.string()),
  deleted: z.array(z.string()),
  /** Rejected IDs (e.g. an ID already used by someone else); the device should drop them. */
  rejected: z.array(z.string()),
});
export type SyncResultDto = z.infer<typeof syncResultDto>;

export const workoutSetDto = z.object({
  id: z.string(),
  exerciseId: z.string(),
  setIndex: z.number(),
  reps: z.number().nullable(),
  weightKg: z.number().nullable(),
  durationS: z.number().nullable(),
  distanceM: z.number().nullable(),
  rpe: z.number().nullable(),
  completedAt: z.string(),
});
export const workoutSummaryDto = z.object({
  id: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  note: z.string().nullable(),
  setCount: z.number(),
  volumeKg: z.number(),
  exercises: z.array(z.object({ id: z.string(), name: z.string(), sets: z.number() })),
});
export type WorkoutSummaryDto = z.infer<typeof workoutSummaryDto>;
export const workoutDetailDto = workoutSummaryDto.extend({ sets: z.array(workoutSetDto) });
export type WorkoutDetailDto = z.infer<typeof workoutDetailDto>;
export const listWorkoutsQuery = pagination.extend({ locale: normalizeLocaleParam });

// ── Progress ──────────────────────────────────────────────────────────────────
export const personalRecordDto = z.object({
  exerciseId: z.string(),
  name: z.string(),
  tracking: z.enum(EXERCISE_TRACKING),
  bestWeightKg: z.number().nullable(),
  bestReps: z.number().nullable(),
  /** Estimated 1RM (Epley) from the best set of up to 10 reps. */
  estimated1rmKg: z.number().nullable(),
  bestDurationS: z.number().nullable(),
  bestDistanceM: z.number().nullable(),
  achievedAt: z.string(),
});
export type PersonalRecordDto = z.infer<typeof personalRecordDto>;
export const progressDto = z.object({
  totalWorkouts: z.number(),
  last30Days: z.number(),
  streakWeeks: z.number(),
  weekly: z.array(z.object({ weekStart: z.string(), workouts: z.number(), volumeKg: z.number() })),
  records: z.array(personalRecordDto),
  latestMeasurement: z.lazy(() => measurementDto).nullable(),
});
export type ProgressDto = z.infer<typeof progressDto>;
export const exerciseHistoryDto = z.object({
  exerciseId: z.string(),
  points: z.array(
    z.object({
      date: z.string(),
      bestWeightKg: z.number().nullable(),
      bestReps: z.number().nullable(),
      estimated1rmKg: z.number().nullable(),
      totalDurationS: z.number().nullable(),
      totalDistanceM: z.number().nullable(),
    }),
  ),
});
export type ExerciseHistoryDto = z.infer<typeof exerciseHistoryDto>;

const measure = (min: number, max: number) => z.number().min(min).max(max).nullable().optional();
export const measurementInput = z
  .object({
    id: uuid,
    measuredOn: isoDate,
    weightKg: measure(20, 400),
    bodyFatPct: measure(2, 75),
    waistCm: measure(30, 250),
    chestCm: measure(30, 250),
    hipsCm: measure(30, 250),
    armCm: measure(10, 100),
    thighCm: measure(20, 150),
    // InBody / extra
    heightCm: measure(100, 250),
    muscleMassKg: measure(10, 150),
    bodyWaterPct: measure(20, 80),
    visceralFat: z.number().int().min(1).max(60).nullable().optional(),
    calfCm: measure(15, 80),
    note: optText(500),
  })
  .refine(
    (m) =>
      [
        m.weightKg,
        m.bodyFatPct,
        m.waistCm,
        m.chestCm,
        m.hipsCm,
        m.armCm,
        m.thighCm,
        m.heightCm,
        m.muscleMassKg,
        m.bodyWaterPct,
        m.visceralFat,
        m.calfCm,
      ].some((v) => v != null),
    { error: 'validation.measurement_required', path: ['weightKg'] },
  );
export type MeasurementInput = z.infer<typeof measurementInput>;
export const measurementDto = z.object({
  id: z.string(),
  measuredOn: z.string(),
  weightKg: z.number().nullable(),
  bodyFatPct: z.number().nullable(),
  waistCm: z.number().nullable(),
  chestCm: z.number().nullable(),
  hipsCm: z.number().nullable(),
  armCm: z.number().nullable(),
  thighCm: z.number().nullable(),
  heightCm: z.number().nullable(),
  muscleMassKg: z.number().nullable(),
  bodyWaterPct: z.number().nullable(),
  visceralFat: z.number().nullable(),
  calfCm: z.number().nullable(),
  /** Computed from weight and the latest known height. */
  bmi: z.number().nullable(),
  note: z.string().nullable(),
});
export type MeasurementDto = z.infer<typeof measurementDto>;

export const GOAL_KINDS = [
  'body_weight',
  'exercise_weight',
  'workouts_per_week',
  'custom',
] as const;
export const goalInput = z
  .object({
    kind: z.enum(GOAL_KINDS),
    title: optText(120),
    exerciseId: uuid.nullable().optional(),
    targetValue: z.number().min(0).max(100000).nullable().optional(),
    targetDate: isoDate.nullable().optional(),
  })
  .refine((g) => g.kind !== 'exercise_weight' || g.exerciseId, {
    error: 'validation.required',
    path: ['exerciseId'],
  })
  .refine((g) => g.kind === 'custom' || g.targetValue != null, {
    error: 'validation.required',
    path: ['targetValue'],
  })
  .refine((g) => g.kind !== 'custom' || g.title, { error: 'validation.required', path: ['title'] });
export type GoalInput = z.infer<typeof goalInput>;
export const updateGoalBody = z.object({ status: z.enum(['active', 'achieved', 'abandoned']) });
export const goalDto = z.object({
  id: z.string(),
  kind: z.enum(GOAL_KINDS),
  title: z.string().nullable(),
  exerciseId: z.string().nullable(),
  exerciseName: z.string().nullable(),
  startValue: z.number().nullable(),
  targetValue: z.number().nullable(),
  /** Current value computed from the log (latest weight, best lift, workouts this week). */
  currentValue: z.number().nullable(),
  targetDate: z.string().nullable(),
  status: z.enum(['active', 'achieved', 'abandoned']),
  achievedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type GoalDto = z.infer<typeof goalDto>;

// ── Sharing with trainers ─────────────────────────────────────────────────────
export const sharingDto = z.object({
  shareWithTrainer: z.boolean(),
  trainers: z.array(z.object({ id: z.string(), name: z.string(), since: z.string() })),
});
export type SharingDto = z.infer<typeof sharingDto>;
export const updateSharingBody = z.object({ shareWithTrainer: z.boolean() });

export const trainerClientDto = z.object({
  id: z.string(),
  memberId: z.string(),
  memberNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  since: z.string(),
  sharesProgress: z.boolean(),
});
export type TrainerClientDto = z.infer<typeof trainerClientDto>;
export const addTrainerClientBody = z.object({ memberId: uuid });

export const clientProgressDto = z.object({
  member: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }),
  progress: progressDto,
  recentWorkouts: z.array(workoutSummaryDto),
  measurements: z.array(measurementDto),
  goals: z.array(goalDto),
});
export type ClientProgressDto = z.infer<typeof clientProgressDto>;
