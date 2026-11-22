import { describe, expect, it } from 'vitest';
import { clubWeekday, greetingKey, periodProgress } from './format';

describe('periodProgress', () => {
  it('is 0 on the first day and 1 after the end date', () => {
    expect(periodProgress('2026-11-01', '2026-11-30', '2026-11-01')).toBe(0);
    expect(periodProgress('2026-11-01', '2026-11-30', '2026-12-01')).toBe(1);
  });
  it('counts the end date as a valid day', () => {
    expect(periodProgress('2026-11-01', '2026-11-30', '2026-11-30')).toBeCloseTo(29 / 30);
  });
  it('returns null for visit-only plans without an end date', () => {
    expect(periodProgress('2026-11-01', null, '2026-11-10')).toBeNull();
  });
});

describe('club time zone helpers', () => {
  it('greets by Belgrade time, not device time', () => {
    expect(greetingKey(new Date('2026-11-16T06:30:00Z'))).toBe('morning'); // 07:30 Belgrade
    expect(greetingKey(new Date('2026-11-16T13:00:00Z'))).toBe('day'); // 14:00
    expect(greetingKey(new Date('2026-11-16T22:30:00Z'))).toBe('evening'); // 23:30
  });
  it('returns ISO weekdays in Belgrade', () => {
    expect(clubWeekday(new Date('2026-11-16T12:00:00Z'))).toBe(1); // Monday
    expect(clubWeekday(new Date('2026-11-22T23:30:00Z'))).toBe(1); // Sunday 23:30 UTC = Monday 00:30 Belgrade
  });
});
