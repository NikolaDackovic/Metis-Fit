import { z } from 'zod';
import { isoDate } from './common';

export const dashboardQuery = z
  .object({ from: isoDate, to: isoDate })
  .refine((v) => v.from <= v.to, { error: 'validation.date_range', path: ['to'] })
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= 366, {
    error: 'validation.date_range_too_long',
    path: ['to'],
  });
export type DashboardQuery = z.infer<typeof dashboardQuery>;

export const dashboardDto = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  today: z.string(),
  activeMembers: z.number(),
  expiringSoon: z.number(),
  expiredLast30Days: z.number(),
  newMembers: z.number(),
  checkinsToday: z.number(),
  revenue: z.object({
    total: z.number(),
    currency: z.string(),
    byMethod: z.array(z.object({ method: z.string(), amount: z.number(), count: z.number() })),
  }),
  daily: z.array(z.object({ date: z.string(), checkins: z.number(), revenue: z.number() })),
  expiringList: z.array(
    z.object({
      memberId: z.string(),
      memberName: z.string(),
      planName: z.string(),
      endDate: z.string().nullable(),
      visitsRemaining: z.number().nullable(),
    }),
  ),
});
export type DashboardDto = z.infer<typeof dashboardDto>;

export const noteBody = z
  .object({ body: z.string().trim().min(1, { error: 'validation.required' }).max(2000) })
  .strict();

export const auditEntryDto = z.object({
  id: z.number(),
  action: z.string(),
  actorName: z.string().nullable(),
  diff: z.unknown(),
  occurredAt: z.string(),
});
export type AuditEntryDto = z.infer<typeof auditEntryDto>;
