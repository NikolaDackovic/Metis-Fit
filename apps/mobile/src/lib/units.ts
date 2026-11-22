import type { ExerciseTracking } from '@grit/validation';

/** "3 × 5 · 100 kg", "60 s", "2.0 km · 10:00" - compact set summary. */
export function formatDuration(s: number | null | undefined): string {
  if (s == null) return '-';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m >= 60
    ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Parses "1:30", "90" (seconds) or "1:02:00" into seconds. */
export function parseDuration(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
  return t
    .split(':')
    .map(Number)
    .reduce((acc, n) => acc * 60 + n, 0);
}

/** Decimal input that accepts a comma ("82,5"). */
export function parseDecimal(v: string): number | null {
  const t = v.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export const usesWeight = (t: ExerciseTracking) => t === 'weight_reps';
export const usesReps = (t: ExerciseTracking) => t === 'weight_reps' || t === 'reps';
export const usesTime = (t: ExerciseTracking) => t === 'time' || t === 'distance_time';
export const usesDistance = (t: ExerciseTracking) => t === 'distance_time';

/** Epley estimate, same formula as the API (reps 1-10). */
export function estimate1rm(weight: number | null | undefined, reps: number | null | undefined) {
  if (!weight || !reps || reps < 1 || reps > 10) return null;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}
