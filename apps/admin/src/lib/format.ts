import { formatMoney as fm, normalizeLocale } from '@grit/translations';
import { useTranslation } from 'react-i18next';
import { intlLocale } from './i18n';

/** Locale-aware formatters bound to the current UI language. */
export function useFormat() {
  const { i18n } = useTranslation();
  const lng = normalizeLocale(i18n.language);
  const loc = intlLocale(lng);
  return {
    money: (minor: number, currency = 'RSD') => fm(minor, currency, lng),
    /** Always two decimals (invoices, VAT): 2.659,20 RSD. */
    money2: (minor: number, currency = 'RSD') =>
      new Intl.NumberFormat(loc, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(minor / 100),
    /** 'YYYY-MM-DD' date (no time zone shift) */
    date: (d: string | null | undefined) =>
      d
        ? new Intl.DateTimeFormat(loc, {
            day: 'numeric',
            month: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`))
        : '-',
    /** Club time of day (HH:MM). */
    time: (d: string | null | undefined) =>
      d
        ? new Intl.DateTimeFormat(loc, {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Belgrade',
          }).format(new Date(d))
        : '-',
    dateTime: (d: string | null | undefined) =>
      d
        ? new Intl.DateTimeFormat(loc, {
            day: 'numeric',
            month: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Belgrade',
          }).format(new Date(d))
        : '-',
    number: (n: number) => new Intl.NumberFormat(loc).format(n),
  };
}

/** Converts a user-entered RSD amount ("5.500", "5500,50") to minor units. */
export function parseMoneyInput(value: string): number | null {
  const cleaned = value
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** Today in the club's time zone, YYYY-MM-DD. */
export function clubToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(new Date());
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
}
