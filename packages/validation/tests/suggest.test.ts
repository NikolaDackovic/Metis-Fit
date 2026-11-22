import { describe, expect, it } from 'vitest';
import type { ExerciseDto } from '../src';
import { autoFocus, recentMuscleDays, suggestWorkout } from '../src';

const ex = (
  id: string,
  muscle: string,
  category: ExerciseDto['category'] = 'strength',
): ExerciseDto => ({
  id,
  key: id,
  category,
  tracking: 'weight_reps',
  name: id,
  instructions: null,
  videoUrl: null,
  equipmentCategoryKey: null,
  muscles: [{ key: muscle, name: muscle, primary: true }],
  isActive: true,
});
const library = [
  ex('squat', 'quads'),
  ex('bench', 'chest'),
  ex('row', 'back'),
  ex('pulldown', 'back'),
  ex('rdl', 'hamstrings'),
  ex('press', 'shoulders'),
  ex('plank', 'core'),
  ex('curl', 'biceps'),
  ex('pushdown', 'triceps'),
  ex('burpee', 'full_body', 'crossfit'),
];

describe('workout suggestion', () => {
  it('is deterministic per seed, never repeats an exercise and respects the time budget', () => {
    const a = suggestWorkout(library, {
      focus: 'full_body',
      level: 'beginner',
      minutes: 45,
      seed: '2026-11-17',
    });
    const b = suggestWorkout(library, {
      focus: 'full_body',
      level: 'beginner',
      minutes: 45,
      seed: '2026-11-17',
    });
    expect(a).toEqual(b);
    expect(a.items).toHaveLength(5);
    expect(new Set(a.items.map((i) => i.exerciseId)).size).toBe(a.items.length);
    expect(a.items[0]).toMatchObject({ sets: 3, reps: '10-12', restS: 60 });
  });

  it('auto focus avoids muscles trained recently', () => {
    const recent = recentMuscleDays(
      [
        {
          startedAt: new Date(Date.now() - 86_400_000).toISOString(),
          exerciseIds: ['bench', 'press', 'squat'],
        },
      ],
      library,
    );
    expect(recent).toMatchObject({ chest: 1, shoulders: 1, quads: 1 });
    expect(autoFocus(recent)).toBe('pull');
    expect(autoFocus({})).toBe('full_body');
  });

  it('skips inactive exercises and slots without a match', () => {
    const lib = library.map((e) => (e.id === 'curl' ? { ...e, isActive: false } : e));
    const s = suggestWorkout(lib, { focus: 'upper', level: 'advanced', minutes: 60, seed: 'x' });
    expect(s.items.some((i) => i.exerciseId === 'curl')).toBe(false);
    expect(s.items.every((i) => i.sets === 4)).toBe(true);
  });
});
