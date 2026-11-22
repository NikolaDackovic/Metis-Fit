import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * QR access token (docs/SECURITY.md §5):  g1.<jti>.<sig>
 *  - jti: 16 random bytes (base64url) - the ONLY identifier in the QR, no personal data
 *  - sig: HMAC-SHA256(secret, "g1.<jti>") truncated to 16 bytes (base64url)
 *  - "g1" is the key version: rotating the secret = new prefix, old tokens simply stop verifying.
 * The token is also stored server-side (access_tokens) with expiry and single-use consumption.
 */
const VERSION = 'g1';
const PATTERN = /^g1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/;

const b64url = (buf: Buffer) => buf.toString('base64url');

function sign(secret: string, jti: string): string {
  return b64url(createHmac('sha256', secret).update(`${VERSION}.${jti}`).digest().subarray(0, 16));
}

/** 16 bytes rendered as a UUID string (the access_tokens primary key). */
function bytesToUuid(buf: Buffer): string {
  const h = buf.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function issueToken(secret: string): { token: string; jti: string } {
  const raw = randomBytes(16);
  // Mark as RFC 4122 v4 so the value is a well-formed uuid.
  raw[6] = (raw[6]! & 0x0f) | 0x40;
  raw[8] = (raw[8]! & 0x3f) | 0x80;
  const jtiB64 = b64url(raw);
  return { token: `${VERSION}.${jtiB64}.${sign(secret, jtiB64)}`, jti: bytesToUuid(raw) };
}

/** Returns the token's jti (uuid) when format and signature are valid; otherwise null. Constant-time compare. */
export function verifyToken(secret: string, token: string): string | null {
  const m = PATTERN.exec(token.trim());
  if (!m) return null;
  const [, jtiB64, sig] = m as unknown as [string, string, string];
  const expected = Buffer.from(sign(secret, jtiB64));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const raw = Buffer.from(jtiB64, 'base64url');
  return raw.length === 16 ? bytesToUuid(raw) : null;
}
