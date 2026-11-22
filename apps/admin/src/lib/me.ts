import type { MeDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';

export function useMe() {
  const status = useAuth((s) => s.status);
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeDto>('/me'),
    enabled: status === 'signedIn',
    staleTime: 60_000,
  });
}

/** UI-only permission check. The API enforces every permission again on each request. */
export function useCan() {
  const { data } = useMe();
  const perms = new Set(data?.permissions ?? []);
  return (permission: string) => perms.has(permission);
}
