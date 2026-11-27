import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabaseDir } from '../src/migrate';
import { openTestDb, type TestDb } from './helpers';

let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
  await db.admin.query(await readFile(path.join(supabaseDir, 'seed', 'seed.sql'), 'utf8'));
});
afterAll(async () => db?.close());

describe('facility map', () => {
  it('seed publishes a snapshot separate from the draft', async () => {
    const { rows } = await db.admin.query(
      `select status, is_schematic, (select count(*)::int from floors f where f.map_version_id = v.id) floors
       from map_versions v order by version`,
    );
    expect(rows).toEqual([
      { status: 'draft', is_schematic: false, floors: 3 },
      { status: 'published', is_schematic: false, floors: 3 },
    ]);
  });

  it('anonymous users see only the published map and never hidden rooms', async () => {
    const rooms = await db.as('anon', (c) =>
      c.query<{ key: string }>('select key from public.rooms'),
    );
    const keys = rooms.rows.map((r) => r.key);
    expect(keys).toContain('crossfit');
    expect(keys).not.toContain('pool'); // "bazen" is hidden while under construction
    expect(new Set(keys).size).toBe(keys.length); // only one version visible
  });

  it('clients cannot read serial numbers or asset tags', async () => {
    await expect(
      db.as('anon', (c) => c.query('select serial_number from public.equipment')),
    ).rejects.toThrow(/permission denied/);
    const ok = await db.as('anon', (c) => c.query('select id, status from public.equipment'));
    expect(ok.rowCount).toBe(4);
  });

  it('deleting a room or a whole map version never deletes equipment', async () => {
    const before = await db.admin.query('select count(*)::int n from equipment');
    await db.admin.query(`delete from rooms where key = 'gym'`);
    await db.admin.query(`delete from map_versions where status = 'draft'`);
    const after = await db.admin.query('select count(*)::int n from equipment');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('allows only one draft and one published version', async () => {
    await expect(
      db.admin.query(`insert into map_versions (version, status) values (99, 'published')`),
    ).rejects.toThrow(/map_versions_one_published/);
  });
});
