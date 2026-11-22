import { z } from 'zod';
import {
  addTrainerClientBody,
  clientProgressDto,
  createExerciseBody,
  exerciseDetailDto,
  exerciseDto,
  exerciseHistoryDto,
  goalDto,
  goalInput,
  idParams,
  listExercisesQuery,
  listWorkoutsQuery,
  measurementDto,
  measurementInput,
  muscleGroupDto,
  normalizeLocaleParam,
  progressDto,
  sharingDto,
  syncResultDto,
  syncWorkoutsBody,
  trainerClientDto,
  updateExerciseBody,
  updateGoalBody,
  updateSharingBody,
  workoutDetailDto,
  workoutSummaryDto,
} from '@grit/validation';
import { createAttemptLimiter } from '../../shared/attempt-limiter';
import { access, defineRoute } from '../../shared/route';
import { createExerciseService } from './exercises.service';
import { createWorkoutService } from './workouts.service';

/** Sync is called on app start, after each workout and on reconnect; generous but bounded. */
export const syncLimiter = createAttemptLimiter({ max: 120, windowMs: 60 * 60_000 });

const localeQuery = z.object({ locale: normalizeLocaleParam });
const headerLocale = (h: string | undefined) => normalizeLocaleParam.parse(h?.slice(0, 2));
const TAG = ['Workouts'];

export const workoutsRoutes = [
  // ── Exercise library (public) ───────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/public/exercises',
    access: access.public,
    summary: 'Exercise library (search, category, muscle group)',
    tags: TAG,
    query: listExercisesQuery,
    response: z.array(exerciseDto),
    handler: async ({ query, deps, res }) => {
      res.setHeader('cache-control', 'public, max-age=300');
      return { data: await createExerciseService(deps.db).list(query.locale, query) };
    },
  }),
  defineRoute({
    method: 'get',
    path: '/public/exercises/:id',
    access: access.public,
    summary: 'Exercise with instructions, muscles and the club machines it is done on',
    tags: TAG,
    params: idParams,
    query: localeQuery,
    response: exerciseDetailDto,
    handler: async ({ params, query, deps }) => ({
      data: await createExerciseService(deps.db).get(query.locale, params.id),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/public/muscle-groups',
    access: access.public,
    summary: 'Muscle groups',
    tags: TAG,
    query: localeQuery,
    response: z.array(muscleGroupDto),
    handler: async ({ query, deps }) => ({
      data: await createExerciseService(deps.db).muscleGroups(query.locale),
    }),
  }),

  // ── My workouts ─────────────────────────────────────────────────────────────
  defineRoute({
    method: 'post',
    path: '/me/workouts/sync',
    access: access.self,
    summary: 'Upload workouts recorded on the device (idempotent; safe to retry after offline use)',
    tags: TAG,
    body: syncWorkoutsBody,
    response: syncResultDto,
    handler: async ({ actor, body, deps }) => {
      syncLimiter.hit(actor!.userId);
      return { data: await createWorkoutService(deps.db).sync(actor!, body) };
    },
  }),
  defineRoute({
    method: 'get',
    path: '/me/workouts',
    access: access.self,
    summary: 'My workout history (newest first)',
    tags: TAG,
    query: listWorkoutsQuery,
    response: z.array(workoutSummaryDto),
    handler: async ({ actor, query, deps }) => {
      const r = await createWorkoutService(deps.db).list(
        actor!,
        query.locale,
        query.page,
        query.pageSize,
      );
      return {
        data: r.items,
        meta: { page: query.page, pageSize: query.pageSize, total: r.total },
      };
    },
  }),
  defineRoute({
    method: 'get',
    path: '/me/workouts/:id',
    access: access.self,
    summary: 'One of my workouts with all sets',
    tags: TAG,
    params: idParams,
    query: localeQuery,
    response: workoutDetailDto,
    handler: async ({ actor, params, query, deps }) => ({
      data: await createWorkoutService(deps.db).detail(actor!, query.locale, params.id),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/progress',
    access: access.self,
    summary: 'My progress: totals, weekly activity, personal records, latest measurement',
    tags: TAG,
    query: localeQuery,
    response: progressDto,
    handler: async ({ actor, query, deps }) => ({
      data: await createWorkoutService(deps.db).progress(actor!, query.locale),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/exercises/:id/history',
    access: access.self,
    summary: 'My history on one exercise (per day)',
    tags: TAG,
    params: idParams,
    response: exerciseHistoryDto,
    handler: async ({ actor, params, deps }) => ({
      data: await createWorkoutService(deps.db).exerciseHistory(actor!, params.id),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/measurements',
    access: access.self,
    summary: 'My body measurements (private)',
    tags: TAG,
    response: z.array(measurementDto),
    handler: async ({ actor, deps }) => ({
      data: await createWorkoutService(deps.db).measurements(actor!),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/measurements',
    access: access.self,
    summary: 'Add (or update, by client ID) a measurement',
    tags: TAG,
    body: measurementInput,
    response: z.array(measurementDto),
    handler: async ({ actor, body, deps }) => ({
      status: 201,
      data: await createWorkoutService(deps.db).addMeasurement(actor!, body),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/me/measurements/:id',
    access: access.self,
    summary: 'Delete a measurement',
    tags: TAG,
    params: idParams,
    response: z.array(measurementDto),
    handler: async ({ actor, params, deps }) => ({
      data: await createWorkoutService(deps.db).deleteMeasurement(actor!, params.id),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/goals',
    access: access.self,
    summary: 'My goals with current value',
    tags: TAG,
    query: localeQuery,
    response: z.array(goalDto),
    handler: async ({ actor, query, deps }) => ({
      data: await createWorkoutService(deps.db).goals(actor!, query.locale),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/goals',
    access: access.self,
    summary: 'Set a goal (max 10 active)',
    tags: TAG,
    query: localeQuery,
    body: goalInput,
    response: z.array(goalDto),
    handler: async ({ actor, query, body, deps }) => ({
      status: 201,
      data: await createWorkoutService(deps.db).addGoal(actor!, query.locale, body),
    }),
  }),
  defineRoute({
    method: 'patch',
    path: '/me/goals/:id',
    access: access.self,
    summary: 'Mark a goal achieved or abandoned',
    tags: TAG,
    params: idParams,
    query: localeQuery,
    body: updateGoalBody,
    response: z.array(goalDto),
    handler: async ({ actor, params, query, body, deps }) => ({
      data: await createWorkoutService(deps.db).updateGoal(
        actor!,
        query.locale,
        params.id,
        body.status,
      ),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/sharing',
    access: access.self,
    summary: 'Whether my trainer may see my progress, and who my trainers are',
    tags: TAG,
    response: sharingDto,
    handler: async ({ actor, deps }) => ({
      data: await createWorkoutService(deps.db).sharing(actor!),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/me/sharing',
    access: access.self,
    summary: 'Grant or withdraw consent to share progress with my trainer (recorded as history)',
    tags: TAG,
    body: updateSharingBody,
    response: sharingDto,
    handler: async ({ actor, body, deps }) => {
      const svc = createWorkoutService(deps.db);
      await svc.setSharing(actor!, body.shareWithTrainer);
      return { data: await svc.sharing(actor!) };
    },
  }),

  // ── Admin: library ──────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/exercises',
    access: access.can('exercises.manage'),
    summary: 'All exercises (including inactive)',
    tags: TAG,
    response: z.array(exerciseDto),
    handler: async ({ req, deps }) => ({
      data: await createExerciseService(deps.db).adminList(
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/exercises/:id',
    access: access.can('exercises.manage'),
    summary: 'Exercise with all translations and linked machines',
    tags: TAG,
    params: idParams,
    response: exerciseDetailDto,
    handler: async ({ req, params, deps }) => ({
      data: await createExerciseService(deps.db).adminGet(
        headerLocale(req.get('accept-language')),
        params.id,
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/exercises',
    access: access.can('exercises.manage'),
    summary: 'Add an exercise',
    tags: TAG,
    body: createExerciseBody,
    response: exerciseDetailDto,
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await createExerciseService(deps.db).create(
        actor!,
        req,
        body,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'patch',
    path: '/admin/exercises/:id',
    access: access.can('exercises.manage'),
    summary: 'Edit an exercise (deactivate instead of deleting)',
    tags: TAG,
    params: idParams,
    body: updateExerciseBody,
    response: exerciseDetailDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createExerciseService(deps.db).update(
        actor!,
        req,
        params.id,
        body,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),

  // ── Admin: trainer clients and shared progress ──────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/trainers/:id/clients',
    access: access.can('trainers.manage'),
    summary: "A trainer's active clients",
    tags: TAG,
    params: idParams,
    response: z.array(trainerClientDto),
    handler: async ({ params, deps }) => ({
      data: await createWorkoutService(deps.db).clients(params.id),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/trainers/:id/clients',
    access: access.can('trainers.manage'),
    summary: 'Assign a member to a trainer (the member still decides about sharing progress)',
    tags: TAG,
    params: idParams,
    body: addTrainerClientBody,
    response: z.array(trainerClientDto),
    handler: async ({ actor, req, params, body, deps }) => ({
      status: 201,
      data: await createWorkoutService(deps.db).addClient(actor!, req, params.id, body.memberId),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/trainer-clients/:id/end',
    access: access.can('trainers.manage'),
    summary: 'End a trainer-client relationship (access to progress stops immediately)',
    tags: TAG,
    params: idParams,
    response: z.array(trainerClientDto),
    handler: async ({ actor, req, params, deps }) => ({
      data: await createWorkoutService(deps.db).endClient(actor!, req, params.id),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/my-clients',
    access: access.can('progress.view_clients'),
    summary: 'Clients of the signed-in trainer',
    tags: TAG,
    response: z.array(trainerClientDto),
    handler: async ({ actor, deps }) => ({
      data: await createWorkoutService(deps.db).myClients(actor!),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/members/:id/progress',
    access: access.can('progress.view_clients'),
    summary: "A client's progress - only for their active trainer, only with the member's consent",
    tags: TAG,
    params: idParams,
    response: clientProgressDto,
    handler: async ({ actor, req, params, deps }) => ({
      data: await createWorkoutService(deps.db).clientProgress(
        actor!,
        req,
        params.id,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
];
