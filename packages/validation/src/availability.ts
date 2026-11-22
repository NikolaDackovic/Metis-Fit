import { z } from 'zod';

/** F14-4: when a trainer takes personal sessions, and booking a free slot from the app. */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'validation.invalid_time' });

export const availabilityBody = z
  .object({
    slotMinutes: z.number().int().min(30).max(120),
    rules: z
      .array(z.object({ weekday: z.number().int().min(1).max(7), startsAt: hhmm, endsAt: hhmm }))
      .max(21),
  })
  .refine((b) => b.rules.every((r) => r.endsAt > r.startsAt), {
    path: ['rules'],
    error: 'validation.time_order',
  });
export type AvailabilityBody = z.infer<typeof availabilityBody>;

export const freeSlotsDto = z.object({
  trainerId: z.string(),
  slotMinutes: z.number().int(),
  /** Start times (ISO) of free slots in the next 14 days. */
  slots: z.array(z.string()),
});
export type FreeSlotsDto = z.infer<typeof freeSlotsDto>;

export const bookSlotBody = z.object({ startsAt: z.iso.datetime() });
