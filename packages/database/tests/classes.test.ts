import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabaseDir } from '../src/migrate';
import { createUser, openTestDb, type TestDb } from './helpers';

let db: TestDb;
let a: { userId: string; memberId: string | null };
let b: { userId: string; memberId: string | null };
let classId: string;

beforeAll(async () => {
  db = await openTestDb();
  await db.admin.query(await readFile(path.join(supabaseDir, 'seed', 'seed.sql'), 'utf8'));
  a = await createUser(db.admin, { email: 'class-a@example.com', member: true });
  b = await createUser(db.admin, { email: 'class-b@example.com', member: true });
  const { rows } = await db.admin.query<{ id: string }>(
    `select id from classes where starts_at > now() order by starts_at limit 1`,
  );
  classId = rows[0]!.id;
});
afterAll(async () => db?.close());

describe('group classes', () => {
  it('seed creates class types and generates sessions from the weekly series', async () => {
    const types = await db.admin.query(`select key from class_types order by sort_order`);
    expect(types.rows.map((r) => r.key)).toEqual(['crossfit', 'boxing', 'kickboxing']);
    const { rows } = await db.admin.query(`select count(*)::int n from classes`);
    expect(rows[0].n).toBeGreaterThan(20); // ~11 per week × 4 weeks
  });

  it('session generation is idempotent', async () => {
    const before = await db.admin.query(`select count(*)::int n from classes`);
    const gen = await db.admin.query(
      `select public.generate_class_sessions(public.club_today() + 28) as n`,
    );
    expect(gen.rows[0].n).toBe(0);
    const after = await db.admin.query(`select count(*)::int n from classes`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('sessions start at the local club time (Europe/Belgrade)', async () => {
    const { rows } = await db.admin.query(
      `select distinct to_char(starts_at at time zone 'Europe/Belgrade', 'HH24:MI') t from classes order by 1`,
    );
    expect(rows.map((r) => r.t)).toEqual(['08:00', '10:00', '19:00', '20:15']);
  });

  it('a member has at most one live booking per class', async () => {
    await db.admin.query(
      `insert into bookings (class_id, member_id, status) values ($1, $2, 'confirmed')`,
      [classId, a.memberId],
    );
    await expect(
      db.admin.query(
        `insert into bookings (class_id, member_id, status) values ($1, $2, 'waitlisted')`,
        [classId, a.memberId],
      ),
    ).rejects.toThrow(/bookings_one_per_class/);
    // After cancelling, booking again is allowed.
    await db.admin.query(
      `update bookings set status = 'cancelled', cancelled_at = now() where member_id = $1`,
      [a.memberId],
    );
    await db.admin.query(
      `insert into bookings (class_id, member_id, status) values ($1, $2, 'confirmed')`,
      [classId, a.memberId],
    );
  });

  it('members read only their own bookings and cannot write them', async () => {
    await db.admin.query(
      `insert into bookings (class_id, member_id, status) values ($1, $2, 'confirmed')`,
      [classId, b.memberId],
    );
    const own = await db.as({ userId: a.userId }, (c) =>
      c.query<{ member_id: string }>('select member_id from public.bookings'),
    );
    expect(new Set(own.rows.map((r) => r.member_id))).toEqual(new Set([a.memberId]));
    await expect(
      db.as({ userId: a.userId }, (c) =>
        c.query(
          `insert into public.bookings (class_id, member_id, status) values ($1, $2, 'confirmed')`,
          [classId, a.memberId],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('anonymous users see the schedule and public trainers, but not staff fields or series', async () => {
    const classes = await db.as('anon', (c) => c.query('select id, capacity from public.classes'));
    expect(classes.rowCount).toBeGreaterThan(0);
    await expect(
      db.as('anon', (c) => c.query('select created_by from public.classes')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as('anon', (c) => c.query('select * from public.class_series')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as('anon', (c) => c.query('select user_id from public.trainers')),
    ).rejects.toThrow(/permission denied/);
    // Only trainers with consent are public: a hidden trainer never shows to guests.
    await db.admin.query(
      "update public.trainers set is_public = false where last_name = 'Petrović'",
    );
    const trainers = await db.as('anon', (c) =>
      c.query<{ last_name: string }>('select last_name from public.trainers order by sort_order'),
    );
    expect(trainers.rows.map((r) => r.last_name)).toEqual(['Mačinković', 'Nikolić', 'Marković']);
    // Nor does the hidden trainer's bio.
    const bios = await db.as('anon', (c) =>
      c.query<{ title: string }>('select title from public.trainer_translations'),
    );
    expect(bios.rows.length).toBeGreaterThan(0);
    expect(bios.rows.some((r) => ['Personalni trener', 'Personal trainer'].includes(r.title))).toBe(
      false,
    );
    await db.admin.query(
      "update public.trainers set is_public = true where last_name = 'Petrović'",
    );
    await expect(db.as('anon', (c) => c.query('select id from public.bookings'))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('members never see internal PT request notes', async () => {
    await db.admin.query(
      `insert into pt_requests (member_id, goal, staff_note) values ($1, 'Snaga i kondicija', 'interno')`,
      [a.memberId],
    );
    await expect(
      db.as({ userId: a.userId }, (c) => c.query('select staff_note from public.pt_requests')),
    ).rejects.toThrow(/permission denied/);
    const own = await db.as({ userId: b.userId }, (c) =>
      c.query('select id, goal from public.pt_requests'),
    );
    expect(own.rowCount).toBe(0);
    await expect(
      db.admin.query(`insert into pt_requests (member_id, goal) values ($1, 'Još jedan zahtev')`, [
        a.memberId,
      ]),
    ).rejects.toThrow(/pt_requests_one_open/);
  });
});
