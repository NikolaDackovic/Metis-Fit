import { z } from 'zod';
import {
  idParams,
  myPausesDto,
  normalizeLocaleParam,
  pauseDecisionBody,
  pauseDto,
  pauseListQuery,
  pauseRequestBody,
  staffPauseBody,
} from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createPauseService } from './pauses.service';

const TAG = ['Pauses'];
const localeQuery = z.object({ locale: normalizeLocaleParam });
const svc = (deps: { db: Parameters<typeof createPauseService>[0] }) => createPauseService(deps.db);

export const pauseRoutes = [
  defineRoute({
    method: 'get',
    path: '/me/pauses',
    access: access.self,
    summary: 'My membership pauses and how much pausing the plan still allows',
    tags: TAG,
    query: localeQuery,
    response: myPausesDto,
    handler: async ({ actor, query, deps }) => ({
      data: await svc(deps).mine(actor!, query.locale),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/pauses',
    access: access.self,
    summary: 'Ask to pause (freeze) a membership; the front desk approves it',
    tags: TAG,
    query: localeQuery,
    body: pauseRequestBody,
    response: pauseDto,
    handler: async ({ actor, req, query, body, deps }) => ({
      status: 201,
      data: await svc(deps).request(actor!, req, body, query.locale),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/pauses/:id/cancel',
    access: access.self,
    summary: 'Withdraw a pause request that is still waiting',
    tags: TAG,
    params: idParams,
    query: localeQuery,
    response: pauseDto,
    handler: async ({ actor, req, params, query, deps }) => ({
      data: await svc(deps).cancelMine(actor!, req, params.id, query.locale),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/pauses',
    access: access.can('memberships.pause'),
    summary: 'Membership pauses (requests waiting for a decision by default filter)',
    tags: TAG,
    query: pauseListQuery.extend({ locale: normalizeLocaleParam }),
    response: z.array(pauseDto),
    handler: async ({ query, deps }) => ({
      data: await svc(deps).list(
        { status: query.status, membershipId: query.membershipId },
        query.locale,
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/memberships/:id/pauses',
    access: access.can('memberships.pause'),
    summary: 'Enter an approved pause for a membership (moves its end date)',
    tags: TAG,
    params: idParams,
    query: localeQuery,
    body: staffPauseBody,
    response: pauseDto,
    handler: async ({ actor, req, params, query, body, deps }) => ({
      status: 201,
      data: await svc(deps).create(actor!, req, params.id, body, query.locale),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/pauses/:id/approve',
    access: access.can('memberships.pause'),
    summary: 'Approve a pause request (moves the end date, tells the member)',
    tags: TAG,
    params: idParams,
    query: localeQuery,
    body: pauseDecisionBody,
    response: pauseDto,
    handler: async ({ actor, req, params, query, body, deps }) => ({
      data: await svc(deps).approve(actor!, req, params.id, body.note, query.locale),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/pauses/:id/reject',
    access: access.can('memberships.pause'),
    summary: 'Reject a pause request (tells the member)',
    tags: TAG,
    params: idParams,
    query: localeQuery,
    body: pauseDecisionBody,
    response: pauseDto,
    handler: async ({ actor, req, params, query, body, deps }) => ({
      data: await svc(deps).reject(actor!, req, params.id, body.note, query.locale),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/pauses/:id/end',
    access: access.can('memberships.pause'),
    summary: 'End an approved pause today, or cancel one not started; unused days are taken back',
    tags: TAG,
    params: idParams,
    query: localeQuery,
    response: pauseDto,
    handler: async ({ actor, req, params, query, deps }) => ({
      data: await svc(deps).end(actor!, req, params.id, query.locale),
    }),
  }),
];
