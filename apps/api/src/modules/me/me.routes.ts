import { z } from 'zod';
import {
  deleteAccountBody,
  meDto,
  trainerPhotoBody,
  updateMeBody,
  type MeDto,
} from '@grit/validation';
import { createAccountService } from './account.service';
import { withMemberTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { notFound } from '../../shared/errors';
import { decodeImage, mediaKey, type MediaStore } from '../../shared/media';
import { access, defineRoute } from '../../shared/route';

const tags = ['Me'];

/** Everything here runs inside a member-scoped transaction: RLS limits every query to the caller. */
async function loadMe(tx: Tx, actor: Actor, media: MediaStore): Promise<MeDto> {
  const profile = await tx
    .selectFrom('profiles')
    .select(['id', 'first_name', 'last_name', 'phone', 'locale', 'avatar_path'])
    .where('id', '=', actor.userId)
    .executeTakeFirst();
  if (!profile) throw notFound('profile');

  const member = await tx
    .selectFrom('members')
    .select(['id', 'member_number', 'first_name', 'last_name'])
    .where('user_id', '=', actor.userId)
    .executeTakeFirst();

  return {
    id: profile.id,
    firstName: profile.first_name,
    lastName: profile.last_name,
    phone: profile.phone,
    avatarUrl: profile.avatar_path ? media.url(profile.avatar_path) : null,
    locale: profile.locale as MeDto['locale'],
    roles: actor.roles,
    permissions: [...actor.permissions].sort(),
    aal: actor.aal,
    isPlatformAdmin: actor.isPlatformAdmin,
    member: member
      ? {
          id: member.id,
          memberNumber: member.member_number,
          firstName: member.first_name,
          lastName: member.last_name,
        }
      : null,
  };
}

export const meRoutes = [
  defineRoute({
    method: 'get',
    path: '/me',
    access: access.self,
    summary: 'Current user profile and linked member',
    tags,
    response: meDto,
    handler: async ({ actor, deps }) => ({
      data: await withMemberTx(deps.db, actor!, (tx) => loadMe(tx, actor!, deps.media)),
    }),
  }),
  defineRoute({
    method: 'patch',
    path: '/me',
    access: access.self,
    summary: 'Update own name, phone or language',
    tags,
    body: updateMeBody,
    response: meDto,
    handler: async ({ body, actor, deps }) => ({
      data: await withMemberTx(deps.db, actor!, async (tx) => {
        await tx
          .updateTable('profiles')
          .set({
            ...(body.firstName !== undefined && { first_name: body.firstName }),
            ...(body.lastName !== undefined && { last_name: body.lastName }),
            ...(body.phone !== undefined && { phone: body.phone }),
            ...(body.locale !== undefined && { locale: body.locale }),
          })
          .where('id', '=', actor!.userId)
          .execute();
        return loadMe(tx, actor!, deps.media);
      }),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/me/avatar',
    access: access.self,
    summary: 'Upload my profile photo (JPEG/PNG/WebP, max 1 MB, resized by the app)',
    tags,
    body: trainerPhotoBody,
    response: meDto,
    handler: async ({ body, actor, deps }) => {
      const img = decodeImage(body.image);
      const key = mediaKey('avatars', actor!.userId, img.ext);
      await deps.media.put(key, img.data, img.type);
      return {
        data: await withMemberTx(deps.db, actor!, async (tx) => {
          const old = await tx
            .selectFrom('profiles')
            .select('avatar_path')
            .where('id', '=', actor!.userId)
            .executeTakeFirst();
          await tx
            .updateTable('profiles')
            .set({ avatar_path: key })
            .where('id', '=', actor!.userId)
            .execute();
          if (old?.avatar_path) await deps.media.remove(old.avatar_path).catch(() => undefined);
          return loadMe(tx, actor!, deps.media);
        }),
      };
    },
  }),
  defineRoute({
    method: 'delete',
    path: '/me/avatar',
    access: access.self,
    summary: 'Remove my profile photo',
    tags,
    response: meDto,
    handler: async ({ actor, deps }) => ({
      data: await withMemberTx(deps.db, actor!, async (tx) => {
        const old = await tx
          .selectFrom('profiles')
          .select('avatar_path')
          .where('id', '=', actor!.userId)
          .executeTakeFirst();
        await tx
          .updateTable('profiles')
          .set({ avatar_path: null })
          .where('id', '=', actor!.userId)
          .execute();
        if (old?.avatar_path) await deps.media.remove(old.avatar_path).catch(() => undefined);
        return loadMe(tx, actor!, deps.media);
      }),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/export',
    access: access.self,
    summary: 'Download everything the club stores about me (JSON)',
    tags,
    response: z.record(z.string(), z.unknown()),
    handler: async ({ actor, deps }) => ({
      data: await createAccountService(deps.db).exportData(actor!),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/delete-account',
    access: access.self,
    summary: 'Delete my account: personal data removed, bookkeeping records anonymized',
    tags,
    body: deleteAccountBody,
    response: z.object({ deleted: z.literal(true) }),
    handler: async ({ actor, req, deps }) => {
      await createAccountService(deps.db).deleteAccount(actor!, req, {
        media: deps.media,
        authAdmin: deps.authAdmin,
      });
      return { data: { deleted: true as const } };
    },
  }),
];
