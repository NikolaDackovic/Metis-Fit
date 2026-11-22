import { z } from 'zod';
import {
  attendanceBody,
  bookingDto,
  cancelClassBody,
  classAdminDto,
  classRulesDto,
  classSessionDto,
  classTypeDto,
  createBookingBody,
  createClassBody,
  createClassTypeBody,
  createPtRequestBody,
  createPtSessionBody,
  createSeriesBody,
  createTrainerBody,
  idParams,
  listClassesQuery,
  listPtRequestsQuery,
  myBookingsDto,
  normalizeLocaleParam,
  ptRequestAdminDto,
  ptRequestDto,
  ptSessionsDto,
  rosterDto,
  seriesDto,
  staffBookingBody,
  trainerAdminDto,
  trainerDto,
  trainerPhotoBody,
  updateClassBody,
  updateClassTypeBody,
  updatePtRequestBody,
  updateSeriesBody,
  updateTrainerBody,
  voidPtSessionBody,
} from '@grit/validation';
import { createAttemptLimiter } from '../../shared/attempt-limiter';
import { access, defineRoute } from '../../shared/route';
import { assertRange } from './classes.query';
import { createBookingService } from './bookings.service';
import { createPtService } from './pt.service';
import { createScheduleService } from './schedule.service';
import { createRatingService } from '../ratings/ratings.service';

/** A member can create a few PT requests per day (one open at a time is enforced by the DB). */
export const ptRequestLimiter = createAttemptLimiter({ max: 3, windowMs: 24 * 60 * 60_000 });
/** Booking/cancel churn per member (protects the waitlist from rapid toggling). */
export const bookingLimiter = createAttemptLimiter({ max: 30, windowMs: 60 * 60_000 });

const localeQuery = z.object({ locale: normalizeLocaleParam });
const headerLocale = (h: string | undefined) => normalizeLocaleParam.parse(h?.slice(0, 2));
const TAG = ['Classes'];

export const classesRoutes = [
  // ── Public ──────────────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/public/classes',
    access: access.public,
    summary: 'Group class schedule with free spots (max 14 days per request)',
    tags: TAG,
    query: listClassesQuery,
    response: z.array(classSessionDto),
    handler: async ({ query, deps }) => {
      assertRange(query.from, query.to, 14);
      return {
        data: await createScheduleService(deps.db, deps.media).publicSchedule(
          query.locale,
          query.from,
          query.to,
        ),
      };
    },
  }),
  defineRoute({
    method: 'get',
    path: '/public/class-types',
    access: access.public,
    summary: 'Active class types',
    tags: TAG,
    query: localeQuery,
    response: z.array(classTypeDto),
    handler: async ({ query, deps }) => ({
      data: await createScheduleService(deps.db, deps.media).publicClassTypes(query.locale),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/public/trainers',
    access: access.public,
    summary: 'Trainers who agreed to a public profile',
    tags: TAG,
    query: localeQuery,
    response: z.array(trainerDto),
    handler: async ({ query, deps }) => ({
      data: await (async () => {
        const [list, avgs] = await Promise.all([
          createScheduleService(deps.db, deps.media).publicTrainers(query.locale),
          createRatingService(deps.db).trainerAverages(),
        ]);
        return list.map((tr) => ({ ...tr, rating: avgs.get(tr.id) ?? null }));
      })(),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/public/class-rules',
    access: access.public,
    summary: 'Booking rules (window, free cancellation, no-show policy)',
    tags: TAG,
    response: classRulesDto,
    handler: async ({ deps }) => ({ data: await createBookingService(deps.db).rules() }),
  }),

  // ── Member ──────────────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/me/bookings',
    access: access.self,
    summary: 'My upcoming and past bookings, strikes and booking ban',
    tags: TAG,
    query: localeQuery,
    response: myBookingsDto,
    handler: async ({ actor, query, deps }) => ({
      data: await createBookingService(deps.db).mine(actor!, query.locale),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/bookings',
    access: access.self,
    summary:
      'Book a class (or join the waitlist when full). Capacity is enforced under a row lock.',
    tags: TAG,
    query: localeQuery,
    body: createBookingBody,
    response: bookingDto,
    handler: async ({ actor, query, body, deps }) => {
      bookingLimiter.hit(actor!.userId);
      return {
        status: 201,
        data: await createBookingService(deps.db).bookSelf(actor!, query.locale, body),
      };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/me/bookings/:id/cancel',
    access: access.self,
    summary: 'Cancel my booking; a freed spot goes to the first member on the waitlist',
    tags: TAG,
    params: idParams,
    query: localeQuery,
    response: z.object({ lateCancel: z.boolean(), booking: bookingDto }),
    handler: async ({ actor, params, query, deps }) => {
      bookingLimiter.hit(actor!.userId);
      return {
        data: await createBookingService(deps.db).cancelSelf(actor!, query.locale, params.id),
      };
    },
  }),
  defineRoute({
    method: 'get',
    path: '/me/pt-requests',
    access: access.self,
    summary: 'My personal-training requests',
    tags: TAG,
    response: z.array(ptRequestDto),
    handler: async ({ actor, deps }) => ({ data: await createPtService(deps.db).mine(actor!) }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/pt-requests',
    access: access.self,
    summary: 'Ask for personal training (the club contacts the member)',
    tags: TAG,
    body: createPtRequestBody,
    response: ptRequestDto,
    handler: async ({ actor, body, deps }) => {
      ptRequestLimiter.hit(actor!.userId);
      return { status: 201, data: await createPtService(deps.db).request(actor!, body) };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/me/pt-requests/:id/cancel',
    access: access.self,
    summary: 'Withdraw my open personal-training request',
    tags: TAG,
    params: idParams,
    response: ptRequestDto,
    handler: async ({ actor, params, deps }) => ({
      data: await createPtService(deps.db).cancelMine(actor!, params.id),
    }),
  }),

  // ── Admin: trainers and class types ─────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/trainers',
    access: access.can('classes.roster'),
    summary: 'All trainers (including hidden and archived)',
    tags: TAG,
    response: z.array(trainerAdminDto),
    handler: async ({ req, deps }) => ({
      data: await createScheduleService(deps.db, deps.media).listTrainers(
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/trainers',
    access: access.can('trainers.manage'),
    summary: 'Create a trainer profile',
    tags: TAG,
    body: createTrainerBody,
    response: trainerAdminDto,
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await createScheduleService(deps.db, deps.media).createTrainer(
        actor!,
        req,
        body,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'patch',
    path: '/admin/trainers/:id',
    access: access.can('trainers.manage'),
    summary: 'Edit or archive a trainer profile',
    tags: TAG,
    params: idParams,
    body: updateTrainerBody,
    response: trainerAdminDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createScheduleService(deps.db, deps.media).updateTrainer(
        actor!,
        req,
        params.id,
        body,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/trainers/:id/photo',
    access: access.can('trainers.manage'),
    summary: 'Upload a trainer photo (JPEG/PNG/WebP, ≤ 1 MB, resized by the client)',
    tags: TAG,
    params: idParams,
    body: trainerPhotoBody,
    response: trainerAdminDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createScheduleService(deps.db, deps.media).setTrainerPhoto(
        actor!,
        req,
        params.id,
        body.image,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/admin/trainers/:id/photo',
    access: access.can('trainers.manage'),
    summary: 'Remove the trainer photo',
    tags: TAG,
    params: idParams,
    response: trainerAdminDto,
    handler: async ({ actor, req, params, deps }) => ({
      data: await createScheduleService(deps.db, deps.media).setTrainerPhoto(
        actor!,
        req,
        params.id,
        null,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/class-types',
    access: access.can('classes.roster'),
    summary: 'All class types with translations',
    tags: TAG,
    response: z.array(classTypeDto),
    handler: async ({ req, deps }) => ({
      data: await createScheduleService(deps.db, deps.media).listTypes(
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/class-types',
    access: access.can('classes.manage'),
    summary: 'Create a class type',
    tags: TAG,
    body: createClassTypeBody,
    response: classTypeDto,
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await createScheduleService(deps.db, deps.media).createType(
        actor!,
        req,
        body,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'patch',
    path: '/admin/class-types/:id',
    access: access.can('classes.manage'),
    summary: 'Edit a class type',
    tags: TAG,
    params: idParams,
    body: updateClassTypeBody,
    response: classTypeDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createScheduleService(deps.db, deps.media).updateType(
        actor!,
        req,
        params.id,
        body,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),

  // ── Admin: weekly series and sessions ───────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/class-series',
    access: access.can('classes.manage'),
    summary: 'Weekly timetable (series that generate sessions)',
    tags: TAG,
    response: z.array(seriesDto),
    handler: async ({ req, deps }) => ({
      data: await createScheduleService(deps.db, deps.media).listSeries(
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/class-series',
    access: access.can('classes.manage'),
    summary: 'Add a weekly class; sessions are generated ahead automatically',
    tags: TAG,
    body: createSeriesBody,
    response: seriesDto,
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await createScheduleService(deps.db, deps.media).createSeries(
        actor!,
        req,
        body,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'patch',
    path: '/admin/class-series/:id',
    access: access.can('classes.manage'),
    summary: 'Change trainer / room / capacity of upcoming sessions, or end the series',
    tags: TAG,
    params: idParams,
    body: updateSeriesBody,
    response: z.object({ series: seriesDto, skippedCapacity: z.number() }),
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createScheduleService(deps.db, deps.media).updateSeries(
        actor!,
        req,
        params.id,
        body,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/classes',
    access: access.can('classes.roster'),
    summary: 'Sessions in a date range with booking counts (max 42 days)',
    tags: TAG,
    query: listClassesQuery,
    response: z.array(classAdminDto),
    handler: async ({ query, deps }) => {
      assertRange(query.from, query.to, 42);
      return {
        data: await createScheduleService(deps.db, deps.media).adminSchedule(
          query.locale,
          query.from,
          query.to,
        ),
      };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/admin/classes',
    access: access.can('classes.manage'),
    summary: 'Add a one-off session',
    tags: TAG,
    body: createClassBody,
    response: classAdminDto,
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await createScheduleService(deps.db, deps.media).createClass(
        actor!,
        req,
        body,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'patch',
    path: '/admin/classes/:id',
    access: access.can('classes.manage'),
    summary: 'Edit a session (capacity cannot drop below confirmed bookings)',
    tags: TAG,
    params: idParams,
    body: updateClassBody,
    response: classAdminDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createScheduleService(deps.db, deps.media).updateClass(
        actor!,
        req,
        params.id,
        body,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/classes/:id/cancel',
    access: access.can('classes.manage'),
    summary: 'Cancel a session and all its bookings (no penalty for members)',
    tags: TAG,
    params: idParams,
    body: cancelClassBody,
    response: z.object({ cancelledBookings: z.number() }),
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createScheduleService(deps.db, deps.media).cancelClass(
        actor!,
        req,
        params.id,
        body.reason,
      ),
    }),
  }),

  // ── Admin: roster and attendance ────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/classes/:id/roster',
    access: access.can('classes.roster'),
    summary: 'Who is booked, waitlisted and attended',
    tags: TAG,
    params: idParams,
    response: rosterDto,
    handler: async ({ params, req, deps }) => ({
      data: await createBookingService(deps.db).roster(
        params.id,
        headerLocale(req.get('accept-language')),
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/classes/:id/bookings',
    access: access.can('classes.roster'),
    summary: 'Book a member in at the desk (waitlist when full; window and ban do not apply)',
    tags: TAG,
    params: idParams,
    body: staffBookingBody,
    response: z.object({ id: z.string() }),
    handler: async ({ actor, req, params, body, deps }) => ({
      status: 201,
      data: await createBookingService(deps.db).staffBook(actor!, req, params.id, body.memberId),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/bookings/:id/cancel',
    access: access.can('classes.roster'),
    summary: 'Cancel a booking for a member (no penalty)',
    tags: TAG,
    params: idParams,
    response: z.object({ promoted: z.number() }),
    handler: async ({ actor, req, params, deps }) => ({
      data: await createBookingService(deps.db).staffCancel(actor!, req, params.id),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/bookings/:id/attendance',
    access: access.can('classes.roster'),
    summary: 'Mark attended / no-show (or undo)',
    tags: TAG,
    params: idParams,
    body: attendanceBody,
    response: z.object({ status: z.string() }),
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createBookingService(deps.db).markAttendance(actor!, req, params.id, body.status),
    }),
  }),

  // ── Admin: personal training ────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/pt-requests',
    access: access.can('pt.manage'),
    summary: 'Personal-training requests (open first)',
    tags: TAG,
    query: listPtRequestsQuery,
    response: z.array(ptRequestAdminDto),
    handler: async ({ query, deps }) => {
      const { items, total } = await createPtService(deps.db).list(query);
      return { data: items, meta: { page: query.page, pageSize: query.pageSize, total } };
    },
  }),
  defineRoute({
    method: 'patch',
    path: '/admin/pt-requests/:id',
    access: access.can('pt.manage'),
    summary: 'Update a PT request (status, trainer, internal note)',
    tags: TAG,
    params: idParams,
    body: updatePtRequestBody,
    response: ptRequestAdminDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createPtService(deps.db).update(actor!, req, params.id, body),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/memberships/:id/pt-sessions',
    access: access.can('pt.manage'),
    summary: 'Held PT sessions of a personal-training membership',
    tags: TAG,
    params: idParams,
    response: ptSessionsDto,
    handler: async ({ params, deps }) => ({
      data: await createPtService(deps.db).sessions(params.id),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/memberships/:id/pt-sessions',
    access: access.can('pt.manage'),
    summary: 'Record a held PT session (consumes one session)',
    tags: TAG,
    params: idParams,
    body: createPtSessionBody,
    response: ptSessionsDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      status: 201,
      data: await createPtService(deps.db).recordSession(actor!, req, params.id, body),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/pt-sessions/:id/void',
    access: access.can('pt.manage'),
    summary: 'Void a wrongly recorded PT session (gives the session back)',
    tags: TAG,
    params: idParams,
    body: voidPtSessionBody,
    response: ptSessionsDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createPtService(deps.db).voidSession(actor!, req, params.id, body.reason),
    }),
  }),
];
