import { formatMoney, INTL_LOCALE, normalizeLocale } from '@grit/translations';
import { useTranslation } from 'react-i18next';

export function useFormat() {
  const { i18n } = useTranslation();
  const lng = normalizeLocale(i18n.language);
  const loc = INTL_LOCALE[lng];
  return {
    money: (minor: number, currency = 'RSD') => formatMoney(minor, currency, lng),
    /** 'YYYY-MM-DD' → localized date without time-zone shifting */
    date: (
      d: string | null | undefined,
      opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' },
    ) =>
      d
        ? new Intl.DateTimeFormat(loc, { ...opts, timeZone: 'UTC' }).format(
            new Date(`${d.slice(0, 10)}T00:00:00Z`),
          )
        : '-',
    number: (n: number) => new Intl.NumberFormat(loc).format(n),
    /** "19:00" in club time */
    time: (d: string) =>
      new Intl.DateTimeFormat(loc, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Belgrade',
      }).format(new Date(d)),
    dateTime: (d: string) =>
      new Intl.DateTimeFormat(loc, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Belgrade',
      }).format(new Date(d)),
  };
}

/** Greeting key by local hour in the club's time zone. */
export function greetingKey(now = new Date()): 'morning' | 'day' | 'evening' {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Europe/Belgrade',
    }).format(now),
  );
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'day';
  return 'evening';
}

/** Share of the membership period already used (0-1), for the progress bar. */
export function periodProgress(start: string, end: string | null, today: string): number | null {
  if (!end) return null;
  const s = Date.parse(start);
  const e = Date.parse(end) + 86_400_000; // valid through the end date
  const t = Date.parse(today);
  if (e <= s) return 1;
  return Math.min(1, Math.max(0, (t - s) / (e - s)));
}

export function clubToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(new Date());
}

/** ISO weekday (1 = Monday … 7 = Sunday) in the club's time zone. */
export function clubWeekday(now = new Date()): number {
  const short = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    timeZone: 'Europe/Belgrade',
  }).format(now);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(short) + 1;
}
