import type { ExerciseDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { useWorkout } from './workout-store';

/**
 * Exercise library, cached in the workout store so logging works without internet.
 * Falls back to the cached list when the request fails.
 */
export function useLibrary() {
  const { i18n } = useTranslation();
  const cached = useWorkout((s) => s.library);
  const cachedLocale = useWorkout((s) => s.libraryLocale);
  const q = useQuery({
    queryKey: ['exercises', i18n.language],
    queryFn: () => api.get<ExerciseDto[]>('/public/exercises', { locale: i18n.language }),
    staleTime: 60 * 60_000,
  });
  useEffect(() => {
    if (q.data) useWorkout.getState().setLibrary(q.data, i18n.language);
  }, [q.data, i18n.language]);
  const data = q.data ?? (cached.length ? cached : undefined);
  return {
    data,
    byId: new Map((data ?? []).map((e) => [e.id, e])),
    isPending: q.isPending && !cached.length,
    offline: !q.data && Boolean(cached.length),
    stale: !q.data && cachedLocale !== i18n.language,
  };
}

export {
  estimate1rm,
  formatDuration,
  parseDecimal,
  parseDuration,
  usesDistance,
  usesReps,
  usesTime,
  usesWeight,
} from './units';
