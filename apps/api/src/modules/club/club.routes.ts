import { z } from 'zod';
import {
  clubAdminDto,
  clubMediaBody,
  clubPhotoBody,
  clubPhotoParams,
  clubProfileBody,
  openingHoursBody,
  updateClubPhotoBody,
} from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createClubService } from './club.service';

const TAG = ['Club'];
const slotParams = z.object({ slot: z.enum(['logo', 'login_image']) });
const svc = (deps: {
  db: Parameters<typeof createClubService>[0];
  media: Parameters<typeof createClubService>[1];
}) => createClubService(deps.db, deps.media);

export const clubRoutes = [
  defineRoute({
    method: 'get',
    path: '/admin/club',
    access: access.can('settings.manage'),
    summary: 'Club profile: name, slogan, contact, logo, login photo, gallery, opening hours',
    tags: TAG,
    response: clubAdminDto,
    handler: async ({ deps }) => ({ data: await svc(deps).get() }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/club',
    access: access.can('settings.manage'),
    summary: 'Update the club profile (shown in the apps and on the website)',
    tags: TAG,
    body: clubProfileBody,
    response: clubAdminDto,
    handler: async ({ actor, req, body, deps }) => ({
      data: await svc(deps).updateProfile(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/club/hours',
    access: access.can('settings.manage'),
    summary: 'Update the weekly opening hours',
    tags: TAG,
    body: openingHoursBody,
    response: clubAdminDto,
    handler: async ({ actor, req, body, deps }) => ({
      data: await svc(deps).updateHours(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/club/media/:slot',
    access: access.can('settings.manage'),
    summary: 'Upload the logo or the login photo (JPEG/PNG/WebP, max 1 MB)',
    tags: TAG,
    params: slotParams,
    body: clubMediaBody,
    response: clubAdminDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await svc(deps).setMedia(actor!, req, params.slot, body.image),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/admin/club/media/:slot',
    access: access.can('settings.manage'),
    summary: 'Reset the logo or the login photo to the built-in default',
    tags: TAG,
    params: slotParams,
    response: clubAdminDto,
    handler: async ({ actor, req, params, deps }) => ({
      data: await svc(deps).setMedia(actor!, req, params.slot, null),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/club/media/photos',
    access: access.can('settings.manage'),
    summary: 'Add a photo to the club gallery',
    tags: TAG,
    body: clubPhotoBody,
    response: clubAdminDto,
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await svc(deps).addPhoto(
        actor!,
        req,
        body.image,
        body.captions as Record<string, string>,
      ),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/club/photos/:id',
    access: access.can('settings.manage'),
    summary: 'Edit a gallery photo caption or position',
    tags: TAG,
    params: clubPhotoParams,
    body: updateClubPhotoBody,
    response: clubAdminDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await svc(deps).updatePhoto(
        actor!,
        req,
        params.id,
        body.captions as Record<string, string>,
        body.sortOrder,
      ),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/admin/club/photos/:id',
    access: access.can('settings.manage'),
    summary: 'Remove a gallery photo',
    tags: TAG,
    params: clubPhotoParams,
    response: clubAdminDto,
    handler: async ({ actor, req, params, deps }) => ({
      data: await svc(deps).removePhoto(actor!, req, params.id),
    }),
  }),
];
