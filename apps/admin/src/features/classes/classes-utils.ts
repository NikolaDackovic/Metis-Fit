import type { ClassTypeDto, TrainerAdminDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { intlLocale } from '@/lib/i18n';

export function useTrainers() {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['trainers', i18n.language],
    queryFn: () => api.get<TrainerAdminDto[]>('/admin/trainers'),
    staleTime: 60_000,
  });
}

export function useClassTypes() {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['class-types', i18n.language],
    queryFn: () => api.get<ClassTypeDto[]>('/admin/class-types'),
    staleTime: 60_000,
  });
}

/** Monday (ISO week start) of the week containing `date` (YYYY-MM-DD), as YYYY-MM-DD. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const iso = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - iso);
  return d.toISOString().slice(0, 10);
}

/** Club-local calendar day (YYYY-MM-DD) of an ISO timestamp. */
export const clubDay = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(new Date(iso));

export function useClassFormat() {
  const { i18n } = useTranslation();
  const loc = intlLocale(i18n.language);
  return {
    time: (iso: string) =>
      new Intl.DateTimeFormat(loc, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Belgrade',
      }).format(new Date(iso)),
    /** "pon 17.11." */
    day: (date: string) =>
      new Intl.DateTimeFormat(loc, {
        weekday: 'short',
        day: 'numeric',
        month: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${date}T00:00:00Z`)),
    dayLong: (date: string) =>
      new Intl.DateTimeFormat(loc, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }).format(new Date(`${date}T00:00:00Z`)),
    /** ISO weekday 1..7 → localized name */
    weekday: (n: number) =>
      new Intl.DateTimeFormat(loc, { weekday: 'long', timeZone: 'UTC' }).format(
        new Date(Date.UTC(2024, 0, n)), // 2024-01-01 is a Monday
      ),
  };
}

/** "2026-11-20" + "19:00" in club time → ISO timestamp with the correct offset (CET/CEST). */
export function clubDateTimeToIso(date: string, time: string): string {
  const naive = Date.parse(`${date}T${time}:00Z`);
  // Offset of Europe/Belgrade at that instant (iterate once to settle around DST changes).
  const offsetAt = (ms: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Belgrade',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    return asUtc - ms;
  };
  let ms = naive - offsetAt(naive);
  ms = naive - offsetAt(ms);
  return new Date(ms).toISOString();
}
