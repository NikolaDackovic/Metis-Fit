import { AsyncLocalStorage } from 'node:async_hooks';
import type { Kysely } from 'kysely';
import type { DB } from '@grit/database';
import { AppError } from './errors';

/**
 * F12: the gym (club) a request works in. Set once per request from the `X-Club` header
 * (club id or slug), otherwise the default club. Every database transaction copies it into
 * `app.club_id`, which `public.current_club_id()` and the club-isolation policies read.
 */
export const clubContext = new AsyncLocalStorage<{ clubId: string }>();

export const currentClubId = (): string | null => clubContext.getStore()?.clubId ?? null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;
let defaultClub: string | null = null;

/** Default club (the first gym); cached because it never changes at runtime. */
export async function defaultClubId(db: Kysely<DB>): Promise<string> {
  if (defaultClub) return defaultClub;
  const row = await db
    .selectFrom('clubs')
    .select('id')
    .where('is_default', '=', true)
    .executeTakeFirstOrThrow();
  defaultClub = row.id;
  return defaultClub;
}

/** Resolves the `X-Club` header. Suspended or unknown clubs are refused. */
export async function resolveClub(
  db: Kysely<DB>,
  header: string | undefined,
): Promise<{ id: string; status: string }> {
  const value = header?.trim();
  if (!value) return { id: await defaultClubId(db), status: 'active' };
  if (!UUID.test(value) && !SLUG.test(value))
    throw new AppError('NOT_FOUND', 'errors.club.not_found');
  const row = await db
    .selectFrom('clubs')
    .select(['id', 'status'])
    .where(UUID.test(value) ? 'id' : 'slug', '=', value)
    .executeTakeFirst();
  if (!row || row.status === 'suspended') throw new AppError('NOT_FOUND', 'errors.club.not_found');
  return row;
}
