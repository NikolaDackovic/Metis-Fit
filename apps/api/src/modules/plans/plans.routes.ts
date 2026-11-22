import { z } from 'zod';
import { createPlanBody, idParams, planDto, updatePlanBody } from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createPlansService } from './plans.service';

const tags = ['Plans'];

export const plansRoutes = [
  defineRoute({
    method: 'get',
    path: '/admin/plans',
    access: access.can('plans.read'),
    summary: 'List all membership plans (including unavailable)',
    tags,
    response: z.array(planDto),
    handler: async ({ deps }) => ({ data: await createPlansService(deps.db).list() }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/plans',
    access: access.can('plans.manage'),
    summary: 'Create a membership plan',
    tags,
    body: createPlanBody,
    response: planDto,
    handler: async ({ body, actor, req, deps }) => ({
      data: await createPlansService(deps.db).create(actor!, req, body),
      status: 201,
    }),
  }),
  defineRoute({
    method: 'patch',
    path: '/admin/plans/:id',
    access: access.can('plans.manage'),
    summary: 'Update a membership plan (price changes affect future sales only)',
    tags,
    params: idParams,
    body: updatePlanBody,
    response: planDto,
    handler: async ({ params, body, actor, req, deps }) => ({
      data: await createPlansService(deps.db).update(actor!, req, params.id, body),
    }),
  }),
];
