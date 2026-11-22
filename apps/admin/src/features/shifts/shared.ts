import type { ShiftPeopleDto, ShiftTypeDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { intlLocale } from '@/lib/i18n';

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Monday of the week of a YYYY-MM-DD date. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}

/** Short and long weekday names in the UI language (Mon = 1). 2024-01-01 was a Monday. */
export function useWeekdayNames() {
  const { i18n } = useTranslation();
  const loc = intlLocale(i18n.language);
  const name = (wd: number, style: 'short' | 'long') =>
    new Intl.DateTimeFormat(loc, { weekday: style, timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, 0, wd)),
    );
  return { short: (wd: number) => name(wd, 'short'), long: (wd: number) => name(wd, 'long') };
}

/** [1,2,3,5] -> "Mon-Wed, Fri" */
export function daysLabel(days: number[], short: (wd: number) => string): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    parts.push(
      j - i >= 2
        ? `${short(sorted[i]!)}-${short(sorted[j]!)}`
        : sorted
            .slice(i, j + 1)
            .map(short)
            .join(', '),
    );
    i = j;
  }
  return parts.join(', ');
}

/** Hex color with alpha, for soft cell backgrounds. */
export const tint = (hex: string, alpha = 0.22) =>
  `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;

export function useShiftTypes(enabled = true) {
  return useQuery({
    queryKey: ['shifts', 'types'],
    queryFn: () => api.get<ShiftTypeDto[]>('/admin/shifts/types'),
    enabled,
  });
}

export function useShiftPeople(enabled = true) {
  return useQuery({
    queryKey: ['shifts', 'people'],
    queryFn: () => api.get<ShiftPeopleDto>('/admin/shifts/people'),
    enabled,
  });
}

export const minutesLabel = (m: number) =>
  `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
