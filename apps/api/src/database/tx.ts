import { sql, type Kysely, type Transaction } from 'kysely';
import type { DB } from '@grit/database';
import type { Actor } from '../middleware/auth';
import { currentClubId } from '../shared/club-context';

export type Tx = Transaction<DB>;

/** F12: scope the transaction to the request's club (read by public.current_club_id()). */
async function scopeToClub(tx: Tx) {
  const clubId = currentClubId();
  if (clubId) await sql`select set_config('app.club_id', ${clubId}, true)`.execute(tx);
}

/**
 * Member-scoped transaction: runs as Postgres role `authenticated` with the caller's JWT claims,
 * so Row Level Security applies to the API exactly as it would to the client.
 * A missing WHERE clause in API code still cannot return another member's rows.
 */
export function withMemberTx<T>(
  db: Kysely<DB>,
  actor: Actor,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (tx) => {
    await scopeToClub(tx);
    await sql`select set_config('request.jwt.claims', ${JSON.stringify(actor.claims)}, true)`.execute(
      tx,
    );
    await sql`set local role authenticated`.execute(tx);
    return fn(tx);
  });
}

/** Public-content transaction: runs as role `anon`, so only publicly readable rows are visible. */
export function withAnonTx<T>(db: Kysely<DB>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction().execute(async (tx) => {
    await scopeToClub(tx);
    await sql`set local role anon`.execute(tx);
    return fn(tx);
  });
}

/**
 * Staff transaction on the privileged connection. Only reachable from routes guarded by
 * `access.can(permission)`; every mutation must write an audit record in the same transaction.
 */
export function withStaffTx<T>(db: Kysely<DB>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction().execute(async (tx) => {
    await scopeToClub(tx);
    // F12: never bypass RLS; club isolation policies apply to everything the API does.
    await sql`set local role grit_api`.execute(tx);
    return fn(tx);
  });
}
