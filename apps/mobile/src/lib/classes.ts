import type { BookingDto, ClassRulesDto, ClassSessionDto } from '@grit/validation';

export type ClassAction =
  | { kind: 'book' }
  | { kind: 'waitlist' }
  | { kind: 'cancel'; late: boolean }
  | { kind: 'leave_waitlist' }
  | { kind: 'not_open'; opensAt: string }
  | { kind: 'closed' }
  | { kind: 'cancelled' };

/**
 * What the member can do with a session right now. The API enforces the same rules; this only
 * decides which button to show (DECISIONS A15).
 */
export function classAction(
  s: ClassSessionDto,
  booking: BookingDto | undefined,
  rules: ClassRulesDto | undefined,
  now = new Date(),
): ClassAction {
  if (s.status === 'cancelled') return { kind: 'cancelled' };
  const start = Date.parse(s.startsAt);
  if (booking?.status === 'confirmed') {
    if (start <= now.getTime()) return { kind: 'closed' };
    const cutoff = (rules?.cancelCutoffMinutes ?? 120) * 60_000;
    return { kind: 'cancel', late: start - now.getTime() < cutoff };
  }
  if (booking?.status === 'waitlisted') {
    return start <= now.getTime() ? { kind: 'closed' } : { kind: 'leave_waitlist' };
  }
  if (start <= now.getTime()) return { kind: 'closed' };
  if (Date.parse(s.bookingOpensAt) > now.getTime())
    return { kind: 'not_open', opensAt: s.bookingOpensAt };
  return s.spotsLeft > 0 ? { kind: 'book' } : { kind: 'waitlist' };
}

/** The next `n` club-local days starting today, as YYYY-MM-DD. */
export function nextDays(today: string, n: number): string[] {
  const base = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) =>
    new Date(base + i * 86_400_000).toISOString().slice(0, 10),
  );
}

/** Club-local calendar day (YYYY-MM-DD) of an ISO timestamp. */
export const clubDayOf = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(new Date(iso));
