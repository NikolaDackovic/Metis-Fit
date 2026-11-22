import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ExerciseDto, SyncResultDto, WorkoutSessionInput } from '@grit/validation';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { api } from './api';
import { type DraftSet, type DraftWorkout, toSessionInput, uuid } from './workout-utils';

export { type DraftSet, type DraftWorkout, toSessionInput, uuid };

interface WorkoutState {
  active: DraftWorkout | null;
  /** Finished workouts not yet confirmed by the server. */
  pending: WorkoutSessionInput[];
  pendingDeletes: string[];
  /** Exercise library cache so logging works offline. */
  library: ExerciseDto[];
  libraryLocale: string | null;
  syncing: boolean;
  lastSyncError: string | null;

  start(): void;
  /** Starts (or extends) the workout with a plan day: its exercises and the planned number of sets. */
  startFromPlan(items: Array<{ exerciseId: string; sets: number | null }>): void;
  addExercise(exerciseId: string): void;
  removeExercise(exerciseId: string): void;
  addSet(exerciseId: string): void;
  updateSet(setId: string, patch: Partial<DraftSet>): void;
  removeSet(setId: string): void;
  setNote(note: string): void;
  finish(): void;
  discard(): void;
  deleteWorkout(id: string): void;
  setLibrary(list: ExerciseDto[], locale: string): void;
  sync(): Promise<void>;
  reset(): void;
}

export const useWorkout = create<WorkoutState>()(
  persist(
    (set, get) => ({
      active: null,
      pending: [],
      pendingDeletes: [],
      library: [],
      libraryLocale: null,
      syncing: false,
      lastSyncError: null,

      startFromPlan: (items) => {
        get().start();
        for (const it of items) {
          if (get().active?.exerciseIds.includes(it.exerciseId)) continue;
          get().addExercise(it.exerciseId);
          for (let i = 1; i < Math.min(it.sets ?? 1, 10); i += 1) get().addSet(it.exerciseId);
        }
      },

      start: () =>
        set((s) =>
          s.active
            ? s
            : {
                active: {
                  id: uuid(),
                  startedAt: new Date().toISOString(),
                  note: '',
                  exerciseIds: [],
                  sets: [],
                },
              },
        ),

      addExercise: (exerciseId) => {
        const a = get().active;
        if (!a || a.exerciseIds.includes(exerciseId)) return;
        set({ active: { ...a, exerciseIds: [...a.exerciseIds, exerciseId] } });
        get().addSet(exerciseId);
      },

      removeExercise: (exerciseId) => {
        const a = get().active;
        if (!a) return;
        set({
          active: {
            ...a,
            exerciseIds: a.exerciseIds.filter((x) => x !== exerciseId),
            sets: a.sets.filter((s) => s.exerciseId !== exerciseId),
          },
        });
      },

      /** New set pre-filled from the previous set of the same exercise (the usual gym flow). */
      addSet: (exerciseId) => {
        const a = get().active;
        if (!a) return;
        const prev = [...a.sets].reverse().find((s) => s.exerciseId === exerciseId);
        const next: DraftSet = {
          id: uuid(),
          exerciseId,
          setIndex: a.sets.length,
          reps: prev?.reps ?? null,
          weightKg: prev?.weightKg ?? null,
          durationS: prev?.durationS ?? null,
          distanceM: prev?.distanceM ?? null,
          rpe: null,
          completedAt: new Date().toISOString(),
          done: false,
        };
        set({ active: { ...a, sets: [...a.sets, next] } });
      },

      updateSet: (setId, patch) => {
        const a = get().active;
        if (!a) return;
        set({
          active: {
            ...a,
            sets: a.sets.map((s) =>
              s.id === setId
                ? {
                    ...s,
                    ...patch,
                    ...(patch.done && !s.done && { completedAt: new Date().toISOString() }),
                  }
                : s,
            ),
          },
        });
      },

      removeSet: (setId) => {
        const a = get().active;
        if (!a) return;
        set({ active: { ...a, sets: a.sets.filter((s) => s.id !== setId) } });
      },

      setNote: (note) => {
        const a = get().active;
        if (a) set({ active: { ...a, note } });
      },

      finish: () => {
        const a = get().active;
        if (!a) return;
        const input = toSessionInput(a);
        set((s) => ({
          active: null,
          pending:
            input.sets.length > 0 ? [...s.pending.filter((p) => p.id !== a.id), input] : s.pending,
        }));
        void get().sync();
      },

      discard: () => set({ active: null }),

      deleteWorkout: (id) => {
        set((s) => ({
          pending: s.pending.filter((p) => p.id !== id),
          pendingDeletes: [...new Set([...s.pendingDeletes, id])],
        }));
        void get().sync();
      },

      setLibrary: (library, libraryLocale) => set({ library, libraryLocale }),

      /** Sends everything pending. Safe to call any time (idempotent server side). */
      sync: async () => {
        const { pending, pendingDeletes, syncing } = get();
        if (syncing || (pending.length === 0 && pendingDeletes.length === 0)) return;
        set({ syncing: true });
        try {
          const batch = pending.slice(0, 20);
          const dels = pendingDeletes.slice(0, 50);
          const r = await api.post<SyncResultDto>('/me/workouts/sync', {
            sessions: batch,
            deletedSessionIds: dels,
          });
          const done = new Set([...r.saved, ...r.rejected]);
          const gone = new Set(r.deleted);
          set((s) => ({
            pending: s.pending.filter((p) => !done.has(p.id)),
            pendingDeletes: s.pendingDeletes.filter((d) => !gone.has(d)),
            lastSyncError: null,
          }));
        } catch (e) {
          set({ lastSyncError: e instanceof Error ? e.message : 'errors.network' });
        } finally {
          set({ syncing: false });
        }
        // More than one batch queued: continue.
        const s = get();
        if (!s.lastSyncError && (s.pending.length > 0 || s.pendingDeletes.length > 0))
          await s.sync();
      },

      /** On sign-out: another account must never see this member's data. */
      reset: () =>
        set({ active: null, pending: [], pendingDeletes: [], syncing: false, lastSyncError: null }),
    }),
    {
      name: 'grit.workouts.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        active: s.active,
        pending: s.pending,
        pendingDeletes: s.pendingDeletes,
        library: s.library,
        libraryLocale: s.libraryLocale,
      }),
    },
  ),
);
