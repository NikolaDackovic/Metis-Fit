import { z } from 'zod';
import { challengeBody, challengeDto, idParams, myChallengeDto } from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createChallengeService } from './challenges.service';

const TAG = ['Challenges'];
const svc = (deps: { db: Parameters<typeof createChallengeService>[0] }) =>
  createChallengeService(deps.db);

export const challengeRoutes = [
  defineRoute({
    method: 'get',
    path: '/me/challenges',
    access: access.self,
    summary: 'My challenges this week / month with progress (points are given when reached)',
    tags: TAG,
    response: z.array(myChallengeDto),
    handler: async ({ actor, deps }) => ({ data: await svc(deps).mine(actor!) }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/challenges',
    access: access.can('loyalty.manage'),
    summary: 'Challenges of the gym',
    tags: TAG,
    response: z.array(challengeDto),
    handler: async ({ deps }) => ({ data: await svc(deps).list() }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/challenges',
    access: access.can('loyalty.manage'),
    summary: 'Add a challenge',
    tags: TAG,
    body: challengeBody,
    response: challengeDto,
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await svc(deps).create(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/challenges/:id',
    access: access.can('loyalty.manage'),
    summary: 'Change a challenge',
    tags: TAG,
    params: idParams,
    body: challengeBody,
    response: challengeDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await svc(deps).update(actor!, req, params.id, body),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/admin/challenges/:id',
    access: access.can('loyalty.manage'),
    summary: 'Delete a challenge (points already given stay)',
    tags: TAG,
    params: idParams,
    response: z.object({ ok: z.boolean() }),
    handler: async ({ actor, req, params, deps }) => ({
      data: await svc(deps).remove(actor!, req, params.id),
    }),
  }),
];
