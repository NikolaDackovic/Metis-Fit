import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

/**
 * F12-2: workouts, measurements, goals, food log, activities and daily check-ins belong to the
 * account. They work without any gym, follow the person across gyms, and a trainer sees them
 * only through the client's membership in the trainer's own gym (with consent).
 */
let h: Harness;
let otherClub: string;
let exerciseId: string;
const B = { 'X-Club': 'drugi-klub-2' };

const day = new Date().toISOString().slice(0, 10);
const logEverything = async (u: TestUser, headers: Record<string, string> = {}) => {
  const session = randomUUID();
  await h.http
    .post('/v1/me/workouts/sync')
    .set(u.auth)
    .set(headers)
    .send({
      sessions: [
        {
          id: session,
          startedAt: new Date(Date.now() - 3_600_000).toISOString(),
          endedAt: new Date().toISOString(),
          sets: [
            {
              id: randomUUID(),
              exerciseId,
              setIndex: 0,
              reps: 5,
              weightKg: 100,
              completedAt: new Date().toISOString(),
            },
          ],
        },
      ],
      deletedSessionIds: [],
    })
    .expect((r) => expect(r.status).toBeLessThan(300));
  await h.http
    .post('/v1/me/measurements')
    .set(u.auth)
    .set(headers)
    .send({ id: randomUUID(), measuredOn: day, weightKg: 81.5 })
    .expect((r) => expect(r.status).toBeLessThan(300));
  await h.http
    .post('/v1/me/activities')
    .set(u.auth)
    .set(headers)
    .send({ id: randomUUID(), kind: 'running', doneOn: day, durationMin: 30 })
    .expect((r) => expect(r.status).toBeLessThan(300));
  await h.http
    .put(`/v1/me/checkins/${day}`)
    .set(u.auth)
    .set(headers)
    .send({ waterMl: 2000, sleepH: 7.5 })
    .expect((r) => expect(r.status).toBeLessThan(300));
  return session;
};

beforeAll(async () => {
  h = await createHarness();
  otherClub = (
    await h.db
      .insertInto('clubs')
      .values({ slug: 'drugi-klub-2', name: 'Drugi klub', status: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow()
  ).id;
  exerciseId = (await h.db.selectFrom('exercises').select('id').executeTakeFirstOrThrow()).id;
});
afterAll(async () => h?.close());

describe('personal data per account (F12-2)', () => {
  it('works without any gym: training at home is fully supported', async () => {
    const home = await h.user(); // an account, no membership anywhere
    await logEverything(home);
    const progress = (await h.http.get('/v1/me/progress').set(home.auth)).body.data;
    expect(progress.totalWorkouts).toBe(1);
    expect(progress.latestMeasurement.weightKg).toBe(81.5);
    const week = (await h.http.get('/v1/me/week').set(home.auth)).body.data;
    expect(week).toMatchObject({
      workouts: 1,
      activities: 1,
      activityMinutes: 30,
      classesAttended: 0,
      visits: 0,
    });
    expect((await h.http.get('/v1/me/activities').set(home.auth)).body.data).toHaveLength(1);
  });

  it('follows the person across gyms: the same data in every gym', async () => {
    const person = await h.user({ member: true });
    await h.db
      .insertInto('members')
      .values({
        user_id: person.userId,
        first_name: 'Isti',
        email: `isti-${Date.now()}@example.com`,
        last_name: 'Covek',
        club_id: otherClub,
      })
      .execute();
    await logEverything(person, B); // logged while "in" the other gym
    const inGrit = (await h.http.get('/v1/me/progress').set(person.auth)).body.data;
    const inB = (await h.http.get('/v1/me/progress').set(person.auth).set(B)).body.data;
    expect(inGrit.totalWorkouts).toBe(1);
    expect(inB.totalWorkouts).toBe(1);
    expect((await h.http.get('/v1/me/measurements').set(person.auth)).body.data).toHaveLength(1);
  });

  it('nobody else can read or change it', async () => {
    const owner = await h.user();
    const session = await logEverything(owner);
    const stranger = await h.user();
    expect((await h.http.get(`/v1/me/workouts/${session}`).set(stranger.auth)).status).toBe(404);
    // Syncing someone else's session id is rejected, never overwritten.
    const res = await h.http
      .post('/v1/me/workouts/sync')
      .set(stranger.auth)
      .send({
        sessions: [{ id: session, startedAt: new Date().toISOString(), sets: [] }],
        deletedSessionIds: [],
      });
    expect(res.body.data.rejected).toEqual([session]);
    const rows = await sql<{ user_id: string }>`
      select user_id from workout_sessions where id = ${session}`.execute(h.db);
    expect(rows.rows[0]!.user_id).toBe(owner.userId);
  });

  it('a trainer sees it only through a client in their own gym, with consent', async () => {
    const manager = await h.user({ role: 'manager', aal: 'aal2' });
    const trainerUser = await h.user({ role: 'trainer' });
    const trainer = await h.db
      .insertInto('trainers')
      .values({ user_id: trainerUser.userId, first_name: 'Tara', last_name: 'Trener' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const client = await h.user({ member: true });
    await logEverything(client);
    await h.http
      .post(`/v1/admin/trainers/${trainer.id}/clients`)
      .set(manager.auth)
      .send({ memberId: client.memberId })
      .expect(201);
    // No consent yet: no access.
    expect(
      (await h.http.get(`/v1/admin/members/${client.memberId}/progress`).set(trainerUser.auth))
        .status,
    ).toBe(403);
    await h.http
      .put('/v1/me/sharing')
      .set(client.auth)
      .send({ shareWithTrainer: true })
      .expect(200);
    const view = await h.http
      .get(`/v1/admin/members/${client.memberId}/progress`)
      .set(trainerUser.auth);
    expect(view.status).toBe(200);
    expect(view.body.data.progress.totalWorkouts).toBe(1);
    expect(view.body.data.measurements).toHaveLength(1);
    // From another gym, the same trainer account has no rights at all.
    expect(
      (
        await h.http
          .get(`/v1/admin/members/${client.memberId}/progress`)
          .set(trainerUser.auth)
          .set(B)
      ).status,
    ).toBe(403);
  });
});
