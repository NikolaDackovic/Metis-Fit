import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../shared/errors';

/**
 * Entry by scanning the gym's QR with the member app. A screen at the door (admin "Entry screen")
 * shows a code that changes every few seconds and is valid for 30 s, so a photo of it is useless
 * later or from home. The code says which gym and which door; it is signed with the API secret.
 */
const PREFIX = 'K1';
const VALID_S = 30;
export const KIOSK_REFRESH_S = 15;

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sign = (secret: string, payload: string) =>
  createHmac('sha256', `${secret}:kiosk`).update(payload).digest('base64url');

export function issueKioskToken(
  secret: string,
  clubId: string,
  terminalId: string,
  now = Date.now(),
) {
  const exp = Math.floor(now / 1000) + VALID_S;
  const payload = b64(JSON.stringify({ c: clubId, t: terminalId, e: exp }));
  return {
    token: `${PREFIX}.${payload}.${sign(secret, payload)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    refreshInSec: KIOSK_REFRESH_S,
  };
}

export function verifyKioskToken(
  secret: string,
  token: string,
  now = Date.now(),
): { clubId: string; terminalId: string } {
  const [prefix, payload, sig] = token.trim().split('.');
  if (prefix !== PREFIX || !payload || !sig)
    throw new AppError('BUSINESS_RULE', 'errors.kiosk.invalid');
  const want = Buffer.from(sign(secret, payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got))
    throw new AppError('BUSINESS_RULE', 'errors.kiosk.invalid');
  let data: { c?: unknown; t?: unknown; e?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new AppError('BUSINESS_RULE', 'errors.kiosk.invalid');
  }
  if (typeof data.c !== 'string' || typeof data.t !== 'string' || typeof data.e !== 'number')
    throw new AppError('BUSINESS_RULE', 'errors.kiosk.invalid');
  if (data.e * 1000 < now) throw new AppError('BUSINESS_RULE', 'errors.kiosk.expired');
  return { clubId: data.c, terminalId: data.t };
}
