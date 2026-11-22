import { z } from 'zod';

/**
 * F13-1 "How busy is the gym": people inside now and the usual number per hour on this weekday.
 * Counts only, never who. The owner can hide it and set the capacity (for a percentage).
 */
export const busyLevel = z.enum(['low', 'medium', 'high']);
export type BusyLevel = z.infer<typeof busyLevel>;

export const gymBusyDto = z.object({
  visible: z.boolean(),
  /** People inside right now (open visits). Null when hidden. */
  now: z.number().int().nullable(),
  capacity: z.number().int().nullable(),
  /** now / capacity; without a capacity, compared with this weekday's busiest hour. */
  level: busyLevel.nullable(),
  /** Usual people per hour today (same weekday, last 8 weeks), only while the gym is open. */
  typical: z.array(z.object({ hour: z.number().int(), people: z.number() })),
  /** Hour of the day in the gym's time zone (to highlight "now" in the chart). */
  currentHour: z.number().int(),
});
export type GymBusyDto = z.infer<typeof gymBusyDto>;

export const busySettingsBody = z.object({
  visible: z.boolean(),
  capacity: z.number().int().min(1).max(10_000).nullable(),
});
export type BusySettings = z.infer<typeof busySettingsBody>;
