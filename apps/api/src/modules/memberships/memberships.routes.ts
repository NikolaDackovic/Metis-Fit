import { z } from 'zod';
import {
  assignMembershipBody,
  cancelMembershipBody,
  idParams,
  membershipDto,
} from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createMembershipsService } from './memberships.service';

const tags = ['Memberships'];

export const membershipsRoutes = [
  defineRoute({
    method: 'get',
    path: '/admin/members/:id/memberships',
    access: access.can('members.read'),
    summary: "A member's memberships with computed status and balance",
    tags,
    params: idParams,
    response: z.array(membershipDto),
    handler: async ({ params, deps }) => ({
      data: await createMembershipsService(deps.db).listForMember(params.id),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/members/:id/memberships',
    access: access.can('memberships.create'),
    summary: 'Assign a membership (and optionally record its payment) in one transaction',
    tags,
    params: idParams,
    body: assignMembershipBody,
    response: membershipDto,
    handler: async ({ params, body, actor, req, deps }) => ({
      data: await createMembershipsService(deps.db).assign(actor!, req, params.id, body),
      status: 201,
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/memberships/:id/cancel',
    access: access.can('memberships.cancel'),
    summary: 'Cancel a membership (reason required)',
    tags,
    params: idParams,
    body: cancelMembershipBody,
    response: membershipDto,
    handler: async ({ params, body, actor, req, deps }) => ({
      data: await createMembershipsService(deps.db).cancel(actor!, req, params.id, body.reason),
    }),
  }),
];
