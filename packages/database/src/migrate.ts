import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path of the repo's `supabase/` directory. */
export const supabaseDir = path.resolve(here, '../../../supabase');
export const shimFile = path.resolve(here, 'shim/supabase-shim.sql');

/** Migration files in apply order (Supabase CLI naming: <timestamp>_<name>.sql). */
export async function listMigrations(
  dir = path.join(supabaseDir, 'migrations'),
): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  return files.map((f) => path.join(dir, f));
}

/**
 * Applies SQL files in order, each inside its own transaction.
 * Used for local tests only; real environments use `supabase db push`.
 */
export async function applySqlFiles(client: pg.Client, files: string[]): Promise<void> {
  for (const file of files) {
    const sql = await readFile(file, 'utf8');
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw new Error(`Failed applying ${path.basename(file)}: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }
}
