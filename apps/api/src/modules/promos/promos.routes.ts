import { z } from 'zod';
import {
  adjustPointsBody,
  idParams,
  loyaltyDto,
  loyaltyRewardBody,
  loyaltyRewardDto,
  normalizeLocaleParam,
  promoBody,
  promoCheckBody,
  promoCheckDto,
  promoDto,
  publicPromoDto,
  redeemRewardBody,
} from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createLoyaltyService } from './loyalty.service';
import { createPromoService } from './promos.service';

const localeQuery = z.object({ locale: normalizeLocaleParam });

export const promosRoutes = [
  // ── Promo codes ────────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/promos',
    access: access.can('promos.manage'),
    summary: 'Promo codes with usage and total discount given',
    tags: ['Promotions'],
    response: z.array(promoDto),
    handler: async ({ deps }) => ({ data: await createPromoService(deps.db).list() }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/promos',
    access: access.can('promos.manage'),
    summary: 'Create a promo code',
    tags: ['Promotions'],
    body: promoBody,
    response: promoDto,
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await createPromoService(deps.db).create(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/promos/:id',
    access: access.can('promos.manage'),
    summary: 'Update a promo code',
    tags: ['Promotions'],
    params: idParams,
    body: promoBody,
    response: promoDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createPromoService(deps.db).update(actor!, req, params.id, body),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/promos/check',
    access: access.can('memberships.create'),
    summary: 'Front desk: check a code for a member and plan before selling (no changes made)',
    tags: ['Promotions'],
    body: promoCheckBody,
    response: promoCheckDto,
    handler: async ({ body, deps }) => ({
      data: await createPromoService(deps.db).check(body.memberId, body.planId, body.code),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/public/promotions',
    access: access.public,
    summary: 'Active public promotions (codes members can use at the front desk)',
    tags: ['Promotions'],
    query: localeQuery,
    response: z.array(publicPromoDto),
    handler: async ({ query, deps }) => ({
      data: await createPromoService(deps.db).publicList(query.locale),
    }),
  }),

  // ── Loyalty ────────────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/me/loyalty',
    access: access.self,
    summary: 'My points, tier, history and the rewards I can get',
    tags: ['Loyalty'],
    query: localeQuery,
    response: loyaltyDto,
    handler: async ({ actor, query, deps }) => ({
      data: await createLoyaltyService(deps.db).mine(actor!, query.locale),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/members/:id/loyalty',
    access: access.can('members.read'),
    summary: "A member's points, tier and history",
    tags: ['Loyalty'],
    params: idParams,
    query: localeQuery,
    response: loyaltyDto,
    handler: async ({ params, query, deps }) => ({
      data: await createLoyaltyService(deps.db).ofMember(params.id, query.locale),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/members/:id/loyalty/redeem',
    access: access.can('loyalty.redeem'),
    summary: 'Hand out a reward: takes its points (never below zero)',
    tags: ['Loyalty'],
    params: idParams,
    query: localeQuery,
    body: redeemRewardBody,
    response: loyaltyDto,
    handler: async ({ actor, req, params, query, body, deps }) => ({
      data: await createLoyaltyService(deps.db).redeem(
        actor!,
        req,
        params.id,
        body.rewardId,
        query.locale,
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/members/:id/loyalty/adjust',
    access: access.can('loyalty.manage'),
    summary: 'Add or remove points manually (with a reason, audited)',
    tags: ['Loyalty'],
    params: idParams,
    query: localeQuery,
    body: adjustPointsBody,
    response: loyaltyDto,
    handler: async ({ actor, req, params, query, body, deps }) => ({
      data: await createLoyaltyService(deps.db).adjust(
        actor!,
        req,
        params.id,
        body.points,
        body.note,
        query.locale,
      ),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/loyalty/rewards',
    access: access.can('loyalty.redeem'),
    summary: 'Rewards catalog (all, with translations)',
    tags: ['Loyalty'],
    query: localeQuery,
    response: z.array(loyaltyRewardDto),
    handler: async ({ query, deps }) => ({
      data: await createLoyaltyService(deps.db).rewards(query.locale),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/loyalty/rewards',
    access: access.can('loyalty.manage'),
    summary: 'Add a reward',
    tags: ['Loyalty'],
    query: localeQuery,
    body: loyaltyRewardBody,
    response: z.array(loyaltyRewardDto),
    handler: async ({ actor, req, query, body, deps }) => ({
      status: 201,
      data: await createLoyaltyService(deps.db).createReward(actor!, req, body, query.locale),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/loyalty/rewards/:id',
    access: access.can('loyalty.manage'),
    summary: 'Edit a reward (or switch it off)',
    tags: ['Loyalty'],
    params: idParams,
    query: localeQuery,
    body: loyaltyRewardBody,
    response: z.array(loyaltyRewardDto),
    handler: async ({ actor, req, params, query, body, deps }) => ({
      data: await createLoyaltyService(deps.db).updateReward(
        actor!,
        req,
        params.id,
        body,
        query.locale,
      ),
    }),
  }),
];
