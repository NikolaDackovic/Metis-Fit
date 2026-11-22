import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, openTestDb, type TestDb } from './helpers';

let db: TestDb;
let a: { userId: string; memberId: string | null };
let b: { userId: string; memberId: string | null };
let locker: string;

const enter = (memberId: string | null, result: 'granted' | 'denied' = 'granted') =>
  db.admin.query(
    `insert into attendance_attempts (member_id, source, result, reason_code) values ($1, 'manual', $2, $3)`,
    [memberId, result, result === 'granted' ? 'OK' : 'NO_ACTIVE_MEMBERSHIP'],
  );
const open = async (memberId: string | null) =>
  (
    await db.admin.query<{ n: number }>(
      `select count(*)::int n from visits where member_id = $1 and ended_at is null`,
      [memberId],
    )
  ).rows[0]!.n;

beforeAll(async () => {
  db = await openTestDb();
  a = await createUser(db.admin, { email: 'va@example.com', member: true });
  b = await createUser(db.admin, { email: 'vb@example.com', member: true });
  const r = await db.admin.query<{ id: string }>(
    `insert into lockers (changing_room_id, number) select id, 7 from changing_rooms where key = 'men' returning id`,
  );
  locker = r.rows[0]!.id;
});
afterAll(async () => db?.close());

describe('visits', () => {
  it('a granted entry opens one visit; re-entry and denied attempts do not add more', async () => {
    await enter(a.memberId);
    await enter(a.memberId);
    await enter(b.memberId, 'denied');
    expect(await open(a.memberId)).toBe(1);
    expect(await open(b.memberId)).toBe(0);
  });

  it('a locker is held by at most one open visit', async () => {
    await enter(b.memberId);
    await db.admin.query(
      `update visits set locker_id = $1 where member_id = $2 and ended_at is null`,
      [locker, a.memberId],
    );
    await expect(
      db.admin.query(`update visits set locker_id = $1 where member_id = $2 and ended_at is null`, [
        locker,
        b.memberId,
      ]),
    ).rejects.toThrow(/visits_one_per_locker/);
  });

  it('visits nobody checked out of are closed automatically and free their locker', async () => {
    await db.admin.query(
      `update visits set started_at = now() - interval '6 hours' where member_id = $1 and ended_at is null`,
      [a.memberId],
    );
    const { rows } = await db.admin.query<{ n: number }>(`select close_stale_visits() n`);
    expect(rows[0]!.n).toBe(1);
    expect(await open(a.memberId)).toBe(0);
    await db.admin.query(
      `update visits set locker_id = $1 where member_id = $2 and ended_at is null`,
      [locker, b.memberId],
    );
  });

  it('members see their own visits only, never who holds which locker', async () => {
    const own = await db.as({ userId: a.userId }, (c) =>
      c.query<{ member_id: string }>('select member_id from public.visits'),
    );
    expect(new Set(own.rows.map((r) => r.member_id))).toEqual(new Set([a.memberId]));
    await expect(db.as('anon', (c) => c.query('select id from public.lockers'))).rejects.toThrow(
      /permission denied/,
    );
  });
});
