import { z } from 'zod';
import {
  activityDto,
  activityInput,
  checkinBody,
  checkinDayDto,
  dayParams,
  idParams,
  weekQuery,
  weekSummaryDto,
} from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createWellbeingService } from './wellbeing.service';

const TAG = ['Wellbeing'];

export const wellbeingRoutes = [
  defineRoute({
    method: 'get',
    path: '/me/activities',
    access: access.self,
    summary: 'My activities outside the gym (latest 100)',
    tags: TAG,
    response: z.array(activityDto),
    handler: async ({ actor, deps }) => ({
      data: await createWellbeingService(deps.db).activities(actor!),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/activities',
    access: access.self,
    summary:
      'Add (or update, by client ID) an activity; calories are estimated from MET and body weight',
    tags: TAG,
    body: activityInput,
    response: z.array(activityDto),
    handler: async ({ actor, body, deps }) => ({
      status: 201,
      data: await createWellbeingService(deps.db).saveActivity(actor!, body),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/me/activities/:id',
    access: access.self,
    summary: 'Delete an activity',
    tags: TAG,
    params: idParams,
    response: z.array(activityDto),
    handler: async ({ actor, params, deps }) => ({
      data: await createWellbeingService(deps.db).deleteActivity(actor!, params.id),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/checkins/:day',
    access: access.self,
    summary:
      'My daily habits for a day (water, sleep, steps, mood, energy), goals and the last 14 days',
    tags: TAG,
    params: dayParams,
    response: checkinDayDto,
    handler: async ({ actor, params, deps }) => ({
      data: await createWellbeingService(deps.db).checkin(actor!, params.day),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/me/checkins/:day',
    access: access.self,
    summary: 'Save my daily habits for a day (not in the future)',
    tags: TAG,
    params: dayParams,
    body: checkinBody,
    response: checkinDayDto,
    handler: async ({ actor, params, body, deps }) => ({
      data: await createWellbeingService(deps.db).saveCheckin(actor!, params.day, body),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/week',
    access: access.self,
    summary:
      'My week (Monday-Sunday): workouts, activities, classes, visits, habits, food and weight',
    tags: TAG,
    query: weekQuery,
    response: weekSummaryDto,
    handler: async ({ actor, query, deps }) => ({
      data: await createWellbeingService(deps.db).week(actor!, query.date),
    }),
  }),
];
