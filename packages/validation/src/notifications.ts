import { z } from 'zod';
import { uuid } from './common';

/** F8-1: in-app notifications, push tokens, preferences, announcements and the admin alert center. */

export const NOTIFICATION_CATEGORIES = [
  'membership',
  'classes',
  'club',
  'marketing',
  'coaching',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export const NOTIFICATION_KINDS = [
  'membership_expiring',
  'membership_expired',
  'class_reminder',
  'waitlist_promoted',
  'class_cancelled',
  'birthday',
  'announcement',
  'appointment_booked',
  'weekly_report',
  'training_nudge',
  'measure_nudge',
  'pause_approved',
  'pause_rejected',
  'referral_rewarded',
  'challenge_completed',
  'rating_prompt',
  'message',
  'pt_booked',
  'pt_cancelled',
  'pt_reminder',
  'trainer_day',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const notificationDto = z.object({
  id: z.string(),
  kind: z.string(),
  category: z.enum(NOTIFICATION_CATEGORIES),
  /** Values for the message template (`app.notify.<kind>.title/body`). */
  params: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  link: z.string().nullable(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});
export type NotificationDto = z.infer<typeof notificationDto>;
export const notificationListDto = z.object({
  items: z.array(notificationDto),
  unread: z.number(),
});
export type NotificationListDto = z.infer<typeof notificationListDto>;
export const markReadBody = z.object({
  /** Omit to mark everything as read. */
  ids: z.array(uuid).max(200).optional(),
});

export const notificationPreferencesDto = z.object({
  pushEnabled: z.boolean(),
  membership: z.boolean(),
  classes: z.boolean(),
  club: z.boolean(),
  /** Healthy-life nudges: weekly report, training and measurement reminders. */
  coaching: z.boolean(),
  /** Promotions; stored as the member's marketing consent (members only). */
  marketing: z.boolean(),
});
export type NotificationPreferencesDto = z.infer<typeof notificationPreferencesDto>;
export const updateNotificationPreferencesBody = notificationPreferencesDto.partial();

export const pushTokenBody = z.object({
  token: z.string().trim().min(10).max(300),
  platform: z.enum(['ios', 'android', 'web']),
});

// ── Announcements ─────────────────────────────────────────────────────────────
/** 'marketing' = only members who agreed to promotional messages (F8-2). */
export const ANNOUNCEMENT_AUDIENCES = ['all', 'active', 'marketing'] as const;
export const createAnnouncementBody = z.object({
  title: z
    .string()
    .trim()
    .min(1, { error: 'validation.required' })
    .max(120, { error: 'validation.too_long' }),
  body: z
    .string()
    .trim()
    .min(1, { error: 'validation.required' })
    .max(1000, { error: 'validation.too_long' }),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES),
});
export type CreateAnnouncementBody = z.infer<typeof createAnnouncementBody>;
export const announcementDto = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES),
  recipients: z.number(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
});
export type AnnouncementDto = z.infer<typeof announcementDto>;

// ── Alert center ──────────────────────────────────────────────────────────────
const alertMember = z.object({
  memberId: z.string(),
  name: z.string(),
  memberNumber: z.string(),
  phone: z.string().nullable(),
});
export const alertsDto = z.object({
  settings: z.object({ inactiveDays: z.number(), expiringDays: z.number() }),
  expiring: z.array(
    alertMember.extend({ planName: z.string(), endDate: z.string(), daysLeft: z.number() }),
  ),
  debts: z.array(
    alertMember.extend({ planName: z.string(), amount: z.number(), currency: z.string() }),
  ),
  /** "Passive": active membership but no visit for `inactiveDays` or more. */
  inactive: z.array(
    alertMember.extend({ lastVisitAt: z.string().nullable(), daysSince: z.number().nullable() }),
  ),
  birthdays: z.array(
    alertMember.extend({ date: z.string(), inDays: z.number(), age: z.number().nullable() }),
  ),
  signups: z.array(alertMember.extend({ createdAt: z.string(), hasMembership: z.boolean() })),
  /** F13-2: membership pauses members asked for, waiting for a decision. */
  pauseRequests: z.array(
    alertMember.extend({
      pauseId: z.string(),
      planName: z.string(),
      startsOn: z.string(),
      endsOn: z.string(),
      createdAt: z.string(),
    }),
  ),
  /** Memberships members asked for in the app, waiting for payment / activation. */
  requests: z.array(
    alertMember.extend({
      membershipId: z.string(),
      planName: z.string(),
      amount: z.number(),
      currency: z.string(),
      createdAt: z.string(),
    }),
  ),
});
export type AlertsDto = z.infer<typeof alertsDto>;
