import { z } from 'zod';
import {
  alertsDto,
  announcementDto,
  createAnnouncementBody,
  markReadBody,
  normalizeLocaleParam,
  notificationListDto,
  notificationPreferencesDto,
  pushTokenBody,
  updateNotificationPreferencesBody,
} from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createNotificationService } from './notifications.service';

const TAG = ['Notifications'];
const ok = z.object({ ok: z.literal(true) });

export const notificationsRoutes = [
  defineRoute({
    method: 'get',
    path: '/me/notifications',
    access: access.self,
    summary: 'My notifications (latest 100) and the unread count',
    tags: TAG,
    response: notificationListDto,
    handler: async ({ actor, deps }) => ({
      data: await createNotificationService(deps.db).list(actor!),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/notifications/read',
    access: access.self,
    summary: 'Mark notifications as read (all when no IDs are given)',
    tags: TAG,
    body: markReadBody,
    response: notificationListDto,
    handler: async ({ actor, body, deps }) => ({
      data: await createNotificationService(deps.db).markRead(actor!, body.ids),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/notification-preferences',
    access: access.self,
    summary: 'Which notifications I want (per category) and whether push is on',
    tags: TAG,
    response: notificationPreferencesDto,
    handler: async ({ actor, deps }) => ({
      data: await createNotificationService(deps.db).preferences(actor!),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/me/notification-preferences',
    access: access.self,
    summary: 'Update notification preferences',
    tags: TAG,
    body: updateNotificationPreferencesBody,
    response: notificationPreferencesDto,
    handler: async ({ actor, body, deps }) => ({
      data: await createNotificationService(deps.db).updatePreferences(actor!, body),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/push-tokens',
    access: access.self,
    summary: 'Register this device for push notifications',
    tags: TAG,
    body: pushTokenBody,
    response: ok,
    handler: async ({ actor, body, deps }) => ({
      data: await createNotificationService(deps.db).registerToken(
        actor!,
        body.token,
        body.platform,
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/push-tokens/remove',
    access: access.self,
    summary: 'Unregister this device (on sign-out)',
    tags: TAG,
    body: pushTokenBody.pick({ token: true }),
    response: ok,
    handler: async ({ actor, body, deps }) => ({
      data: await createNotificationService(deps.db).removeToken(actor!, body.token),
    }),
  }),

  // ── Staff ───────────────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/alerts',
    access: access.can('alerts.read'),
    summary:
      'Alert center: memberships ending soon, debts, passive members, birthdays and new sign-ups',
    tags: TAG,
    query: z.object({ locale: normalizeLocaleParam }),
    response: alertsDto,
    handler: async ({ actor, query, deps }) => ({
      data: await createNotificationService(deps.db).alerts(actor!, query.locale),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/announcements',
    access: access.can('notifications.send'),
    summary: 'Sent announcements (latest 50)',
    tags: TAG,
    response: z.array(announcementDto),
    handler: async ({ deps }) => ({
      data: await createNotificationService(deps.db).announcements(),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/announcements',
    access: access.can('notifications.send'),
    summary:
      'Send an announcement to all members with the app (or only those with an active membership)',
    tags: TAG,
    body: createAnnouncementBody,
    response: z.object({ id: z.string(), recipients: z.number() }),
    handler: async ({ actor, body, req, deps }) => ({
      status: 201,
      data: await createNotificationService(deps.db).announce(actor!, req, body),
    }),
  }),
];
