import { z } from 'zod';
import {
  adminReferralsDto,
  claimReferralBody,
  myReferralDto,
  referralSettingsBody,
} from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createReferralService } from './referrals.service';

const TAG = ['Referrals'];
const svc = (deps: { db: Parameters<typeof createReferralService>[0] }) =>
  createReferralService(deps.db);

export const referralRoutes = [
  defineRoute({
    method: 'get',
    path: '/me/referral',
    access: access.self,
    summary: 'My "bring a friend" code, the points, and the friends I brought',
    tags: TAG,
    response: myReferralDto,
    handler: async ({ actor, deps }) => ({ data: await svc(deps).mine(actor!) }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/referral/claim',
    access: access.self,
    summary: "Enter a friend's code (before the first membership payment)",
    tags: TAG,
    body: claimReferralBody,
    response: z.object({ ok: z.boolean() }),
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await svc(deps).claim(actor!, req, body.code),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/referrals',
    access: access.can('loyalty.manage'),
    summary: '"Bring a friend": settings and who brought whom',
    tags: TAG,
    response: adminReferralsDto,
    handler: async ({ deps }) => ({ data: await svc(deps).list() }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/referrals/settings',
    access: access.can('loyalty.manage'),
    summary: 'Turn "bring a friend" on or off and set the points for both members',
    tags: TAG,
    body: referralSettingsBody,
    response: referralSettingsBody,
    handler: async ({ actor, req, body, deps }) => ({
      data: await svc(deps).updateSettings(actor!, req, body),
    }),
  }),
];
