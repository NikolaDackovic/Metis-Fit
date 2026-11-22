import { z } from 'zod';
import { isoDate, uuid } from './common';

/** Shifts, absences, non-working days, time clock and monthly payout (F11-2). */

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'validation.invalid_time' });
const note = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().trim().max(200, { error: 'validation.too_long' }).nullable().optional(),
);
const weekday = z.number().int().min(1).max(7);

export const shiftTypeBody = z
  .object({
    name: z.string().trim().min(1, { error: 'validation.required' }).max(40),
    startsAt: time,
    endsAt: time,
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, { error: 'validation.invalid_color' }),
    sortOrder: z.number().int().min(0).max(1000).default(0),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.startsAt !== v.endsAt, {
    message: 'validation.date_order',
    path: ['endsAt'],
  });
export type ShiftTypeBody = z.infer<typeof shiftTypeBody>;

export const shiftTypeDto = z.object({
  id: uuid,
  name: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  color: z.string(),
  sortOrder: z.number(),
  isActive: z.boolean(),
});
export type ShiftTypeDto = z.infer<typeof shiftTypeDto>;

/**
 * One employee, one period, one or more lines: "Mon-Wed first shift" + "Thu-Sat second shift"
 * is a single save with two lines.
 */
export const shiftRuleBody = z
  .object({
    userId: uuid,
    lines: z
      .array(
        z.object({
          shiftTypeId: uuid,
          weekdays: z.array(weekday).min(1, { error: 'validation.required' }).max(7),
        }),
      )
      .min(1)
      .max(7),
    validFrom: isoDate,
    validUntil: isoDate.nullable().default(null),
    note,
  })
  .refine((v) => !v.validUntil || v.validUntil >= v.validFrom, {
    message: 'validation.date_order',
    path: ['validUntil'],
  });
export type ShiftRuleBody = z.infer<typeof shiftRuleBody>;

export const shiftRuleDto = z.object({
  id: uuid,
  userId: uuid,
  userName: z.string(),
  shiftTypeId: uuid,
  weekdays: z.array(z.number()),
  validFrom: z.string(),
  validUntil: z.string().nullable(),
  note: z.string().nullable(),
});
export type ShiftRuleDto = z.infer<typeof shiftRuleDto>;

export const ABSENCE_KINDS = ['vacation', 'sick', 'day_off', 'holiday', 'other'] as const;
export const absenceKind = z.enum(ABSENCE_KINDS);
export type AbsenceKind = z.infer<typeof absenceKind>;

export const absenceBody = z
  .object({ userId: uuid, kind: absenceKind, startsOn: isoDate, endsOn: isoDate, note })
  .refine((v) => v.endsOn >= v.startsOn, { message: 'validation.date_order', path: ['endsOn'] });
export type AbsenceBody = z.infer<typeof absenceBody>;

export const absenceDto = z.object({
  id: uuid,
  userId: uuid,
  userName: z.string(),
  kind: absenceKind,
  startsOn: z.string(),
  endsOn: z.string(),
  note: z.string().nullable(),
});
export type AbsenceDto = z.infer<typeof absenceDto>;

export const closureBody = z.object({
  day: isoDate,
  name: z.string().trim().min(1, { error: 'validation.required' }).max(80),
  isClosed: z.boolean().default(true),
});
export type ClosureBody = z.infer<typeof closureBody>;
export const closureDto = z.object({
  id: uuid,
  day: z.string(),
  name: z.string(),
  isClosed: z.boolean(),
});
export type ClosureDto = z.infer<typeof closureDto>;

export const shiftWeekQuery = z.object({ start: isoDate.optional() });

const person = z.object({ userId: uuid, name: z.string() });

/** The weekly table: days in columns, shifts in rows, people in the cells. */
export const shiftWeekDto = z.object({
  monday: z.string(),
  days: z.array(
    z.object({
      date: z.string(),
      weekday: z.number(),
      closure: z.object({ name: z.string(), isClosed: z.boolean() }).nullable(),
    }),
  ),
  shiftTypes: z.array(shiftTypeDto),
  assignments: z.array(person.extend({ date: z.string(), shiftTypeId: uuid })),
  absences: z.array(person.extend({ date: z.string(), kind: absenceKind })),
});
export type ShiftWeekDto = z.infer<typeof shiftWeekDto>;

export const shiftPeopleDto = z.array(person.extend({ roles: z.array(z.string()) }));
export type ShiftPeopleDto = z.infer<typeof shiftPeopleDto>;

// ── Time clock and payout ────────────────────────────────────────────────────

export const clockStatusDto = z.object({
  open: z.object({ id: uuid, clockIn: z.string() }).nullable(),
  monthMinutes: z.number(),
  monthDays: z.number(),
});
export type ClockStatusDto = z.infer<typeof clockStatusDto>;

export const monthQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'validation.invalid_date' }),
});

export const payrollRowDto = z.object({
  userId: uuid,
  name: z.string(),
  days: z.number(),
  minutes: z.number(),
  openEntry: z.boolean(),
  hourlyRateMinor: z.number().nullable(),
  currency: z.string(),
  payoutMinor: z.number().nullable(),
});
export const payrollDto = z.object({
  month: z.string(),
  rows: z.array(payrollRowDto),
  totalMinor: z.number(),
});
export type PayrollDto = z.infer<typeof payrollDto>;

export const timeEntryDto = z.object({
  id: uuid,
  userId: uuid,
  clockIn: z.string(),
  clockOut: z.string().nullable(),
  minutes: z.number().nullable(),
  source: z.enum(['self', 'admin']),
  note: z.string().nullable(),
});
export type TimeEntryDto = z.infer<typeof timeEntryDto>;

export const timeEntriesQuery = monthQuery.extend({ userId: uuid });

export const timeEntryBody = z
  .object({
    userId: uuid,
    clockIn: z.iso.datetime({ offset: true }),
    clockOut: z.iso.datetime({ offset: true }).nullable(),
    note,
  })
  .refine((v) => !v.clockOut || v.clockOut > v.clockIn, {
    message: 'validation.date_order',
    path: ['clockOut'],
  });
export type TimeEntryBody = z.infer<typeof timeEntryBody>;

export const payRateBody = z.object({
  hourlyRateMinor: z.number().int().min(0).max(100_000_000),
});
