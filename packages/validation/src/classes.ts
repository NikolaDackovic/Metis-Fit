import { z } from 'zod';
import { isoDate, normalizeLocaleParam, pagination, personName, uuid } from './common';
import { zoneKey } from './plans';

/** Trainers, class types, the weekly schedule, sessions, bookings and personal training. */

const optText = (max: number) =>
  z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().trim().max(max, { error: 'validation.too_long' }).nullable().optional(),
  );
const name = z
  .string()
  .trim()
  .min(1, { error: 'validation.required' })
  .max(80, { error: 'validation.too_long' });
const roomKey = z.preprocess(
  (v) => (v === '' ? null : v),
  z
    .string()
    .regex(/^[a-z0-9_-]{1,40}$/, { error: 'validation.invalid_key' })
    .nullable()
    .optional(),
);
const capacity = z.number().int().min(1, { error: 'validation.min' }).max(200);
const duration = z.number().int().min(15, { error: 'validation.min' }).max(240);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'validation.invalid_time' });

// ── Trainers ──────────────────────────────────────────────────────────────────
const trainerTranslation = z.object({ title: optText(80), bio: optText(2000) });
export const createTrainerBody = z.object({
  firstName: personName,
  lastName: personName,
  instagram: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().replace(/^@/, '') || null : v),
    z
      .string()
      .regex(/^[A-Za-z0-9._]{1,30}$/, { error: 'validation.invalid_handle' })
      .nullable()
      .optional(),
  ),
  isPublic: z.boolean().default(false),
  offersPersonalTraining: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  translations: z
    .object({
      sr: trainerTranslation.optional(),
      en: trainerTranslation.optional(),
      ru: trainerTranslation.optional(),
    })
    .default({}),
});
export type CreateTrainerBody = z.infer<typeof createTrainerBody>;
export const updateTrainerBody = createTrainerBody
  .partial()
  .extend({ archived: z.boolean().optional() });
export type UpdateTrainerBody = z.infer<typeof updateTrainerBody>;
/** Resized image as a data URL or base64 (JPEG/PNG/WebP, ≤ 1 MB after decoding). */
export const trainerPhotoBody = z.object({
  image: z.string().min(16).max(1_500_000, { error: 'validation.image_too_large' }),
});

export const trainerDto = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  title: z.string().nullable(),
  bio: z.string().nullable(),
  instagram: z.string().nullable(),
  offersPersonalTraining: z.boolean(),
  photoUrl: z.string().nullable(),
  /** F13-7: average member rating (public list only, from 3 ratings up). */
  rating: z.object({ avg: z.number(), count: z.number().int() }).nullable().optional(),
});
export type TrainerDto = z.infer<typeof trainerDto>;
export const trainerAdminDto = trainerDto.extend({
  isPublic: z.boolean(),
  sortOrder: z.number(),
  archivedAt: z.string().nullable(),
  translations: z.record(
    z.string(),
    z.object({ title: z.string().nullable(), bio: z.string().nullable() }),
  ),
});
export type TrainerAdminDto = z.infer<typeof trainerAdminDto>;

// ── Class types ───────────────────────────────────────────────────────────────
const classTypeTranslation = z.object({ name, description: optText(2000) });
export const createClassTypeBody = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{2,40}$/, { error: 'validation.invalid_key' }),
  zone: zoneKey,
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, { error: 'validation.invalid_color' }),
  defaultDurationMin: duration.default(60),
  defaultCapacity: capacity.default(12),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  translations: z.object({
    sr: classTypeTranslation,
    en: classTypeTranslation.optional(),
    ru: classTypeTranslation.optional(),
  }),
});
export type CreateClassTypeBody = z.infer<typeof createClassTypeBody>;
export const updateClassTypeBody = createClassTypeBody.omit({ key: true }).partial();
export type UpdateClassTypeBody = z.infer<typeof updateClassTypeBody>;

export const classTypeDto = z.object({
  id: z.string(),
  key: z.string(),
  zone: z.string(),
  color: z.string(),
  defaultDurationMin: z.number(),
  defaultCapacity: z.number(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  translations: z
    .record(z.string(), z.object({ name: z.string(), description: z.string().nullable() }))
    .optional(),
});
export type ClassTypeDto = z.infer<typeof classTypeDto>;

// ── Weekly series ─────────────────────────────────────────────────────────────
export const createSeriesBody = z
  .object({
    classTypeId: uuid,
    trainerId: uuid.nullable().optional(),
    weekday: z.number().int().min(1).max(7),
    startTime: hhmm,
    durationMin: duration,
    capacity,
    roomKey,
    validFrom: isoDate.optional(),
    validUntil: isoDate.nullable().optional(),
  })
  .refine((v) => !v.validFrom || !v.validUntil || v.validUntil >= v.validFrom, {
    error: 'validation.date_order',
    path: ['validUntil'],
  });
export type CreateSeriesBody = z.infer<typeof createSeriesBody>;
/** Weekday/time are fixed: to move a class, end the series and create a new one. */
export const updateSeriesBody = z.object({
  trainerId: uuid.nullable().optional(),
  capacity: capacity.optional(),
  roomKey,
  validUntil: isoDate.nullable().optional(),
});
export type UpdateSeriesBody = z.infer<typeof updateSeriesBody>;

export const seriesDto = z.object({
  id: z.string(),
  classTypeId: z.string(),
  typeName: z.string(),
  color: z.string(),
  trainerId: z.string().nullable(),
  trainerName: z.string().nullable(),
  weekday: z.number(),
  startTime: z.string(),
  durationMin: z.number(),
  capacity: z.number(),
  roomKey: z.string().nullable(),
  validFrom: z.string(),
  validUntil: z.string().nullable(),
});
export type SeriesDto = z.infer<typeof seriesDto>;

// ── Sessions ──────────────────────────────────────────────────────────────────
export const listClassesQuery = z
  .object({ from: isoDate, to: isoDate, locale: normalizeLocaleParam })
  .refine((v) => v.to >= v.from, { error: 'validation.date_order', path: ['to'] });

export const createClassBody = z.object({
  classTypeId: uuid,
  trainerId: uuid.nullable().optional(),
  startsAt: z.iso.datetime({ offset: true, error: 'validation.invalid_date' }),
  durationMin: duration,
  capacity,
  roomKey,
  note: optText(500),
});
export type CreateClassBody = z.infer<typeof createClassBody>;
export const updateClassBody = createClassBody.omit({ classTypeId: true }).partial();
export type UpdateClassBody = z.infer<typeof updateClassBody>;
export const cancelClassBody = z.object({
  reason: z.string().trim().min(3, { error: 'validation.required' }).max(300),
});

export const CLASS_STATUSES = ['scheduled', 'cancelled'] as const;
export const classSessionDto = z.object({
  id: z.string(),
  classTypeId: z.string(),
  typeKey: z.string(),
  typeName: z.string(),
  color: z.string(),
  zone: z.string(),
  trainer: z.object({ id: z.string(), name: z.string() }).nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  capacity: z.number(),
  booked: z.number(),
  waitlisted: z.number(),
  spotsLeft: z.number(),
  roomKey: z.string().nullable(),
  roomName: z.string().nullable(),
  note: z.string().nullable(),
  status: z.enum(CLASS_STATUSES),
  /** When booking opens (window before start). */
  bookingOpensAt: z.string(),
});
export type ClassSessionDto = z.infer<typeof classSessionDto>;
export const classAdminDto = classSessionDto.extend({
  seriesId: z.string().nullable(),
  cancelledReason: z.string().nullable(),
});
export type ClassAdminDto = z.infer<typeof classAdminDto>;

export const classRulesDto = z.object({
  bookingWindowDays: z.number(),
  cancelCutoffMinutes: z.number(),
  strikeLimit: z.number(),
  strikeWindowDays: z.number(),
  banDays: z.number(),
});
export type ClassRulesDto = z.infer<typeof classRulesDto>;

// ── Bookings ──────────────────────────────────────────────────────────────────
export const BOOKING_STATUSES = [
  'confirmed',
  'waitlisted',
  'cancelled',
  'attended',
  'no_show',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const createBookingBody = z.object({
  classId: uuid,
  /** When the class is full, join the waitlist instead of failing. */
  waitlist: z.boolean().default(true),
});
export const staffBookingBody = z.object({ memberId: uuid });
export const attendanceBody = z.object({ status: z.enum(['attended', 'no_show', 'confirmed']) });

export const bookingDto = z.object({
  id: z.string(),
  classId: z.string(),
  status: z.enum(BOOKING_STATUSES),
  waitlistPosition: z.number().nullable(),
  promotedAt: z.string().nullable(),
  lateCancel: z.boolean(),
  createdAt: z.string(),
  cancelledAt: z.string().nullable(),
  class: classSessionDto,
});
export type BookingDto = z.infer<typeof bookingDto>;

export const myBookingsDto = z.object({
  upcoming: z.array(bookingDto),
  past: z.array(bookingDto),
  strikes: z.number(),
  bannedUntil: z.string().nullable(),
});
export type MyBookingsDto = z.infer<typeof myBookingsDto>;

export const rosterEntryDto = z.object({
  bookingId: z.string(),
  memberId: z.string(),
  memberNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  status: z.enum(BOOKING_STATUSES),
  source: z.enum(['app', 'staff']),
  waitlistPosition: z.number().nullable(),
  lateCancel: z.boolean(),
  createdAt: z.string(),
});
export type RosterEntryDto = z.infer<typeof rosterEntryDto>;
export const rosterDto = z.object({ class: classAdminDto, entries: z.array(rosterEntryDto) });
export type RosterDto = z.infer<typeof rosterDto>;

// ── Personal training ─────────────────────────────────────────────────────────
export const PT_REQUEST_STATUSES = [
  'new',
  'contacted',
  'scheduled',
  'closed',
  'cancelled',
] as const;
export type PtRequestStatus = (typeof PT_REQUEST_STATUSES)[number];

export const createPtRequestBody = z.object({
  trainerId: uuid.nullable().optional(),
  goal: z
    .string()
    .trim()
    .min(3, { error: 'validation.too_short' })
    .max(1000, { error: 'validation.too_long' }),
  preferredTimes: optText(300),
});
export type CreatePtRequestBody = z.infer<typeof createPtRequestBody>;
export const updatePtRequestBody = z.object({
  status: z.enum(PT_REQUEST_STATUSES).optional(),
  trainerId: uuid.nullable().optional(),
  staffNote: optText(1000),
});
export type UpdatePtRequestBody = z.infer<typeof updatePtRequestBody>;
export const listPtRequestsQuery = pagination.extend({
  status: z.enum(PT_REQUEST_STATUSES).optional(),
});

export const ptRequestDto = z.object({
  id: z.string(),
  trainerId: z.string().nullable(),
  trainerName: z.string().nullable(),
  goal: z.string(),
  preferredTimes: z.string().nullable(),
  status: z.enum(PT_REQUEST_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PtRequestDto = z.infer<typeof ptRequestDto>;
export const ptRequestAdminDto = ptRequestDto.extend({
  member: z.object({
    id: z.string(),
    memberNumber: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  }),
  staffNote: z.string().nullable(),
  handledByName: z.string().nullable(),
});
export type PtRequestAdminDto = z.infer<typeof ptRequestAdminDto>;

export const createPtSessionBody = z.object({
  trainerId: uuid.nullable().optional(),
  heldOn: isoDate.optional(),
  note: optText(500),
});
export const voidPtSessionBody = z.object({
  reason: z.string().trim().min(3, { error: 'validation.required' }).max(300),
});
export const ptSessionDto = z.object({
  id: z.string(),
  membershipId: z.string(),
  trainerName: z.string().nullable(),
  heldOn: z.string(),
  note: z.string().nullable(),
  voidedAt: z.string().nullable(),
  voidReason: z.string().nullable(),
  recordedByName: z.string().nullable(),
});
export type PtSessionDto = z.infer<typeof ptSessionDto>;
export const ptSessionsDto = z.object({
  sessions: z.array(ptSessionDto),
  visitLimit: z.number().nullable(),
  visitsUsed: z.number(),
});
export type PtSessionsDto = z.infer<typeof ptSessionsDto>;
