import { z } from 'zod';
import { availabilityBody, bookSlotBody, freeSlotsDto, idParams } from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createAvailabilityService } from './availability.service';

const TAG = ['Availability'];
const svc = (deps: { db: Parameters<typeof createAvailabilityService>[0] }) =>
  createAvailabilityService(deps.db);

export const availabilityRoutes = [
  defineRoute({
    method: 'get',
    path: '/admin/my-availability',
    access: access.can('schedule.own'),
    summary: 'When I take personal sessions (weekly windows) and the slot length',
    tags: TAG,
    response: availabilityBody,
    handler: async ({ actor, deps }) => ({ data: await svc(deps).mine(actor!) }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/my-availability',
    access: access.can('schedule.own'),
    summary: 'Replace my weekly windows for personal sessions',
    tags: TAG,
    body: availabilityBody,
    response: availabilityBody,
    handler: async ({ actor, req, body, deps }) => ({
      data: await svc(deps).setMine(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/trainers/:id/availability',
    access: access.can('trainers.manage'),
    summary:
      "A trainer's weekly windows for personal sessions (reception sets them for the trainer)",
    tags: TAG,
    params: idParams,
    response: availabilityBody,
    handler: async ({ params, deps }) => ({ data: await svc(deps).ofTrainer(params.id) }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/trainers/:id/availability',
    access: access.can('trainers.manage'),
    summary: "Replace a trainer's weekly windows for personal sessions",
    tags: TAG,
    params: idParams,
    body: availabilityBody,
    response: availabilityBody,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await svc(deps).setOfTrainer(actor!, req, params.id, body),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/trainers/:id/slots',
    access: access.self,
    summary: "A trainer's free personal-session slots in the next 14 days",
    tags: TAG,
    params: idParams,
    response: freeSlotsDto,
    handler: async ({ params, deps }) => ({ data: await svc(deps).slots(params.id) }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/trainers/:id/book',
    access: access.self,
    summary: 'Book a free slot with a trainer (the trainer is told)',
    tags: TAG,
    params: idParams,
    body: bookSlotBody,
    response: z.object({ id: z.string() }),
    handler: async ({ actor, req, params, body, deps }) => ({
      status: 201,
      data: await svc(deps).book(actor!, req, params.id, body.startsAt),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/appointments/:id/cancel',
    access: access.self,
    summary: 'Cancel my personal session (up to 6 hours before)',
    tags: TAG,
    params: idParams,
    response: z.object({ ok: z.boolean() }),
    handler: async ({ actor, req, params, deps }) => ({
      data: await svc(deps).cancel(actor!, req, params.id),
    }),
  }),
];
