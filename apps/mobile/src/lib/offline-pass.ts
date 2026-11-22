import type { AccessTokenDto } from '@grit/validation';
import { api } from './api';
import { secureStorage } from './storage';

/**
 * QR without internet (docs/SECURITY.md §5a): while online, keep one spare single-use QR on the
 * phone (Keychain / Keystore). It is shown only when the live 60 s code cannot be fetched.
 * The desk is online, so the spare code still works exactly once and only until it expires.
 */
const KEY = 'grit.offline_pass';
/** Fetch a fresh one when the stored pass has less than this left. */
const REFRESH_BEFORE_MS = 3 * 3600_000;

export type OfflinePass = { userId: string; token: string; expiresAt: string; shown?: boolean };

export async function readOfflinePass(userId: string): Promise<OfflinePass | null> {
  try {
    const raw = await secureStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as OfflinePass;
    if (p.userId !== userId || Date.parse(p.expiresAt) <= Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

/** Called while online (e.g. when the QR screen loads a live code). Never throws. */
export async function ensureOfflinePass(userId: string): Promise<void> {
  try {
    const current = await readOfflinePass(userId);
    // A shown code was probably used at the desk: replace it as soon as we are online again.
    if (current && !current.shown && Date.parse(current.expiresAt) - Date.now() > REFRESH_BEFORE_MS)
      return;
    const fresh = await api.post<AccessTokenDto>('/me/access-token/offline');
    await secureStorage.setItem(
      KEY,
      JSON.stringify({ userId, token: fresh.token, expiresAt: fresh.expiresAt }),
    );
  } catch {
    /* a spare code is a convenience; the live QR and the desk still work */
  }
}

/** Reads the spare code for display and remembers that it has been shown. */
export async function showOfflinePass(userId: string): Promise<OfflinePass | null> {
  const p = await readOfflinePass(userId);
  if (p && !p.shown)
    await secureStorage.setItem(KEY, JSON.stringify({ ...p, shown: true })).catch(() => undefined);
  return p;
}

/** After the spare code was used (or on sign-out) it must not be shown again. */
export async function clearOfflinePass(): Promise<void> {
  await secureStorage.removeItem(KEY).catch(() => undefined);
}
