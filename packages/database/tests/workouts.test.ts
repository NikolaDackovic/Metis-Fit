import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, openTestDb, type TestDb } from './helpers';

let db: TestDb;
let a: { userId: string; memberId: string | null };
let b: { userId: string; memberId: string | null };
let coach: { userId: string; memberId: string | null };
let trainerId: string;
let squat: string;

beforeAll(async () => {
  db = await openTestDb();
  a = await createUser(db.admin, { email: 'wa@example.com', member: true });
  b = await createUser(db.admin, { email: 'wb@example.com', member: true });
  coach = await createUser(db.admin, { email: 'coach@example.com', role: 'trainer' });
  const t = await db.admin.query<{ id: string }>(
    `insert into trainers (user_id, first_name, last_name) values ($1, 'Coach', 'One') returning id`,
    [coach.userId],
  );
  trainerId = t.rows[0]!.id;
  squat = (
    await db.admin.query<{ id: string }>(`select id from exercises where key = 'back_squat'`)
  ).rows[0]!.id;
  const s = randomUUID();
  await db.admin.query(
    `insert into workout_sessions (id, user_id, started_at) values ($1, $2, now())`,
    [s, a.userId],
  );
  await db.admin.query(
    `insert into workout_sets (id, session_id, exercise_id, set_index, reps, weight_kg, completed_at)
     values ($1, $2, $3, 0, 5, 100, now())`,
    [randomUUID(), s, squat],
  );
});
afterAll(async () => db?.close());

const canView = async () =>
  (
    await db.admin.query<{ ok: boolean }>(`select trainer_can_view_progress($1, $2) ok`, [
      coach.userId,
      a.memberId,
    ])
  ).rows[0]!.ok;

describe('exercise library', () => {
  it('ships a localized starter library with muscle groups', async () => {
    const { rows } = await db.as('anon', (c) =>
      c.query<{ name: string }>(
        `select t.name from exercises e join exercise_translations t on t.exercise_id = e.id
         where e.key = 'deadlift' and t.locale = 'ru'`,
      ),
    );
    expect(rows[0]!.name).toBe('Становая тяга');
    const n = await db.admin.query(`select count(*)::int n from exercises`);
    expect(n.rows[0].n).toBeGreaterThanOrEqual(30);
    const noMuscles = await db.admin.query(
      `select key from exercises e where not exists (select 1 from exercise_muscle_groups m where m.exercise_id = e.id)`,
    );
    expect(noMuscles.rows).toEqual([]);
  });
});

describe('workout privacy', () => {
  it('members see only their own workouts; anonymous users see nothing', async () => {
    const own = await db.as({ userId: a.userId }, (c) => c.query('select id from workout_sets'));
    expect(own.rowCount).toBe(1);
    const other = await db.as({ userId: b.userId }, (c) => c.query('select id from workout_sets'));
    expect(other.rowCount).toBe(0);
    await expect(db.as('anon', (c) => c.query('select id from workout_sessions'))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.as({ userId: a.userId }, (c) =>
        c.query(`insert into workout_sessions (id, user_id, started_at) values ($1, $2, now())`, [
          randomUUID(),
          a.userId,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('a trainer sees progress only as an active trainer AND with the member consent', async () => {
    expect(await canView()).toBe(false);
    await db.admin.query(`insert into trainer_clients (trainer_id, member_id) values ($1, $2)`, [
      trainerId,
      a.memberId,
    ]);
    expect(await canView()).toBe(false); // client, but no consent yet
    await db.admin.query(
      `insert into member_consents (member_id, type, version, granted, source)
       values ($1, 'progress_share_trainer', 'v1', true, 'app')`,
      [a.memberId],
    );
    expect(await canView()).toBe(true);
    // Withdrawing consent (latest record wins) removes access immediately.
    await db.admin.query(
      `insert into member_consents (member_id, type, version, granted, source, recorded_at)
       values ($1, 'progress_share_trainer', 'v1', false, 'app', now() + interval '1 second')`,
      [a.memberId],
    );
    expect(await canView()).toBe(false);
  });

  it('ending the trainer relationship removes access even with consent', async () => {
    await db.admin.query(
      `insert into member_consents (member_id, type, version, granted, source, recorded_at)
       values ($1, 'progress_share_trainer', 'v1', true, 'app', now() + interval '2 seconds')`,
      [a.memberId],
    );
    expect(await canView()).toBe(true);
    await db.admin.query(
      `update trainer_clients set status = 'ended', ended_at = now() where trainer_id = $1`,
      [trainerId],
    );
    expect(await canView()).toBe(false);
  });
});
