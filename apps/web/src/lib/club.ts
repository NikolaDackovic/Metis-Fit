/** Pure helpers for the website (no DOM): tested in club.test.ts. */

export type OpeningHour = {
  weekday: number; // 0 = Sunday ... 6 = Saturday (same as Date.getDay)
  opensAt: string | null; // "07:00"
  closesAt: string | null;
  isClosed: boolean;
};

export type OpenStatus =
  | { open: true; until: string }
  | { open: false; next: { weekday: number; at: string; dayOffset: number } | null };

/** Weekday and minutes since midnight in the club's time zone. */
export function clubNow(now: Date, timeZone = 'Europe/Belgrade') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { weekday, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** "Open now until 23:00" or "Closed, opens tomorrow 07:00". */
export function openStatus(hours: OpeningHour[], now: Date, timeZone?: string): OpenStatus {
  const { weekday, minutes } = clubNow(now, timeZone);
  const byDay = new Map(hours.map((h) => [h.weekday, h]));
  const today = byDay.get(weekday);
  if (today && !today.isClosed && today.opensAt && today.closesAt) {
    const o = toMin(today.opensAt);
    const c = toMin(today.closesAt);
    if (minutes >= o && minutes < c) return { open: true, until: today.closesAt };
    if (minutes < o) return { open: false, next: { weekday, at: today.opensAt, dayOffset: 0 } };
  }
  for (let d = 1; d <= 7; d++) {
    const wd = (weekday + d) % 7;
    const h = byDay.get(wd);
    if (h && !h.isClosed && h.opensAt)
      return { open: false, next: { weekday: wd, at: h.opensAt, dayOffset: d } };
  }
  return { open: false, next: null };
}

/** Week starting Monday, as the club shows it. */
export function weekOrder(hours: OpeningHour[]) {
  return [1, 2, 3, 4, 5, 6, 0]
    .map((wd) => hours.find((h) => h.weekday === wd))
    .filter((h): h is OpeningHour => Boolean(h));
}

export function formatPrice(minor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

export type PublicClass = {
  id: string;
  typeName: string;
  color: string;
  startsAt: string;
  endsAt: string;
  spotsLeft: number;
  roomName: string | null;
  trainer: { id: string; name: string } | null;
  status: string;
};

/** Classes grouped by club-local date (YYYY-MM-DD), cancelled ones left out, in time order. */
export function groupByDay(classes: PublicClass[], timeZone = 'Europe/Belgrade') {
  const key = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone }); // YYYY-MM-DD
  const groups = new Map<string, PublicClass[]>();
  for (const c of [...classes]
    .filter((x) => x.status !== 'cancelled')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const k = key(c.startsAt);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  return [...groups.entries()].map(([date, items]) => ({ date, items }));
}

/** tel: link from a human phone number. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** Only http(s) links from the admin end up in href (no javascript: URLs). */
export function safeUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}
