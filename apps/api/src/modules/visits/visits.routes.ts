import { z } from 'zod';
import {
  addLockersBody,
  adminLockerMapDto,
  idParams,
  lockerMapDto,
  myVisitNowDto,
  normalizeLocaleParam,
  occupancyDto,
  pickLockerBody,
  updateLockerBody,
} from '@grit/validation';
import { createAttemptLimiter } from '../../shared/attempt-limiter';
import { access, defineRoute } from '../../shared/route';
import { createVisitService } from './visits.service';

/** Prevents a member from cycling through lockers to block them for others. */
export const lockerLimiter = createAttemptLimiter({ max: 20, windowMs: 60 * 60_000 });

const localeQuery = z.object({ locale: normalizeLocaleParam });
const headerLocale = (h: string | undefined) => normalizeLocaleParam.parse(h?.slice(0, 2));
const ok = z.object({ ok: z.boolean() });
const TAG = ['Visits'];

export const visitsRoutes = [
  defineRoute({
    method: 'get',
    path: '/me/visit',
    access: access.self,
    summary: 'My current visit (null when I am not inside) with my locker',
    tags: TAG,
    query: localeQuery,
    response: myVisitNowDto.nullable(),
    handler: async ({ actor, query, deps }) => ({
      data: await createVisitService(deps.db).mine(actor!, query.locale),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/lockers',
    access: access.self,
    summary: 'Changing rooms with free and taken lockers (no names)',
    tags: TAG,
    query: localeQuery,
    response: lockerMapDto,
    handler: async ({ actor, query, deps }) => ({
      data: await createVisitService(deps.db).lockerMap(actor!, query.locale),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/visit/locker',
    access: access.self,
    summary: 'Take a free locker for this visit (one winner when two guests pick the same one)',
    tags: TAG,
    query: localeQuery,
    body: pickLockerBody,
    response: myVisitNowDto,
    handler: async ({ actor, query, body, deps }) => {
      lockerLimiter.hit(actor!.userId);
      return {
        data: await createVisitService(deps.db).pickLocker(actor!, body.lockerId, query.locale),
      };
    },
  }),
  defineRoute({
    method: 'delete',
    path: '/me/visit/locker',
    access: access.self,
    summary: 'Give back my locker',
    tags: TAG,
    response: ok,
    handler: async ({ actor, deps }) => ({
      data: await createVisitService(deps.db).releaseLocker(actor!),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/visit/checkout',
    access: access.self,
    summary: 'I am leaving: ends the visit and frees my locker',
    tags: TAG,
    response: ok,
    handler: async ({ actor, deps }) => ({
      data: await createVisitService(deps.db).checkOut(actor!),
    }),
  }),

  // ── Staff ───────────────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/occupancy',
    access: access.can('attendance.read'),
    summary: 'Who is inside right now (with lockers)',
    tags: TAG,
    response: occupancyDto,
    handler: async ({ req, deps }) => ({
      data: await createVisitService(deps.db).occupancy(headerLocale(req.get('accept-language'))),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/visits/:id/checkout',
    access: access.can('attendance.checkin'),
    summary: 'Check a member out at the desk',
    tags: TAG,
    params: idParams,
    response: ok,
    handler: async ({ actor, req, params, deps }) => ({
      data: await createVisitService(deps.db).staffCheckOut(actor!, req, params.id),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/lockers',
    access: access.can('attendance.checkin'),
    summary: 'All lockers with status and current occupant',
    tags: TAG,
    response: adminLockerMapDto,
    handler: async ({ req, deps }) => ({
      data: await createVisitService(deps.db).adminLockers(
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/lockers',
    access: access.can('lockers.manage'),
    summary: 'Add a range of lockers to a changing room (existing numbers are skipped)',
    tags: TAG,
    body: addLockersBody,
    response: z.object({ added: z.number() }),
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await createVisitService(deps.db).addLockers(
        actor!,
        req,
        body.roomKey,
        body.from,
        body.to,
      ),
    }),
  }),
  defineRoute({
    method: 'patch',
    path: '/admin/lockers/:id',
    access: access.can('lockers.manage'),
    summary: 'Take a locker out of service (or back), with a note',
    tags: TAG,
    params: idParams,
    body: updateLockerBody,
    response: ok,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createVisitService(deps.db).updateLocker(actor!, req, params.id, body),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/lockers/:id/release',
    access: access.can('attendance.checkin'),
    summary: 'Free a locker (e.g. the guest left without checking out)',
    tags: TAG,
    params: idParams,
    response: ok,
    handler: async ({ actor, req, params, deps }) => ({
      data: await createVisitService(deps.db).staffReleaseLocker(actor!, req, params.id),
    }),
  }),
];
