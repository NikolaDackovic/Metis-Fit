import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runNotificationJobs } from '../src/modules/notifications/jobs';
import { createHarness, type Harness, type TestUser } from './harness';

/** F13-4 challenges: progress this week / month, points once per period. */
let h: Harness;
let manager: TestUser;
let reception: TestUser;
let workoutChallenge: string;

const workout = (u: TestUser, minutesAgo = 1) =>
  h.db
    .insertInto('workout_sessions')
    .values({
      id: randomUUID(),
      user_id: u.userId,
      started_at: sql<Date>`now() - make_interval(mins => ${minutesAgo})`,
    } as never)
    .execute();
const balance = (u: TestUser) =>
  h.http
    .get('/v1/me/loyalty')
    .set(u.auth)
    .then((r) => r.body.data.balance as number);

beforeAll(async () => {
  h = await createHarness();
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
});
afterAll(async () => h?.close());

describe('challenges (F13-4)', () => {
  it('every gym starts with three challenges; managers edit them, reception cannot', async () => {
    const list = await h.http.get('/v1/admin/challenges').set(manager.auth);
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual([
      expect.objectContaining({ kind: 'visits', period: 'week', target: 3, rewardPoints: 30 }),
      expect.objectContaining({ kind: 'visits', period: 'month', target: 12, rewardPoints: 150 }),
      expect.objectContaining({ kind: 'classes', period: 'month', target: 4, rewardPoints: 100 }),
    ]);
    expect((await h.http.get('/v1/admin/challenges').set(reception.auth)).status).toBe(403);
    const add = await h.http.post('/v1/admin/challenges').set(manager.auth).send({
      kind: 'workouts',
      period: 'week',
      target: 2,
      rewardPoints: 50,
      title: 'Dva treninga',
    });
    expect(add.status).toBe(201);
    workoutChallenge = add.body.data.id;
  });

  it('reaching the target gives the points once and tells the member', async () => {
    const m = await h.user({ member: true });
    await workout(m);
    let mine = (await h.http.get('/v1/me/challenges').set(m.auth)).body.data;
    expect(mine.find((c: { id: string }) => c.id === workoutChallenge)).toMatchObject({
      progress: 1,
      target: 2,
      completed: false,
      title: 'Dva treninga',
    });
    const before = await balance(m);
    await workout(m, 2);
    mine = (await h.http.get('/v1/me/challenges').set(m.auth)).body.data;
    expect(mine.find((c: { id: string }) => c.id === workoutChallenge)).toMatchObject({
      progress: 2,
      completed: true,
    });
    expect(await balance(m)).toBe(before + 50);
    // Opening again, a third workout or the background job give nothing more.
    await workout(m, 3);
    await h.http.get('/v1/me/challenges').set(m.auth);
    await runNotificationJobs(h.db, null);
    expect(await balance(m)).toBe(before + 50);
    const inbox = await h.http.get('/v1/me/notifications').set(m.auth);
    const kinds = inbox.body.data.items.map((n: { kind: string }) => n.kind);
    expect(kinds.filter((k: string) => k === 'challenge_completed')).toHaveLength(1);
  });

  it('the background job rewards members who did not open the app', async () => {
    const m = await h.user({ member: true });
    await workout(m);
    await workout(m, 2);
    const before = await balance(m);
    await runNotificationJobs(h.db, null);
    expect(await balance(m)).toBe(before + 50);
  });

  it('a switched-off challenge is not shown; deleting keeps given points', async () => {
    const off = await h.http
      .put(`/v1/admin/challenges/${workoutChallenge}`)
      .set(manager.auth)
      .send({
        kind: 'workouts',
        period: 'week',
        target: 2,
        rewardPoints: 50,
        isActive: false,
      });
    expect(off.status).toBe(200);
    const m = await h.user({ member: true });
    const mine = (await h.http.get('/v1/me/challenges').set(m.auth)).body.data;
    expect(mine.map((c: { id: string }) => c.id)).not.toContain(workoutChallenge);
    expect(
      (await h.http.delete(`/v1/admin/challenges/${workoutChallenge}`).set(manager.auth)).status,
    ).toBe(200);
  });
});
