import type { ExerciseDto } from './workouts';

/**
 * Rule-based workout suggestion ("what should I do today?"). No AI and no network: it picks
 * exercises from the club catalog by muscle group, skips muscles trained in the last two days
 * when the focus is automatic, and is deterministic for a given seed (e.g. today's date) so the
 * suggestion does not jump around between renders. Used by the member app (solo gym members)
 * and by trainers in the admin as a starting point for a plan day.
 */

export const SUGGEST_FOCUSES = [
  'full_body',
  'upper',
  'lower',
  'push',
  'pull',
  'conditioning',
] as const;
export type SuggestFocus = (typeof SUGGEST_FOCUSES)[number];
export const SUGGEST_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type SuggestLevel = (typeof SUGGEST_LEVELS)[number];
export const SUGGEST_MINUTES = [30, 45, 60] as const;

const SLOTS: Record<SuggestFocus, string[]> = {
  full_body: ['quads', 'chest', 'back', 'hamstrings', 'shoulders', 'core', 'glutes'],
  upper: ['chest', 'back', 'shoulders', 'back', 'biceps', 'triceps', 'chest'],
  lower: ['quads', 'hamstrings', 'glutes', 'quads', 'calves', 'core', 'hamstrings'],
  push: ['chest', 'shoulders', 'triceps', 'chest', 'shoulders', 'core', 'triceps'],
  pull: ['back', 'back', 'biceps', 'hamstrings', 'forearms', 'core', 'back'],
  conditioning: ['full_body', 'cardio', 'core', 'full_body', 'cardio', 'core', 'full_body'],
};
const SLOT_COUNT: Record<number, number> = { 30: 4, 45: 5, 60: 6 };
const DOSE: Record<SuggestLevel, { sets: number; reps: string; restS: number }> = {
  beginner: { sets: 3, reps: '10-12', restS: 60 },
  intermediate: { sets: 3, reps: '8-10', restS: 90 },
  advanced: { sets: 4, reps: '6-8', restS: 120 },
};
const TIMED_DOSE: Record<SuggestLevel, string> = {
  beginner: '30 s',
  intermediate: '45 s',
  advanced: '60 s',
};

export interface SuggestOptions {
  focus: SuggestFocus | 'auto';
  level: SuggestLevel;
  minutes: number;
  /** Muscle group key -> days since it was last trained (missing = not recently). */
  recentDays?: Record<string, number>;
  /** Any string; the same seed gives the same suggestion. */
  seed: string;
}
export interface SuggestedItem {
  exerciseId: string;
  name: string;
  muscle: string;
  sets: number;
  reps: string;
  restS: number;
}
export interface Suggestion {
  focus: SuggestFocus;
  items: SuggestedItem[];
}

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Focus whose muscles have rested the longest (ties go to full body). */
export function autoFocus(recentDays: Record<string, number> = {}): SuggestFocus {
  const rest = (m: string) => recentDays[m] ?? 99;
  let best: SuggestFocus = 'full_body';
  let bestScore = -1;
  for (const f of ['full_body', 'upper', 'lower', 'push', 'pull'] as const) {
    const muscles = [...new Set(SLOTS[f].slice(0, 4))];
    const score = Math.min(...muscles.map(rest));
    if (score > bestScore) [best, bestScore] = [f, score];
  }
  return best;
}

/** Days since each muscle group was last trained, from finished workouts. */
export function recentMuscleDays(
  workouts: Array<{ startedAt: string; exerciseIds: string[] }>,
  library: ExerciseDto[],
  now = new Date(),
): Record<string, number> {
  const byId = new Map(library.map((e) => [e.id, e]));
  const out: Record<string, number> = {};
  for (const w of workouts) {
    const days = Math.max(
      0,
      Math.floor((now.getTime() - new Date(w.startedAt).getTime()) / 86_400_000),
    );
    for (const id of w.exerciseIds) {
      for (const m of byId.get(id)?.muscles ?? []) {
        if (!m.primary) continue;
        out[m.key] = Math.min(out[m.key] ?? 99, days);
      }
    }
  }
  return out;
}

export function suggestWorkout(library: ExerciseDto[], opts: SuggestOptions): Suggestion {
  const focus = opts.focus === 'auto' ? autoFocus(opts.recentDays) : opts.focus;
  const random = rng(`${opts.seed}|${focus}|${opts.level}|${opts.minutes}`);
  const allowed = new Set(
    focus === 'conditioning'
      ? ['crossfit', 'cardio', 'strength', 'boxing']
      : ['strength', 'crossfit'],
  );
  const pool = library.filter((e) => e.isActive && allowed.has(e.category));
  const used = new Set<string>();
  const items: SuggestedItem[] = [];
  const count = SLOT_COUNT[opts.minutes] ?? 5;
  const dose = DOSE[opts.level];

  for (const muscle of SLOTS[focus]) {
    if (items.length >= count) break;
    const primary = pool.filter(
      (e) => !used.has(e.id) && e.muscles.some((m) => m.key === muscle && m.primary),
    );
    const candidates = primary.length
      ? primary
      : pool.filter((e) => !used.has(e.id) && e.muscles.some((m) => m.key === muscle));
    if (!candidates.length) continue;
    const pick = candidates[Math.floor(random() * candidates.length)]!;
    used.add(pick.id);
    const timed = pick.tracking !== 'weight_reps' && pick.tracking !== 'reps';
    items.push({
      exerciseId: pick.id,
      name: pick.name,
      muscle,
      sets: dose.sets,
      reps: timed ? TIMED_DOSE[opts.level] : dose.reps,
      restS: timed ? 60 : dose.restS,
    });
  }
  return { focus, items };
}
