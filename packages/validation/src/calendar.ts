import { z } from 'zod';

/** F14-8: the member's calendar subscription (only whether it is on; the secret is shown once). */
export const calendarFeedDto = z.object({
  active: z.boolean(),
  createdAt: z.string().nullable(),
  /** Only right after it was created: the secret part of the link. */
  token: z.string().nullable(),
});
export type CalendarFeedDto = z.infer<typeof calendarFeedDto>;

export const calendarTokenParams = z.object({
  token: z.string().regex(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/),
});
