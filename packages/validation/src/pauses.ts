import { z } from 'zod';
import { isoDate, uuid } from './common';

/**
 * F13-2 membership pause ("freeze"). The member asks, staff approve; an approved pause moves the
 * end date by its length and closes the entry while it runs. Limits come from the plan.
 */
export const PAUSE_STATUSES = ['requested', 'approved', 'rejected', 'cancelled'] as const;
export type PauseStatus = (typeof PAUSE_STATUSES)[number];

const note = z.string().trim().max(300, { error: 'validation.too_long' });

export const pauseRequestBody = z
  .object({
    membershipId: uuid,
    startsOn: isoDate,
    endsOn: isoDate,
    reason: note.optional(),
  })
  .refine((b) => b.endsOn >= b.startsOn, { path: ['endsOn'], error: 'validation.date_range' });
export type PauseRequestBody = z.infer<typeof pauseRequestBody>;

/** Staff enter a pause directly (already approved), e.g. a member who asked at the desk. */
export const staffPauseBody = z
  .object({ startsOn: isoDate, endsOn: isoDate, reason: note.optional() })
  .refine((b) => b.endsOn >= b.startsOn, { path: ['endsOn'], error: 'validation.date_range' });
export type StaffPauseBody = z.infer<typeof staffPauseBody>;

export const pauseDecisionBody = z.object({ note: note.optional() });

export const pauseDto = z.object({
  id: z.string(),
  membershipId: z.string(),
  planName: z.string(),
  startsOn: z.string(),
  endsOn: z.string(),
  days: z.number().int(),
  status: z.enum(PAUSE_STATUSES),
  reason: z.string().nullable(),
  decisionNote: z.string().nullable(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  /** Staff lists only. */
  member: z
    .object({ id: z.string(), name: z.string(), memberNumber: z.string() })
    .nullable()
    .optional(),
});
export type PauseDto = z.infer<typeof pauseDto>;

/** What the plan allows for one membership, and how much of it is already used. */
export const pauseAllowanceDto = z.object({
  membershipId: z.string(),
  planName: z.string(),
  endDate: z.string(),
  maxPauses: z.number().int(),
  maxDays: z.number().int(),
  usedPauses: z.number().int(),
  usedDays: z.number().int(),
});
export type PauseAllowanceDto = z.infer<typeof pauseAllowanceDto>;

export const myPausesDto = z.object({
  items: z.array(pauseDto),
  /** Memberships that can be paused now (active, with an end date, plan allows pausing). */
  allowance: z.array(pauseAllowanceDto),
});
export type MyPausesDto = z.infer<typeof myPausesDto>;

export const pauseListQuery = z.object({
  status: z.enum(PAUSE_STATUSES).optional(),
  membershipId: uuid.optional(),
});
