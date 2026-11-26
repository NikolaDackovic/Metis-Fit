import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useMe } from './queries';

/**
 * F14-1: an account linked to a trainer profile (owners have every permission but may not
 * train, so the permission alone is not enough).
 */
export function useIsTrainer() {
  const canSchedule = Boolean(useMe().data?.permissions.includes('schedule.own'));
  const trainer = useQuery({
    queryKey: ['me', 'trainer'],
    queryFn: () => api.get<{ trainerId: string | null }>('/admin/me/trainer'),
    enabled: canSchedule,
    staleTime: 10 * 60_000,
  });
  return canSchedule && Boolean(trainer.data?.trainerId);
}
