import { createAccountService } from '../me/account.service';
import { z } from 'zod';
import {
  createMemberBody,
  deactivateMemberBody,
  idParams,
  listMembersQuery,
  memberDto,
  memberListItemDto,
  updateMemberBody,
} from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createMembersService } from './members.service';
import { memberPhotoUrl } from './member-photo';

const tags = ['Members'];
const service = (deps: { db: Parameters<typeof createMembersService>[0] }) =>
  createMembersService(deps.db);

export const membersRoutes = [
  defineRoute({
    method: 'get',
    path: '/admin/members',
    access: access.can('members.read'),
    summary: 'List and search members',
    tags,
    query: listMembersQuery,
    response: z.array(memberListItemDto),
    handler: async ({ query, deps }) => {
      const { items, total } = await service(deps).list(query);
      return { data: items, meta: { page: query.page, pageSize: query.pageSize, total } };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/admin/members',
    access: access.can('members.create'),
    summary: 'Create a member',
    tags,
    body: createMemberBody,
    response: memberDto,
    handler: async ({ body, actor, req, deps }) => ({
      data: await service(deps).create(actor!, req, body),
      status: 201,
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/members/:id',
    access: access.can('members.read'),
    summary: 'Get a member',
    tags,
    params: idParams,
    response: memberDto,
    handler: async ({ params, deps }) => ({
      data: {
        ...(await service(deps).get(params.id)),
        photoUrl: await memberPhotoUrl(deps.db, deps.media, params.id),
      },
    }),
  }),
  defineRoute({
    method: 'patch',
    path: '/admin/members/:id',
    access: access.can('members.update'),
    summary: 'Update a member',
    tags,
    params: idParams,
    body: updateMemberBody,
    response: memberDto,
    handler: async ({ params, body, actor, req, deps }) => ({
      data: await service(deps).update(actor!, req, params.id, body),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/members/:id/deactivate',
    access: access.can('members.deactivate'),
    summary: 'Deactivate a member (history is kept)',
    tags,
    params: idParams,
    body: deactivateMemberBody,
    response: memberDto,
    handler: async ({ params, body, actor, req, deps }) => ({
      data: await service(deps).deactivate(actor!, req, params.id, body.reason),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/members/:id/erase',
    access: access.can('members.erase'),
    summary: 'Erase personal data on request (payments and visits stay anonymized)',
    tags,
    params: idParams,
    body: deactivateMemberBody,
    response: memberDto,
    handler: async ({ params, body, actor, req, deps }) => {
      await createAccountService(deps.db).eraseByStaff(actor!, req, params.id, body.reason, {
        media: deps.media,
        authAdmin: deps.authAdmin,
      });
      return { data: await service(deps).get(params.id) };
    },
  }),
];
