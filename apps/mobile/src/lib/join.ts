import { api, ApiError } from './api';
import { PENDING_JOIN, type JoinDetails } from './auth';
import { secureStorage } from './storage';

/** dd.mm.yyyy or yyyy-mm-dd → yyyy-mm-dd; null when empty; undefined when invalid. */
export function parseBirthDate(v: string): string | null | undefined {
  const s = v.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const eu = /^(\d{1,2})[./](\d{1,2})[./](\d{4})\.?$/.exec(s);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (eu) [d, m, y] = [Number(eu[1]), Number(eu[2]), Number(eu[3])];
  else return undefined;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || y < 1900 || dt > new Date()) return undefined;
  return dt.toISOString().slice(0, 10);
}

/** Phone typed by a person → compact form, or undefined when it does not look like a number. */
export function cleanPhone(v: string): string | null | undefined {
  const s = v.trim();
  if (!s) return null;
  if (!/^\+?[\d\s/-]{6,20}$/.test(s)) return undefined;
  return s.replace(/[\s/-]/g, '');
}

/**
 * Details saved at sign-up become the member profile right after the first sign-in
 * (with e-mail confirmation the account does not exist until then). Already linked or
 * known at the front desk: the key is dropped and the person uses the link code.
 * Returns true when a member profile was created.
 */
export async function processPendingJoin(): Promise<boolean> {
  const raw = await secureStorage.getItem(PENDING_JOIN);
  if (!raw) return false;
  let details: JoinDetails;
  try {
    details = JSON.parse(raw) as JoinDetails;
  } catch {
    await secureStorage.removeItem(PENDING_JOIN);
    return false;
  }
  try {
    await api.post('/me/member', {
      phone: details.phone ?? undefined,
      dateOfBirth: details.dateOfBirth ?? undefined,
    });
    await secureStorage.removeItem(PENDING_JOIN);
    return true;
  } catch (e) {
    // Business answers (409/422) are final; network errors retry on the next start.
    if (e instanceof ApiError && e.status >= 400 && e.status < 500)
      await secureStorage.removeItem(PENDING_JOIN);
    return false;
  }
}
