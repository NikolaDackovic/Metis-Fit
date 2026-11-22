import { z } from 'zod';
import {
  clubDirectoryQuery,
  idParams,
  myClubDto,
  platformClubDto,
  platformClubsQuery,
  publicClubDto,
  registerClubBody,
  suspendClubBody,
} from '@grit/validation';
import { createAttemptLimiter } from '../../shared/attempt-limiter';
import { access, defineRoute } from '../../shared/route';
import { createClubsService } from './clubs.service';

const TAG = ['Clubs'];
const svc = (deps: { db: Parameters<typeof createClubsService>[0] }) => createClubsService(deps.db);
const ok = z.object({ ok: z.literal(true) });
/** Opening gyms is rare: a few attempts per person per hour stop scripted floods. */
export const registerLimiter = createAttemptLimiter({ max: 5, windowMs: 60 * 60_000 });

export const clubsRoutes = [
  defineRoute({
    method: 'get',
    path: '/public/clubs',
    access: access.public,
    summary: 'Directory of active gyms (search by name or city)',
    tags: TAG,
    query: clubDirectoryQuery,
    response: z.array(publicClubDto),
    handler: async ({ query, deps }) => ({ data: await svc(deps).directory(query.q) }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/clubs',
    access: access.self,
    summary: 'Gyms I belong to (staff roles and/or membership)',
    tags: TAG,
    response: z.array(myClubDto),
    handler: async ({ actor, deps }) => ({ data: await svc(deps).mine(actor!) }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/clubs',
    access: access.self,
    summary: 'Open a new gym: it is created pending, with me as its owner, until approved',
    tags: TAG,
    body: registerClubBody,
    response: myClubDto,
    handler: async ({ actor, req, body, deps }) => {
      registerLimiter.hit(actor!.userId);
      return { status: 201, data: await svc(deps).register(actor!, req, body) };
    },
  }),

  // ── Platform owner ──────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/platform/clubs',
    access: access.platform,
    summary: 'All gyms on the platform, pending first',
    tags: TAG,
    query: platformClubsQuery,
    response: z.array(platformClubDto),
    handler: async ({ query, deps }) => ({ data: await svc(deps).platformList(query.status) }),
  }),
  defineRoute({
    method: 'post',
    path: '/platform/clubs/:id/approve',
    access: access.platform,
    summary: 'Approve a pending gym (it appears in the directory and the app)',
    tags: TAG,
    params: idParams,
    response: ok,
    handler: async ({ params, actor, req, deps }) => {
      await svc(deps).approve(actor!, req, params.id);
      return { data: { ok: true as const } };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/platform/clubs/:id/suspend',
    access: access.platform,
    summary: 'Suspend a gym (nobody can use it until reactivated); a reason is required',
    tags: TAG,
    params: idParams,
    body: suspendClubBody,
    response: ok,
    handler: async ({ params, body, actor, req, deps }) => {
      await svc(deps).suspend(actor!, req, params.id, body.reason);
      return { data: { ok: true as const } };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/platform/clubs/:id/reactivate',
    access: access.platform,
    summary: 'Reactivate a suspended gym',
    tags: TAG,
    params: idParams,
    response: ok,
    handler: async ({ params, actor, req, deps }) => {
      await svc(deps).reactivate(actor!, req, params.id);
      return { data: { ok: true as const } };
    },
  }),
];
