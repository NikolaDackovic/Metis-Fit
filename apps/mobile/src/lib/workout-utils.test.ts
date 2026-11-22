import { describe, expect, it } from 'vitest';
import { estimate1rm, formatDuration, parseDecimal, parseDuration } from './units';
import { type DraftWorkout, toSessionInput, uuid } from './workout-utils';

describe('units', () => {
  it('parses durations and decimals the way people type them', () => {
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('1:02:00')).toBe(3720);
    expect(parseDuration('1:')).toBeNull();
    expect(parseDecimal('82,5')).toBe(82.5);
    expect(parseDecimal('')).toBeNull();
    expect(formatDuration(3720)).toBe('1:02:00');
    expect(formatDuration(65)).toBe('1:05');
  });

  it('matches the API 1RM estimate (Epley, 1-10 reps)', () => {
    expect(estimate1rm(100, 5)).toBe(116.7);
    expect(estimate1rm(100, 12)).toBeNull();
  });
});

describe('workout payload', () => {
  it('sends only completed sets, grouped by exercise order and re-indexed', () => {
    const set = (id: string, exerciseId: string, done: boolean) => ({
      id,
      exerciseId,
      setIndex: 0,
      reps: 5,
      weightKg: 60,
      completedAt: '2026-11-17T10:00:00Z',
      done,
    });
    const w: DraftWorkout = {
      id: uuid(),
      startedAt: '2026-11-17T09:00:00Z',
      note: '  ',
      exerciseIds: ['squat', 'bench'],
      sets: [
        set('b1', 'bench', true),
        set('s1', 'squat', true),
        set('s2', 'squat', false),
        set('s3', 'squat', true),
      ],
    };
    const p = toSessionInput(w, '2026-11-17T10:30:00Z');
    expect(p.sets.map((s) => [s.id, s.setIndex])).toEqual([
      ['s1', 0],
      ['s3', 1],
      ['b1', 2],
    ]);
    expect(p.note).toBeNull();
    expect(p.sets[0]).not.toHaveProperty('done');
  });

  it('generates RFC 4122 v4 UUIDs', () => {
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
