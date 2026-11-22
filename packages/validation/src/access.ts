import { z } from 'zod';
import { isoDate, pagination, uuid } from './common';
import { membershipDisplayStatus } from './memberships';

export const ACCESS_REASON_CODES = [
  'OK',
  'TOKEN_INVALID',
  'TOKEN_EXPIRED',
  'TOKEN_REUSED',
  'NO_ACTIVE_MEMBERSHIP',
  'NO_VISITS_LEFT',
  'OUTSIDE_TIME_WINDOW',
  'MEMBER_DEACTIVATED',
  'MEMBER_NOT_LINKED',
  'MEMBERSHIP_PAUSED',
  'OVERRIDE',
] as const;
export type AccessReasonCode = (typeof ACCESS_REASON_CODES)[number];

export const accessTokenDto = z.object({
  token: z.string(),
  expiresAt: z.string(),
  /** Client should fetch a new token after this many seconds (before expiry). */
  refreshInSec: z.number(),
});
export type AccessTokenDto = z.infer<typeof accessTokenDto>;

const terminalId = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{2,40}$/, { error: 'validation.invalid_terminal' })
  .default('reception-1');

/** F13-6: the rotating door code shown on the entry screen (kiosk). */
export const kioskTokenQuery = z.object({ terminalId });
export const kioskTokenDto = z.object({
  token: z.string(),
  expiresAt: z.string(),
  refreshInSec: z.number(),
});
export type KioskTokenDto = z.infer<typeof kioskTokenDto>;
/** The member scanned the door code with the app. */
export const selfScanBody = z.object({ token: z.string().trim().min(1).max(400) }).strict();
export const kioskFeedQuery = z.object({ terminalId, since: z.iso.datetime().optional() });
export const kioskFeedItemDto = z.object({
  id: z.string(),
  firstName: z.string(),
  result: z.enum(['granted', 'denied']),
  reasonCode: z.string(),
  occurredAt: z.string(),
});
export type KioskFeedItemDto = z.infer<typeof kioskFeedItemDto>;

export const validateAccessBody = z
  .object({ token: z.string().trim().min(1).max(200), terminalId })
  .strict();

export const manualCheckinBody = z.object({ memberId: uuid, terminalId }).strict();

export const overrideCheckinBody = z
  .object({
    memberId: uuid,
    terminalId,
    reason: z.string().trim().min(5, { error: 'validation.reason_min' }).max(500),
  })
  .strict();

export const accessResultDto = z.object({
  attemptId: uuid,
  result: z.enum(['granted', 'denied']),
  reasonCode: z.enum(ACCESS_REASON_CODES),
  /** Non-blocking notices for reception, e.g. outstanding debt. */
  warnings: z.array(
    z.object({ code: z.literal('DEBT'), amount: z.number(), currency: z.string() }),
  ),
  consumedVisit: z.boolean(),
  member: z
    .object({
      id: uuid,
      memberNumber: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      photoUrl: z.string().nullable().optional(),
    })
    .nullable(),
  membership: z
    .object({
      id: uuid,
      planName: z.string(),
      displayStatus: membershipDisplayStatus,
      endDate: z.string().nullable(),
      visitsRemaining: z.number().nullable(),
    })
    .nullable(),
  occurredAt: z.string(),
});
export type AccessResultDto = z.infer<typeof accessResultDto>;

export const listAttendanceQuery = pagination.extend({
  from: isoDate.optional(),
  to: isoDate.optional(),
  result: z.enum(['granted', 'denied']).optional(),
});
export type ListAttendanceQuery = z.infer<typeof listAttendanceQuery>;

export const attendanceRowDto = z.object({
  id: uuid,
  occurredAt: z.string(),
  result: z.enum(['granted', 'denied']),
  reasonCode: z.string(),
  source: z.string(),
  terminalId: z.string().nullable(),
  memberId: uuid.nullable(),
  memberName: z.string().nullable(),
  memberNumber: z.string().nullable(),
  performedByName: z.string().nullable(),
  overrideReason: z.string().nullable(),
  consumedVisit: z.boolean(),
});
export type AttendanceRowDto = z.infer<typeof attendanceRowDto>;
