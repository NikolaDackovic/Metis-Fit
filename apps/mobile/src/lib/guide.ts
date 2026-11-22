import { secureStorage } from './storage';

/** F15-1: whether this account has seen the app guide on this device. */
const key = (userId: string) => `metis.guide_seen.${userId}`;

export async function guideSeen(userId: string): Promise<boolean> {
  try {
    return (await secureStorage.getItem(key(userId))) === '1';
  } catch {
    return true; // never block the app on storage problems
  }
}

export async function markGuideSeen(userId: string | undefined) {
  if (!userId) return;
  try {
    await secureStorage.setItem(key(userId), '1');
  } catch {
    /* storage unavailable: the guide may show again, nothing else breaks */
  }
}
