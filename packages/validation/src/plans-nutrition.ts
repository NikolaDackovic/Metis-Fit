import { z } from 'zod';
import { uuid } from './common';

/** Trainer-assigned workout plans and the AI-assisted nutrition wizard. */

const optText = (max: number) =>
  z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().trim().max(max, { error: 'validation.too_long' }).nullable().optional(),
  );

// ── Workout plans ─────────────────────────────────────────────────────────────
export const workoutPlanItemInput = z.object({
  exerciseId: uuid,
  sets: z.number().int().min(1).max(20).nullable().optional(),
  reps: optText(20),
  weightNote: optText(40),
  restS: z.number().int().min(0).max(900).nullable().optional(),
  note: optText(300),
});
export const workoutPlanDayInput = z.object({
  title: z.string().trim().min(1, { error: 'validation.required' }).max(80),
  items: z.array(workoutPlanItemInput).max(40),
});
export const workoutPlanBody = z.object({
  title: z.string().trim().min(1, { error: 'validation.required' }).max(120),
  notes: optText(2000),
  isActive: z.boolean().default(true),
  days: z.array(workoutPlanDayInput).min(1, { error: 'validation.required' }).max(14),
});
export type WorkoutPlanBody = z.infer<typeof workoutPlanBody>;

export const workoutPlanDto = z.object({
  id: z.string(),
  memberId: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  trainerName: z.string().nullable(),
  updatedAt: z.string(),
  days: z.array(
    z.object({
      title: z.string(),
      items: z.array(
        z.object({
          exerciseId: z.string(),
          exerciseName: z.string(),
          tracking: z.string(),
          sets: z.number().nullable(),
          reps: z.string().nullable(),
          weightNote: z.string().nullable(),
          restS: z.number().nullable(),
          note: z.string().nullable(),
        }),
      ),
    }),
  ),
});
export type WorkoutPlanDto = z.infer<typeof workoutPlanDto>;

// ── F17-2 Program templates and the trainer dashboard ──────────────────────────
export const workoutTemplateBody = z.object({
  title: z.string().trim().min(1, { error: 'validation.required' }).max(120),
  notes: optText(2000),
  shared: z.boolean().default(false),
  days: z.array(workoutPlanDayInput).min(1, { error: 'validation.required' }).max(14),
});
export type WorkoutTemplateBody = z.infer<typeof workoutTemplateBody>;
export const workoutTemplateDto = workoutPlanDto
  .omit({ memberId: true, isActive: true, trainerName: true })
  .extend({
    shared: z.boolean(),
    /** Who wrote it (null = the gym). */
    trainerName: z.string().nullable(),
    /** The caller may edit or delete it (their own, or a manager). */
    mine: z.boolean(),
  });
export type WorkoutTemplateDto = z.infer<typeof workoutTemplateDto>;
export const assignTemplateBody = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(50),
});

export const coachDashboardDto = z.object({
  clients: z.number(),
  today: z.number(),
  activePrograms: z.number(),
  /** Active clients without an active program. */
  waiting: z.array(z.object({ memberId: z.string(), name: z.string() })),
});
export type CoachDashboardDto = z.infer<typeof coachDashboardDto>;

// ── Nutrition wizard ──────────────────────────────────────────────────────────
export const NUTRITION_GOALS = ['lose', 'maintain', 'gain'] as const;
export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
export const DIET_RESTRICTIONS = [
  'vegetarian',
  'vegan',
  'pescatarian',
  'no_fish',
  'no_eggs',
  'no_pork',
  'halal',
  'lactose_free',
  'gluten_free',
  'nut_allergy',
] as const;
export type DietRestriction = (typeof DIET_RESTRICTIONS)[number];

export const nutritionWizardBody = z.object({
  goal: z.enum(NUTRITION_GOALS),
  sex: z.enum(['male', 'female']),
  age: z.number().int().min(18, { error: 'validation.nutrition_adult_only' }).max(90),
  heightCm: z.number().min(130).max(230),
  weightKg: z.number().min(35).max(250),
  targetWeightKg: z.number().min(35).max(250).nullable().optional(),
  activity: z.enum(ACTIVITY_LEVELS),
  trainingDays: z.number().int().min(0).max(7),
  mealsPerDay: z.number().int().min(2).max(6).default(4),
  restrictions: z.array(z.enum(DIET_RESTRICTIONS)).max(10).default([]),
  /** Free text: dislikes, favourite foods, schedule ("I eat at work"). Never medical data. */
  preferences: optText(500),
  /** A medical condition, pregnancy or an eating disorder means: see a professional, no plan. */
  healthConditions: z.boolean(),
});
export type NutritionWizardBody = z.infer<typeof nutritionWizardBody>;

export const nutritionTargetsDto = z.object({
  bmr: z.number(),
  tdee: z.number(),
  kcal: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
  /** Expected weekly change at this intake (kg, negative = loss). */
  weeklyChangeKg: z.number(),
  /** Safety rule that adjusted the result, if any (translation key). */
  adjustedBy: z.string().nullable(),
});
export type NutritionTargetsDto = z.infer<typeof nutritionTargetsDto>;

/** The structured meal plan the AI must return (validated again on our side). */
export const aiMealPlan = z.object({
  summary: z.string().max(600),
  meals: z
    .array(
      z.object({
        name: z.string().max(60),
        time: z.string().max(20),
        options: z
          .array(
            z.object({
              title: z.string().max(100),
              ingredients: z.array(z.string().max(80)).max(12),
              kcal: z.number(),
              proteinG: z.number(),
            }),
          )
          .min(1)
          .max(3),
      }),
    )
    .min(2)
    .max(6),
  tips: z.array(z.string().max(200)).max(6),
});
export type AiMealPlan = z.infer<typeof aiMealPlan>;

export const nutritionPlanDto = z.object({
  id: z.string(),
  createdAt: z.string(),
  status: z.enum(['ready', 'targets_only']),
  input: nutritionWizardBody,
  targets: nutritionTargetsDto,
  meals: aiMealPlan.nullable(),
});
export type NutritionPlanDto = z.infer<typeof nutritionPlanDto>;

// ── Example plans (templates) and the trainer's individual plan ───────────────
/** Same shape for the club's example plans, a trainer's plan and an optional AI plan. */
export const mealPlanContent = aiMealPlan;
export type MealPlanContent = AiMealPlan;

export const MEAL_PLAN_SOURCES = ['trainer', 'ai', 'template'] as const;
export const myNutritionDto = z.object({
  /** Latest wizard result (targets); null until the member fills in the wizard. */
  latest: nutritionPlanDto.nullable(),
  meals: mealPlanContent.nullable(),
  source: z.enum(MEAL_PLAN_SOURCES).nullable(),
  trainerName: z.string().nullable(),
});
export type MyNutritionDto = z.infer<typeof myNutritionDto>;

export const nutritionTemplateDto = z.object({
  goal: z.enum(NUTRITION_GOALS),
  updatedAt: z.string(),
  translations: z.record(z.string(), mealPlanContent),
});
export type NutritionTemplateDto = z.infer<typeof nutritionTemplateDto>;
export const updateNutritionTemplateBody = z.object({
  translations: z.object({
    sr: mealPlanContent,
    en: mealPlanContent.optional(),
    ru: mealPlanContent.optional(),
  }),
});

export const memberNutritionPlanBody = z.object({ content: mealPlanContent });
export const memberNutritionPlanDto = z.object({
  content: mealPlanContent,
  trainerName: z.string().nullable(),
  updatedAt: z.string(),
});
export type MemberNutritionPlanDto = z.infer<typeof memberNutritionPlanDto>;

// ── Food diary ────────────────────────────────────────────────────────────────
export const FOOD_MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'validation.invalid_date' });
const macro = (max: number) => z.number().min(0).max(max).nullable().optional();
export const foodEntryInput = z.object({
  id: uuid,
  eatenOn: isoDay,
  meal: z.enum(FOOD_MEALS),
  name: z.string().trim().min(1, { error: 'validation.required' }).max(120),
  kcal: z.number().int().min(0).max(5000),
  proteinG: macro(500),
  carbsG: macro(1000),
  fatG: macro(500),
  /** F15-2: from the food catalog; the server then works out kcal and macros from the amount. */
  foodId: uuid.optional(),
  grams: z.number().gt(0).max(5000).optional(),
});
export type FoodEntryInput = z.infer<typeof foodEntryInput>;
export const foodEntryDto = z.object({
  id: z.string(),
  eatenOn: z.string(),
  meal: z.enum(FOOD_MEALS),
  name: z.string(),
  kcal: z.number(),
  proteinG: z.number().nullable(),
  carbsG: z.number().nullable(),
  fatG: z.number().nullable(),
  foodId: z.string().nullable(),
  grams: z.number().nullable(),
});
export type FoodEntryDto = z.infer<typeof foodEntryDto>;
export const foodDayQuery = z.object({ date: isoDay });
export const foodDayDto = z.object({
  date: z.string(),
  entries: z.array(foodEntryDto),
  totals: z.object({
    kcal: z.number(),
    proteinG: z.number(),
    carbsG: z.number(),
    fatG: z.number(),
  }),
  /** Daily targets from the member's latest nutrition wizard result, if any. */
  targets: nutritionTargetsDto.nullable(),
  /** Recently used foods for one-tap re-adding (most recent first, unique by name). */
  recent: z.array(foodEntryDto.omit({ id: true, eatenOn: true })),
});
export type FoodDayDto = z.infer<typeof foodDayDto>;

// ── F15-2 Food catalog (calorie counter) ───────────────────────────────────────
export const foodDto = z.object({
  id: z.string(),
  name: z.string(),
  nameEn: z.string().nullable(),
  brand: z.string().nullable(),
  barcode: z.string().nullable(),
  /** A typical serving in grams and its label (e.g. 55 g, "1 egg"). */
  servingG: z.number(),
  servingLabel: z.string().nullable(),
  kcal100: z.number(),
  protein100: z.number(),
  carbs100: z.number(),
  fat100: z.number(),
  /** The member's own food (they can delete it). */
  mine: z.boolean(),
});
export type FoodDto = z.infer<typeof foodDto>;

export const foodSearchQuery = z.object({ q: z.string().trim().max(60).optional() });
export const foodListsDto = z.object({ recent: z.array(foodDto), mine: z.array(foodDto) });
export type FoodListsDto = z.infer<typeof foodListsDto>;
export const barcodeParams = z.object({
  code: z.string().regex(/^[0-9]{6,14}$/, { error: 'validation.invalid_barcode' }),
});

const per100 = z.number().min(0).max(100);
export const foodInput = z
  .object({
    name: z.string().trim().min(1, { error: 'validation.required' }).max(120),
    brand: z.string().trim().max(80).nullable().optional(),
    barcode: z
      .string()
      .regex(/^[0-9]{6,14}$/, { error: 'validation.invalid_barcode' })
      .nullable()
      .optional(),
    servingG: z.number().gt(0).max(2000),
    servingLabel: z.string().trim().max(40).nullable().optional(),
    kcal100: z.number().min(0).max(900),
    protein100: per100,
    carbs100: per100,
    fat100: per100,
  })
  .refine((b) => b.protein100 + b.carbs100 + b.fat100 <= 100.5, {
    path: ['fat100'],
    error: 'validation.food_macros',
  });
export type FoodInput = z.infer<typeof foodInput>;

/** Copy a day's entries (or one meal) to another day, e.g. "same breakfast as yesterday". */
export const foodCopyBody = z.object({
  from: isoDay,
  to: isoDay,
  meal: z.enum(FOOD_MEALS).optional(),
});
export type FoodCopyBody = z.infer<typeof foodCopyBody>;
