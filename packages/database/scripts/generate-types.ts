/**
 * Regenerates src/db.ts (Kysely types) from the migrations, using a throwaway local Postgres.
 * Run after adding a migration: `pnpm --filter @grit/database db:types`
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, startTestServer } from '../src/testing';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../src/db.ts');

const server = await startTestServer();
const db = await createTestDatabase(server.adminUrl);
try {
  const bin = path.resolve(here, '../../../node_modules/.bin/kysely-codegen');
  execFileSync(
    bin,
    [
      '--dialect',
      'postgres',
      '--out-file',
      out,
      '--include-pattern',
      'public.*',
      '--date-parser',
      'string',
      '--url',
      db.url,
    ],
    {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );
} finally {
  await db.drop();
  await server.stop();
}
