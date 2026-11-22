import type { MyClubDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';

/**
 * F12: the gym the admin works in. Stored per browser; sent as `X-Club` with every request.
 * Empty = the default gym (GRIT), so a single-gym install never has to choose.
 */
const KEY = 'grit.admin.club';

export function currentClub(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Switches gym and reloads, so no data of the previous gym stays in memory or on screen. */
export function switchClub(slug: string | null, to = '/') {
  try {
    if (slug) localStorage.setItem(KEY, slug);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: stays on the default gym */
  }
  window.location.assign(to);
}

export function useMyClubs() {
  const status = useAuth((s) => s.status);
  return useQuery({
    queryKey: ['me', 'clubs'],
    queryFn: () => api.get<MyClubDto[]>('/me/clubs'),
    enabled: status === 'signedIn',
    staleTime: 60_000,
  });
}

/** Gyms where this person works (has a staff role). */
export const staffClubs = (clubs: MyClubDto[] | undefined) =>
  (clubs ?? []).filter((c) => c.roles.length > 0);
