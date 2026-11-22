/**
 * Local Postgres for tests - no Docker required.
 * Starts a real PostgreSQL 17 (embedded-postgres), applies the Supabase shim + all migrations
 * into a template database, and lets each test file clone an isolated database from it.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { applySqlFiles, listMigrations, shimFile, supabaseDir } from './migrate';

export const TEMPLATE_DB = 'grit_template';

export interface TestServer {
  /** Connection string to the server's `postgres` database (superuser). */
  adminUrl: string;
  stop: () => Promise<void>;
}

function urlFor(port: number, database: string): string {
  return `postgres://postgres:postgres@127.0.0.1:${port}/${database}`;
}

/** Starts Postgres and prepares the migrated template database. Call once (vitest globalSetup). */
export async function startTestServer(options: { seed?: boolean } = {}): Promise<TestServer> {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'grit-pg-'));
  const port = 54000 + Math.floor(Math.random() * 1000);
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: true, // we delete the temp dir ourselves (with Windows-safe retries) in stop()
    // Windows defaults to a non-UTF8 code page; force UTF-8 like Supabase.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
  });
  await server.initialise();
  await server.start();

  const admin = new pg.Client({ connectionString: urlFor(port, 'postgres') });
  await admin.connect();
  await admin.query(`create database ${TEMPLATE_DB}`);
  await admin.end();

  const tpl = new pg.Client({ connectionString: urlFor(port, TEMPLATE_DB) });
  await tpl.connect();
  try {
    const files = [shimFile, ...(await listMigrations())];
    if (options.seed) files.push(path.join(supabaseDir, 'seed', 'seed.sql'));
    await applySqlFiles(tpl, files);
  } finally {
    await tpl.end();
  }

  return {
    adminUrl: urlFor(port, 'postgres'),
    stop: async () => {
      await server.stop();
      // Windows keeps file handles briefly after the postgres process exits; retry, then give up quietly
      // (it is a temp dir - a leftover never affects correctness).
      await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }).catch(
        (error) => console.warn(`could not remove ${dataDir}: ${(error as Error).message}`),
      );
    },
  };
}

/** Creates an isolated database cloned from the migrated template. Returns its URL and a drop fn. */
export async function createTestDatabase(
  adminUrl: string,
): Promise<{ url: string; drop: () => Promise<void> }> {
  const name = `grit_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${name} template ${TEMPLATE_DB}`);
  await admin.end();
  const url = adminUrl.replace(/\/postgres$/, `/${name}`);
  return {
    url,
    drop: async () => {
      const c = new pg.Client({ connectionString: adminUrl });
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    },
  };
}
