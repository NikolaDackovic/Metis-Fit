import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import { AppError } from '../shared/errors';

export interface Actor {
  userId: string;
  /** Authenticator assurance level from Supabase: 'aal1' (password) or 'aal2' (MFA verified). */
  aal: 'aal1' | 'aal2';
  /** F12: the club this request works in; roles and permissions below are for this club. */
  clubId: string;
  /** F12-3: may manage every gym on the platform (approve, suspend). */
  isPlatformAdmin: boolean;
  roles: string[];
  permissions: ReadonlySet<string>;
  /** Raw verified claims, forwarded to Postgres for RLS-scoped member transactions. */
  claims: JWTPayload;
}

export type TokenVerifier = (token: string) => Promise<JWTPayload>;

/** Verifies Supabase access tokens via JWKS (asymmetric keys) or the legacy HS256 secret. */
export function createTokenVerifier(opts: {
  supabaseUrl?: string;
  jwtSecret?: string;
}): TokenVerifier {
  const verifyOptions = { audience: 'authenticated' };
  if (opts.supabaseUrl) {
    const base = opts.supabaseUrl.replace(/\/$/, '');
    const jwks: JWTVerifyGetKey = createRemoteJWKSet(
      new URL(`${base}/auth/v1/.well-known/jwks.json`),
    );
    const issuer = `${base}/auth/v1`;
    const secret = opts.jwtSecret ? new TextEncoder().encode(opts.jwtSecret) : null;
    return async (token) => {
      try {
        return (await jwtVerify(token, jwks, { ...verifyOptions, issuer })).payload;
      } catch (error) {
        // Projects migrating from the shared secret may still issue HS256 tokens.
        if (secret)
          return (await jwtVerify(token, secret, { ...verifyOptions, algorithms: ['HS256'] }))
            .payload;
        throw error;
      }
    };
  }
  if (!opts.jwtSecret) throw new Error('No JWT verification method configured');
  const secret = new TextEncoder().encode(opts.jwtSecret);
  return async (token) =>
    (await jwtVerify(token, secret, { ...verifyOptions, algorithms: ['HS256'] })).payload;
}

export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

export async function resolveActor(
  db: Kysely<DB>,
  verify: TokenVerifier,
  token: string,
  clubId: string,
): Promise<Actor> {
  let claims: JWTPayload;
  try {
    claims = await verify(token);
  } catch {
    throw new AppError('UNAUTHENTICATED', 'errors.auth.invalid_token');
  }
  const userId = claims.sub;
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new AppError('UNAUTHENTICATED', 'errors.auth.invalid_token');
  }

  const rows = await db
    .selectFrom('user_roles as ur')
    .innerJoin('roles as r', 'r.id', 'ur.role_id')
    .leftJoin('role_permissions as rp', 'rp.role_id', 'ur.role_id')
    .select(['r.key as role', 'rp.permission_key as permission'])
    .where('ur.user_id', '=', userId)
    .where('r.club_id', '=', clubId)
    .execute();

  // A deactivated staff profile loses all staff permissions immediately.
  const deactivated = await db
    .selectFrom('staff_profiles')
    .select(sql<boolean>`deactivated_at is not null`.as('off'))
    .where('user_id', '=', userId)
    .where('club_id', '=', clubId)
    .executeTakeFirst();
  const active = !deactivated?.off;
  const platform = await db
    .selectFrom('platform_admins')
    .select('user_id')
    .where('user_id', '=', userId)
    .executeTakeFirst();

  return {
    userId,
    clubId,
    isPlatformAdmin: Boolean(platform),
    aal: claims.aal === 'aal2' ? 'aal2' : 'aal1',
    roles: active ? [...new Set(rows.map((r) => r.role))] : [],
    permissions: new Set(active ? rows.flatMap((r) => (r.permission ? [r.permission] : [])) : []),
    claims,
  };
}

/** Roles that must have completed MFA (aal2) before using admin routes (docs/SECURITY.md §2). */
export const MFA_REQUIRED_ROLES = ['owner', 'manager'];
