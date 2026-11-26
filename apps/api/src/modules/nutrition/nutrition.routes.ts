import { z } from 'zod';
import {
  foodDayDto,
  foodDayQuery,
  foodEntryInput,
  workoutTemplateBody,
  workoutTemplateDto,
  assignTemplateBody,
  coachDashboardDto,
  foodCopyBody,
  foodSearchQuery,
  foodInput,
  foodDto,
  barcodeParams,
  idParams,
  normalizeLocaleParam,
  nutritionPlanDto,
  nutritionWizardBody,
  memberNutritionPlanBody,
  memberNutritionPlanDto,
  myNutritionDto,
  NUTRITION_GOALS,
  nutritionTemplateDto,
  updateNutritionTemplateBody,
  workoutPlanBody,
  workoutPlanDto,
} from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createFoodLogService } from './food-log.service';
import { createFoodsService } from './foods.service';
import { createWorkoutTemplateService } from './workout-templates.service';
import { createMealPlanService } from './meal-plans.service';
import { createNutritionService } from './nutrition.service';
import { createWorkoutPlanService } from './workout-plans.service';

const localeQuery = z.object({ locale: normalizeLocaleParam });
const headerLocale = (h: string | undefined) => normalizeLocaleParam.parse(h?.slice(0, 2));

export const nutritionRoutes = [
  // ── Nutrition wizard ────────────────────────────────────────────────────────
  defineRoute({
    method: 'post',
    path: '/me/nutrition-plans',
    access: access.self,
    summary:
      'Nutrition wizard: safe calorie/macro targets, plus an AI example day of meals when available (max 3/day)',
    tags: ['Nutrition'],
    query: localeQuery,
    body: nutritionWizardBody,
    response: nutritionPlanDto,
    handler: async ({ actor, query, body, deps }) => ({
      status: 201,
      data: await createNutritionService(deps.db, deps.mealPlanner).create(
        actor!,
        body,
        query.locale,
      ),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/nutrition-plans/latest',
    access: access.self,
    summary: 'My latest nutrition plan',
    tags: ['Nutrition'],
    response: nutritionPlanDto.nullable(),
    handler: async ({ actor, deps }) => ({
      data: await createNutritionService(deps.db, deps.mealPlanner).latest(actor!),
    }),
  }),

  defineRoute({
    method: 'get',
    path: '/me/nutrition',
    access: access.self,
    summary:
      "My meal plan: the trainer's plan, else an AI plan (if enabled), else the club's example",
    tags: ['Nutrition'],
    query: localeQuery,
    response: myNutritionDto,
    handler: async ({ actor, query, deps }) => ({
      data: await createMealPlanService(deps.db, deps.mealPlanner).mine(actor!, query.locale),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/nutrition-templates',
    access: access.can('nutrition.manage'),
    summary: 'Example meal plans per goal (all languages)',
    tags: ['Nutrition'],
    response: z.array(nutritionTemplateDto),
    handler: async ({ deps }) => ({
      data: await createMealPlanService(deps.db, deps.mealPlanner).templates(),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/nutrition-templates/:goal',
    access: access.can('nutrition.manage'),
    summary: 'Edit the example meal plan for a goal',
    tags: ['Nutrition'],
    params: z.object({ goal: z.enum(NUTRITION_GOALS) }),
    body: updateNutritionTemplateBody,
    response: z.object({ ok: z.boolean() }),
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createMealPlanService(deps.db, deps.mealPlanner).updateTemplate(
        actor!,
        req,
        params.goal,
        body.translations,
      ),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/members/:id/nutrition-plan',
    access: access.can('progress.view_clients'),
    summary: "A client's individual meal plan (their trainer, or a manager)",
    tags: ['Nutrition'],
    params: idParams,
    response: memberNutritionPlanDto.nullable(),
    handler: async ({ actor, params, deps }) => ({
      data: await createMealPlanService(deps.db, deps.mealPlanner).memberPlan(actor!, params.id),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/members/:id/nutrition-plan',
    access: access.can('progress.view_clients'),
    summary: "Write or replace a client's individual meal plan",
    tags: ['Nutrition'],
    params: idParams,
    body: memberNutritionPlanBody,
    response: memberNutritionPlanDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createMealPlanService(deps.db, deps.mealPlanner).setMemberPlan(
        actor!,
        req,
        params.id,
        body.content,
      ),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/admin/members/:id/nutrition-plan',
    access: access.can('progress.view_clients'),
    summary: "Remove a client's individual meal plan (they see the club example again)",
    tags: ['Nutrition'],
    params: idParams,
    response: z.object({ ok: z.boolean() }),
    handler: async ({ actor, req, params, deps }) => ({
      data: await createMealPlanService(deps.db, deps.mealPlanner).removeMemberPlan(
        actor!,
        req,
        params.id,
      ),
    }),
  }),

  // ── Workout plans ───────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/me/workout-plans',
    access: access.self,
    summary: 'My active workout plans from my trainer',
    tags: ['Workouts'],
    query: localeQuery,
    response: z.array(workoutPlanDto),
    handler: async ({ actor, query, deps }) => ({
      data: await createWorkoutPlanService(deps.db).mine(actor!, query.locale),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/members/:id/workout-plans',
    access: access.can('progress.view_clients'),
    summary: "A client's workout plans (their trainer, or a manager)",
    tags: ['Workouts'],
    params: idParams,
    response: z.array(workoutPlanDto),
    handler: async ({ actor, req, params, deps }) => ({
      data: await createWorkoutPlanService(deps.db).forMember(
        actor!,
        params.id,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/members/:id/workout-plans',
    access: access.can('progress.view_clients'),
    summary: 'Write a workout plan for a client',
    tags: ['Workouts'],
    params: idParams,
    body: workoutPlanBody,
    response: workoutPlanDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      status: 201,
      data: await createWorkoutPlanService(deps.db).create(
        actor!,
        req,
        params.id,
        body,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/workout-plans/:id',
    access: access.can('progress.view_clients'),
    summary: 'Replace a workout plan (title, days, exercises) or deactivate it',
    tags: ['Workouts'],
    params: idParams,
    body: workoutPlanBody,
    response: workoutPlanDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createWorkoutPlanService(deps.db).update(
        actor!,
        req,
        params.id,
        body,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  // ── F17-2 Program templates and the trainer dashboard ──────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/workout-templates',
    access: access.can('progress.view_clients'),
    summary: 'Program templates: mine and the shared ones (managers: all)',
    tags: ['Workouts'],
    response: z.array(workoutTemplateDto),
    handler: async ({ actor, req, deps }) => ({
      data: await createWorkoutTemplateService(deps.db).list(
        actor!,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/workout-templates',
    access: access.can('progress.view_clients'),
    summary: 'Save a program template',
    tags: ['Workouts'],
    body: workoutTemplateBody,
    response: z.object({ id: z.string() }),
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await createWorkoutTemplateService(deps.db).create(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/workout-templates/:id',
    access: access.can('progress.view_clients'),
    summary: 'Change a program template (my own, or any for a manager)',
    tags: ['Workouts'],
    params: idParams,
    body: workoutTemplateBody,
    response: z.object({ id: z.string() }),
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createWorkoutTemplateService(deps.db).update(actor!, req, params.id, body),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/admin/workout-templates/:id',
    access: access.can('progress.view_clients'),
    summary: 'Delete a program template (plans already assigned stay)',
    tags: ['Workouts'],
    params: idParams,
    response: z.object({ ok: z.boolean() }),
    handler: async ({ actor, req, params, deps }) => ({
      data: await createWorkoutTemplateService(deps.db).remove(actor!, req, params.id),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/workout-templates/:id/assign',
    access: access.can('progress.view_clients'),
    summary: 'Give a template to clients (each gets their own plan they can adjust)',
    tags: ['Workouts'],
    params: idParams,
    body: assignTemplateBody,
    response: z.object({ created: z.number() }),
    handler: async ({ actor, req, params, body, deps }) => ({
      status: 201,
      data: await createWorkoutTemplateService(deps.db).assign(
        actor!,
        req,
        params.id,
        body.memberIds,
      ),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/my-dashboard',
    access: access.can('schedule.own'),
    summary: "Trainer dashboard: clients, today's sessions, programs, who needs a program",
    tags: ['Workouts'],
    response: coachDashboardDto,
    handler: async ({ actor, deps }) => ({
      data: await createWorkoutTemplateService(deps.db).dashboard(actor!),
    }),
  }),
  // ── Food diary ──────────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/me/food-log',
    access: access.self,
    summary: 'My food diary for one day, with totals and daily targets',
    tags: ['Nutrition'],
    query: foodDayQuery,
    response: foodDayDto,
    handler: async ({ actor, query, deps }) => ({
      data: await createFoodLogService(deps.db).day(actor!, query.date),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/food-log',
    access: access.self,
    summary: 'Add (or update, by client ID) a food diary entry',
    tags: ['Nutrition'],
    body: foodEntryInput,
    response: foodDayDto,
    handler: async ({ actor, body, deps }) => ({
      status: 201,
      data: await createFoodLogService(deps.db).add(actor!, body),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/food-log/copy',
    access: access.self,
    summary: 'Copy a day or one meal to another day (e.g. same breakfast as yesterday)',
    tags: ['Nutrition'],
    body: foodCopyBody,
    response: foodDayDto,
    handler: async ({ actor, body, deps }) => ({
      status: 201,
      data: await createFoodLogService(deps.db).copy(actor!, body),
    }),
  }),
  // ── F15-2 Food catalog ──────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/me/foods',
    access: access.self,
    summary: 'Search foods (catalog, barcode foods and my own); without q: recent and my foods',
    tags: ['Nutrition'],
    query: foodSearchQuery,
    handler: async ({ actor, query, deps }) => {
      const svc = createFoodsService(deps.db);
      return { data: query.q ? await svc.search(actor!, query.q) : await svc.lists(actor!) };
    },
  }),
  defineRoute({
    method: 'get',
    path: '/me/foods/barcode/:code',
    access: access.self,
    summary: 'Find a food by barcode (my foods, the catalog, then Open Food Facts)',
    tags: ['Nutrition'],
    params: barcodeParams,
    response: foodDto,
    handler: async ({ actor, params, deps }) => ({
      data: await createFoodsService(deps.db).barcode(actor!, params.code),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/foods/:id',
    access: access.self,
    summary: 'One food',
    tags: ['Nutrition'],
    params: idParams,
    response: foodDto,
    handler: async ({ actor, params, deps }) => ({
      data: await createFoodsService(deps.db).get(actor!, params.id),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/foods',
    access: access.self,
    summary: 'Add my own food (per 100 g, with a serving)',
    tags: ['Nutrition'],
    body: foodInput,
    response: foodDto,
    handler: async ({ actor, body, deps }) => ({
      status: 201,
      data: await createFoodsService(deps.db).create(actor!, body),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/me/foods/:id',
    access: access.self,
    summary: 'Delete my own food (diary entries keep their numbers)',
    tags: ['Nutrition'],
    params: idParams,
    response: z.object({ ok: z.boolean() }),
    handler: async ({ actor, params, deps }) => ({
      data: await createFoodsService(deps.db).remove(actor!, params.id),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/me/food-log/:id',
    access: access.self,
    summary: 'Delete a food diary entry',
    tags: ['Nutrition'],
    params: idParams,
    response: foodDayDto,
    handler: async ({ actor, params, deps }) => ({
      data: await createFoodLogService(deps.db).remove(actor!, params.id),
    }),
  }),
];
