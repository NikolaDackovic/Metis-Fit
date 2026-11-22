import type { WorkoutSessionInput, WorkoutSetInput } from '@grit/validation';

/** RFC 4122 v4 - IDs are created on the device so offline workouts sync idempotently. */
export function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export type DraftSet = WorkoutSetInput & { done: boolean };
export interface DraftWorkout {
  id: string;
  startedAt: string;
  note: string;
  /** Exercise order as added by the member. */
  exerciseIds: string[];
  sets: DraftSet[];
}

/** Builds the payload for the server: only completed sets, in order, re-indexed. */
export function toSessionInput(
  w: DraftWorkout,
  endedAt = new Date().toISOString(),
): WorkoutSessionInput {
  const done = w.sets.filter((s) => s.done);
  const ordered = w.exerciseIds.flatMap((ex) => done.filter((s) => s.exerciseId === ex));
  return {
    id: w.id,
    startedAt: w.startedAt,
    endedAt,
    note: w.note.trim() || null,
    sets: ordered.map(({ done: _done, ...s }, i) => ({ ...s, setIndex: i })),
  };
}
