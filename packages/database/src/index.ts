import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './db';

export type { DB } from './db';
export * from './db';

// Return DATE columns as 'YYYY-MM-DD' strings (no timezone shifting) and BIGINT as numbers.
pg.types.setTypeParser(1082, (v: string) => v);
pg.types.setTypeParser(20, (v: string) => Number(v));

export function createPool(connectionString: string, max = 10): pg.Pool {
  return new pg.Pool({ connectionString, max });
}

export function createDb(pool: pg.Pool): Kysely<DB> {
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}
