import { z } from 'zod';
import {
  categoryDto,
  createEquipmentBody,
  equipmentAdminDto,
  equipmentDto,
  idParams,
  listEquipmentQuery,
  listMaintenanceQuery,
  maintenanceDto,
  mapBackgroundBody,
  mapBackgroundDto,
  mapDto,
  mapVisibilityBody,
  normalizeLocaleParam,
  reportProblemBody,
  saveMapDraftBody,
  updateEquipmentBody,
  updateMaintenanceBody,
} from '@grit/validation';
import { createAttemptLimiter } from '../../shared/attempt-limiter';
import { access, defineRoute } from '../../shared/route';
import { createEquipmentService, createMaintenanceService } from './equipment.service';
import { createMapService } from './map.service';

/** Members can report problems, but not flood the maintenance queue. */
export const reportLimiter = createAttemptLimiter({ max: 5, windowMs: 60 * 60_000 });

const localeQuery = z.object({ locale: normalizeLocaleParam });
const loc = (q: unknown, header: string | undefined) =>
  normalizeLocaleParam.parse((q as { locale?: string }).locale ?? header?.slice(0, 2));

export const facilityRoutes = [
  // ── Public (guests + members) ───────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/public/map',
    access: access.public,
    summary: 'Published facility map (hidden rooms excluded). Null until a map is published.',
    tags: ['Facility'],
    query: localeQuery,
    response: mapDto.nullable(),
    handler: async ({ query, deps, res }) => {
      res.setHeader('cache-control', 'public, max-age=120');
      return { data: await createMapService(deps.db, deps.media).getPublished(query.locale) };
    },
  }),
  defineRoute({
    method: 'get',
    path: '/public/equipment',
    access: access.public,
    summary: 'Equipment catalogue (active items)',
    tags: ['Facility'],
    query: listEquipmentQuery,
    response: z.array(equipmentDto),
    handler: async ({ query, req, deps }) => ({
      data: await createEquipmentService(deps.db).publicList(
        loc(query, req.get('accept-language')),
        query,
      ),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/public/equipment/:id',
    access: access.public,
    summary: 'Equipment detail with usage instructions and location',
    tags: ['Facility'],
    params: idParams,
    query: localeQuery,
    response: equipmentDto,
    handler: async ({ params, query, deps }) => ({
      data: await createEquipmentService(deps.db).publicGet(query.locale, params.id),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/public/equipment-categories',
    access: access.public,
    summary: 'Equipment categories',
    tags: ['Facility'],
    query: localeQuery,
    response: z.array(categoryDto),
    handler: async ({ query, deps }) => ({
      data: await createEquipmentService(deps.db).categories(query.locale),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/maintenance-reports',
    access: access.self,
    summary: 'Report a broken machine or a problem in a room',
    tags: ['Facility'],
    body: reportProblemBody,
    response: z.object({ id: z.string() }),
    handler: async ({ body, actor, req, deps }) => {
      reportLimiter.hit(actor!.userId);
      return {
        status: 201,
        data: await createMaintenanceService(deps.db).report(actor!, req, body),
      };
    },
  }),

  // ── Map editor ──────────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/map/draft',
    access: access.can('map.edit'),
    summary: 'Draft map for the editor (created from the published map on first use)',
    tags: ['Facility'],
    query: localeQuery,
    response: mapDto,
    handler: async ({ query, deps }) => ({
      data: await createMapService(deps.db, deps.media).getDraft(query.locale),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/map/draft',
    access: access.can('map.edit'),
    summary: 'Save the whole draft (optimistic lock via revision). Equipment is never deleted.',
    tags: ['Facility'],
    body: saveMapDraftBody,
    response: mapDto,
    handler: async ({ body, actor, req, deps }) => ({
      data: await createMapService(deps.db, deps.media).saveDraft(
        actor!,
        req,
        body,
        loc({}, req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/map/publish',
    access: access.can('map.publish'),
    summary: 'Publish the draft as a new map version (previous one is kept as history)',
    tags: ['Facility'],
    response: mapDto,
    handler: async ({ actor, req, deps }) => ({
      data: await createMapService(deps.db, deps.media).publish(
        actor!,
        req,
        loc({}, req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/map/background',
    access: access.can('map.edit'),
    summary: 'Upload a floor background (plan or photo, JPEG/PNG/WebP, max 1 MB); returns its path',
    tags: ['Facility'],
    body: mapBackgroundBody,
    response: mapBackgroundDto,
    handler: async ({ body, actor, req, deps }) => ({
      status: 201,
      data: await createMapService(deps.db, deps.media).uploadBackground(actor!, req, body.image),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/map/visibility',
    access: access.can('map.publish'),
    summary: 'Show or hide the facility map in the member app',
    tags: ['Facility'],
    body: mapVisibilityBody,
    response: z.object({ visible: z.boolean() }),
    handler: async ({ body, actor, req, deps }) => ({
      data: await createMapService(deps.db, deps.media).setVisibility(actor!, req, body.visible),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/map/versions',
    access: access.can('map.edit'),
    summary: 'Published map history',
    tags: ['Facility'],
    handler: async ({ deps }) => ({ data: await createMapService(deps.db, deps.media).versions() }),
  }),

  // ── Equipment administration ────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/equipment',
    access: access.can('equipment.manage'),
    summary: 'All equipment with internal fields and open requests',
    tags: ['Facility'],
    query: listEquipmentQuery,
    response: z.array(equipmentAdminDto),
    handler: async ({ query, req, deps }) => ({
      data: await createEquipmentService(deps.db).adminList(
        loc(query, req.get('accept-language')),
        query,
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/equipment',
    access: access.can('equipment.manage'),
    summary: 'Add equipment',
    tags: ['Facility'],
    body: createEquipmentBody,
    response: equipmentAdminDto,
    handler: async ({ body, actor, req, deps }) => ({
      status: 201,
      data: await createEquipmentService(deps.db).create(
        actor!,
        req,
        body,
        loc({}, req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'patch',
    path: '/admin/equipment/:id',
    access: access.can('equipment.manage'),
    summary: 'Edit equipment (incl. status)',
    tags: ['Facility'],
    params: idParams,
    body: updateEquipmentBody,
    response: equipmentAdminDto,
    handler: async ({ params, body, actor, req, deps }) => ({
      data: await createEquipmentService(deps.db).update(
        actor!,
        req,
        params.id,
        body,
        loc({}, req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/equipment/:id/archive',
    access: access.can('equipment.manage'),
    summary: 'Archive equipment (kept for history)',
    tags: ['Facility'],
    params: idParams,
    response: equipmentAdminDto,
    handler: async ({ params, actor, req, deps }) => ({
      data: await createEquipmentService(deps.db).archive(
        actor!,
        req,
        params.id,
        loc({}, req.get('accept-language')),
      ),
    }),
  }),

  // ── Maintenance ─────────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/maintenance',
    access: access.can('maintenance.manage'),
    summary: 'Maintenance requests (open first, by priority)',
    tags: ['Facility'],
    query: listMaintenanceQuery,
    response: z.array(maintenanceDto),
    handler: async ({ query, req, deps }) => {
      const { items, total } = await createMaintenanceService(deps.db).list(
        loc({}, req.get('accept-language')),
        query,
      );
      return { data: items, meta: { page: query.page, pageSize: query.pageSize, total } };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/admin/maintenance',
    access: access.can('maintenance.manage'),
    summary: 'Staff logs a problem',
    tags: ['Facility'],
    body: reportProblemBody,
    response: z.object({ id: z.string() }),
    handler: async ({ body, actor, req, deps }) => ({
      status: 201,
      data: await createMaintenanceService(deps.db).report(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'patch',
    path: '/admin/maintenance/:id',
    access: access.can('maintenance.manage'),
    summary: 'Change status/priority, add resolution note, optionally set the machine status',
    tags: ['Facility'],
    params: idParams,
    body: updateMaintenanceBody,
    response: maintenanceDto,
    handler: async ({ params, body, actor, req, deps }) => ({
      data: await createMaintenanceService(deps.db).update(
        actor!,
        req,
        params.id,
        body,
        loc({}, req.get('accept-language')),
      ),
    }),
  }),
];
