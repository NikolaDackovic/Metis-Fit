import { z } from 'zod';
import {
  activateMembershipBody,
  becomeMemberBody,
  idParams,
  membershipDto,
  membershipRequestBody,
  normalizeLocaleParam,
  publicPlanDto,
} from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createJoinService } from './join.service';

const TAG = ['Join'];
const ok = z.object({ ok: z.literal(true) });

export const joinRoutes = [
  defineRoute({
    method: 'get',
    path: '/public/plans',
    access: access.public,
    summary: 'Membership plans on sale (price list for the app and website)',
    tags: TAG,
    query: z.object({ locale: normalizeLocaleParam }),
    response: z.array(publicPlanDto),
    handler: async ({ query, deps }) => ({
      data: await createJoinService(deps.db).plans(query.locale),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/member',
    access: access.self,
    summary: 'Become a member from the app (creates my member profile from my account data)',
    tags: TAG,
    body: becomeMemberBody,
    response: ok,
    handler: async ({ actor, body, deps }) => ({
      status: 201,
      data: await createJoinService(deps.db).becomeMember(actor!, body),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/membership-requests',
    access: access.self,
    summary: 'Ask for a membership or a renewal; it starts after payment at the front desk',
    tags: TAG,
    body: membershipRequestBody,
    response: membershipDto,
    handler: async ({ actor, body, deps }) => ({
      status: 201,
      data: await createJoinService(deps.db).request(actor!, body.planId),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/me/membership-requests/:id',
    access: access.self,
    summary: 'Withdraw my unpaid membership request',
    tags: TAG,
    params: idParams,
    response: ok,
    handler: async ({ actor, params, deps }) => ({
      data: await createJoinService(deps.db).withdraw(actor!, params.id),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/memberships/:id/activate',
    access: access.can('memberships.create'),
    summary: 'Activate a membership requested in the app (optionally recording its payment)',
    tags: TAG,
    params: idParams,
    body: activateMembershipBody,
    response: membershipDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createJoinService(deps.db).activate(actor!, req, params.id, body.payment),
    }),
  }),
];
