import { describe, expect, it } from 'vitest';
import { groupByDay, openStatus, safeUrl, telHref, weekOrder, type OpeningHour } from './club';

const week: OpeningHour[] = [
  { weekday: 0, opensAt: null, closesAt: null, isClosed: true },
  ...[1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    opensAt: '07:00',
    closesAt: '23:00',
    isClosed: false,
  })),
  { weekday: 6, opensAt: '09:00', closesAt: '18:00', isClosed: false },
];
// 2026-11-19 is a Thursday. Belgrade is UTC+1 in November.
const at = (utc: string) => new Date(utc);

describe('opening status in club time', () => {
  it('open during the day, until closing', () => {
    expect(openStatus(week, at('2026-11-19T12:00:00Z'))).toEqual({ open: true, until: '23:00' });
  });
  it('before opening it opens today; after closing it opens the next open day', () => {
    expect(openStatus(week, at('2026-11-19T05:00:00Z'))).toEqual({
      open: false,
      next: { weekday: 4, at: '07:00', dayOffset: 0 },
    });
    // Saturday 20:00 local: Sunday closed, so Monday 07:00 (2 days later).
    expect(openStatus(week, at('2026-11-21T19:00:00Z'))).toEqual({
      open: false,
      next: { weekday: 1, at: '07:00', dayOffset: 2 },
    });
  });
  it('22:30 UTC on Thursday is 23:30 local: already closed', () => {
    expect(openStatus(week, at('2026-11-19T22:30:00Z'))).toMatchObject({ open: false });
  });
  it('week is shown from Monday', () => {
    expect(weekOrder(week).map((h) => h.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe('schedule and links', () => {
  it('groups by local day, sorted, without cancelled classes', () => {
    const c = (id: string, startsAt: string, status = 'scheduled') => ({
      id,
      typeName: 'CrossFit',
      color: '#E54E26',
      startsAt,
      endsAt: startsAt,
      spotsLeft: 3,
      roomName: null,
      trainer: null,
      status,
    });
    const g = groupByDay([
      c('b', '2026-11-19T18:00:00Z'),
      c('a', '2026-11-19T07:00:00Z'),
      c('x', '2026-11-19T09:00:00Z', 'cancelled'),
      c('late', '2026-11-19T23:30:00Z'), // 00:30 local on the 20th
    ]);
    expect(g.map((d) => [d.date, d.items.map((i) => i.id)])).toEqual([
      ['2026-11-19', ['a', 'b']],
      ['2026-11-20', ['late']],
    ]);
  });
  it('phone links and only http(s) URLs', () => {
    expect(telHref('+381 62 1090 771')).toBe('tel:+381621090771');
    expect(safeUrl('https://www.instagram.com/grit.rs/')).toBe(
      'https://www.instagram.com/grit.rs/',
    );
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl(42)).toBeNull();
  });
});
