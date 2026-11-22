import { secureStorage } from './storage';

/**
 * F12-4: the gym the member is using right now (slug), sent as `X-Club` with every request.
 * Kept on the phone; empty = the platform's default gym. Personal data (workouts, food log,
 * progress) is on the account and the same in every gym.
 */
const KEY = 'grit.club';
let current: string | null = null;
const listeners = new Set<() => void>();

export const selectedClub = () => current;

/** Loads the saved choice once at startup (before the first API call). */
export async function loadSelectedClub(): Promise<void> {
  try {
    current = await secureStorage.getItem(KEY);
  } catch {
    current = null;
  }
}

export async function selectClub(slug: string | null): Promise<void> {
  current = slug;
  try {
    if (slug) await secureStorage.setItem(KEY, slug);
    else await secureStorage.removeItem(KEY);
  } catch {
    /* the choice still applies for this session */
  }
  listeners.forEach((l) => l());
}

/** Called when the gym changes, e.g. to clear cached data of the previous gym. */
export function onClubChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
