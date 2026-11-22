import { z } from 'zod';
import { calendarFeedDto, calendarTokenParams } from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createCalendarService } from './calendar.service';

const TAG = ['Calendar'];
const svc = (deps: { db: Parameters<typeof createCalendarService>[0] }) =>
  createCalendarService(deps.db);

export const calendarRoutes = [
  defineRoute({
    method: 'get',
    path: '/me/calendar-feed',
    access: access.self,
    summary: 'Is my calendar subscription on?',
    tags: TAG,
    response: calendarFeedDto,
    handler: async ({ actor, deps }) => ({ data: await svc(deps).get(actor!) }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/calendar-feed',
    access: access.self,
    summary: 'Create my calendar link (the secret is returned once; an earlier link stops working)',
    tags: TAG,
    response: calendarFeedDto,
    handler: async ({ actor, req, deps }) => ({
      status: 201,
      data: await svc(deps).create(actor!, req),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/me/calendar-feed',
    access: access.self,
    summary: 'Turn my calendar link off',
    tags: TAG,
    response: z.object({ ok: z.boolean() }),
    handler: async ({ actor, req, deps }) => ({ data: await svc(deps).remove(actor!, req) }),
  }),
  defineRoute({
    method: 'get',
    path: '/public/calendar/:token/feed.ics',
    access: access.public,
    summary: "A member's classes and sessions as a calendar (iCalendar); the link is the key",
    tags: TAG,
    params: calendarTokenParams,
    handler: async ({ params, deps, res }) => {
      res.setHeader('cache-control', 'private, max-age=300');
      return {
        data: null,
        raw: {
          contentType: 'text/calendar; charset=utf-8',
          body: await svc(deps).feed(params.token),
        },
      };
    },
  }),
];
