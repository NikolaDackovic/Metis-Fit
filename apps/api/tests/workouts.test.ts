import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ExerciseDto, ProgressDto, SyncWorkoutsBody } from '@grit/validation';
import { syncLimiter } from '../src/modules/workouts/workouts.routes';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let manager: TestUser;
let reception: TestUser;
let coachUser: TestUser;
let trainerId: string;
let squat: ExerciseDto;
let plank: ExerciseDto;

const sync = (m: TestUser, body: Partial<SyncWorkoutsBody>) =>
  h.http
    .post('/v1/me/workouts/sync')
    .set(m.auth)
    .send({ sessions: [], ...body });

function session(
  sets: Array<{ ex: string; reps?: number; kg?: number; s?: number }>,
  id = randomUUID(),
) {
  const start = new Date(Date.now() - 3600_000).toISOString();
  return {
    id,
    startedAt: start,
    endedAt: new Date().toISOString(),
    sets: sets.map((x, i) => ({
      id: randomUUID(),
      exerciseId: x.ex,
      setIndex: i,
      reps: x.reps ?? null,
      weightKg: x.kg ?? null,
      durationS: x.s ?? null,
      completedAt: start,
    })),
  };
}

beforeAll(async () => {
  h = await createHarness();
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
  coachUser = await h.user({ role: 'trainer' });
  const t = await h.db
    .insertInto('trainers')
    .values({ user_id: coachUser.userId, first_name: 'Coach', last_name: 'One' })
    .returning('id')
    .executeTakeFirstOrThrow();
  trainerId = t.id;
  const lib = (await h.http.get('/v1/public/exercises').query({ locale: 'ru' })).body
    .data as ExerciseDto[];
  squat = lib.find((e) => e.key === 'back_squat')!;
  plank = lib.find((e) => e.key === 'plank')!;
});
afterAll(async () => h?.close());
beforeEach(() => syncLimiter.reset());

describe('exercise library', () => {
  it('is public, localized and searchable by muscle group', async () => {
    expect(squat).toMatchObject({ name: 'Приседания со штангой', tracking: 'weight_reps' });
    expect(squat.muscles[0]).toMatchObject({ key: 'quads', primary: true });
    const core = await h.http.get('/v1/public/exercises').query({ muscle: 'core' });
    expect(core.body.data.map((e: ExerciseDto) => e.key)).toContain('plank');
    const q = await h.http.get('/v1/public/exercises').query({ q: 'mrtvo' });
    expect(q.body.data.map((e: ExerciseDto) => e.key)).toEqual(
      expect.arrayContaining(['deadlift', 'romanian_deadlift']),
    );
  });

  it('only managers and trainers edit the library; deactivated exercises disappear publicly', async () => {
    const body = {
      key: 'sled_push',
      category: 'crossfit',
      tracking: 'distance_time',
      muscles: ['quads', 'glutes'],
      translations: { sr: { name: 'Guranje sanki' }, ru: { name: 'Толкание саней' } },
    };
    expect((await h.http.post('/v1/admin/exercises').set(reception.auth).send(body)).status).toBe(
      403,
    );
    const created = await h.http.post('/v1/admin/exercises').set(coachUser.auth).send(body);
    expect(created.status).toBe(201);
    await h.http
      .patch(`/v1/admin/exercises/${created.body.data.id}`)
      .set(manager.auth)
      .send({ isActive: false });
    const pub = await h.http.get('/v1/public/exercises').query({ q: 'sank' });
    expect(pub.body.data).toEqual([]);
  });
});

describe('offline workout sync', () => {
  it('the same workout synced repeatedly is stored once (no duplicates)', async () => {
    const m = await h.user({ member: true });
    const s = session([
      { ex: squat.id, reps: 5, kg: 100 },
      { ex: squat.id, reps: 5, kg: 105 },
    ]);
    for (let i = 0; i < 3; i += 1) {
      const r = await sync(m, { sessions: [s] });
      expect(r.status).toBe(200);
      expect(r.body.data.saved).toEqual([s.id]);
    }
    // Two parallel retries (e.g. reconnect while the first request is in flight).
    await Promise.all([sync(m, { sessions: [s] }), sync(m, { sessions: [s] })]);
    const list = await h.http.get('/v1/me/workouts').set(m.auth);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0]).toMatchObject({ setCount: 2, volumeKg: 1025 });
  });

  it('a later sync of the same session replaces its sets (edit on the device)', async () => {
    const m = await h.user({ member: true });
    const s = session([{ ex: squat.id, reps: 5, kg: 80 }]);
    await sync(m, { sessions: [s] });
    s.sets[0]!.weightKg = 90;
    s.sets.push({ ...s.sets[0]!, id: randomUUID(), setIndex: 1 });
    await sync(m, { sessions: [s] });
    const d = await h.http.get(`/v1/me/workouts/${s.id}`).set(m.auth);
    expect(d.body.data.sets.map((x: { weightKg: number }) => x.weightKg)).toEqual([90, 90]);
  });

  it("never touches another member's workout, even with a known ID", async () => {
    const a = await h.user({ member: true });
    const b = await h.user({ member: true });
    const s = session([{ ex: squat.id, reps: 3, kg: 120 }]);
    await sync(a, { sessions: [s] });
    const hijack = await sync(b, { sessions: [{ ...s, sets: [] }], deletedSessionIds: [s.id] });
    expect(hijack.body.data.rejected).toEqual([s.id]);
    expect((await h.http.get(`/v1/me/workouts/${s.id}`).set(b.auth)).status).toBe(404);
    const stillThere = await h.http.get(`/v1/me/workouts/${s.id}`).set(a.auth);
    expect(stillThere.body.data.setCount).toBe(1);
  });

  it('deleting is idempotent and a deleted workout is not resurrected by an old retry', async () => {
    const m = await h.user({ member: true });
    const s = session([{ ex: plank.id, s: 60 }]);
    await sync(m, { sessions: [s] });
    await sync(m, { deletedSessionIds: [s.id] });
    await sync(m, { deletedSessionIds: [s.id] });
    await sync(m, { sessions: [s] }); // stale retry from another device
    expect((await h.http.get('/v1/me/workouts').set(m.auth)).body.meta.total).toBe(0);
  });

  it('works for an account without any gym membership (F12-2: training at home)', async () => {
    const u = await h.user();
    const r = await sync(u, { sessions: [session([{ ex: squat.id, reps: 1, kg: 50 }])] });
    expect(r.status).toBe(200);
    expect(r.body.data.saved).toHaveLength(1);
  });
});

describe('progress', () => {
  it('computes personal records, estimated 1RM, weekly activity and goal progress', async () => {
    const m = await h.user({ member: true });
    await sync(m, {
      sessions: [
        session([
          { ex: squat.id, reps: 5, kg: 100 },
          { ex: squat.id, reps: 1, kg: 115 },
        ]),
      ],
    });
    const p = (await h.http.get('/v1/me/progress').set(m.auth)).body.data as ProgressDto;
    expect(p.totalWorkouts).toBe(1);
    expect(p.streakWeeks).toBe(1);
    expect(p.weekly).toHaveLength(12);
    const pr = p.records.find((r) => r.exerciseId === squat.id)!;
    expect(pr).toMatchObject({ bestWeightKg: 115, bestReps: 5, estimated1rmKg: 118.8 });

    const g = await h.http
      .post('/v1/me/goals')
      .set(m.auth)
      .send({ kind: 'exercise_weight', exerciseId: squat.id, targetValue: 140 });
    expect(g.status).toBe(201);
    expect(g.body.data[0]).toMatchObject({ startValue: 115, currentValue: 115, targetValue: 140 });

    await h.http
      .post('/v1/me/measurements')
      .set(m.auth)
      .send({ id: randomUUID(), measuredOn: '2026-11-10', weightKg: 82.5 });
    const p2 = (await h.http.get('/v1/me/progress').set(m.auth)).body.data as ProgressDto;
    expect(p2.latestMeasurement).toMatchObject({ weightKg: 82.5 });
    const empty = await h.http
      .post('/v1/me/measurements')
      .set(m.auth)
      .send({ id: randomUUID(), measuredOn: '2026-11-10' });
    expect(empty.status).toBe(400);
  });
});

describe('trainer access to progress (consent)', () => {
  it('requires both the trainer relationship and the member consent, and is revocable', async () => {
    const m = await h.user({ member: true });
    await sync(m, { sessions: [session([{ ex: squat.id, reps: 5, kg: 60 }])] });
    const view = () => h.http.get(`/v1/admin/members/${m.memberId}/progress`).set(coachUser.auth);

    expect((await view()).status).toBe(403); // not a client
    const add = await h.http
      .post(`/v1/admin/trainers/${trainerId}/clients`)
      .set(manager.auth)
      .send({ memberId: m.memberId });
    expect(add.status).toBe(201);
    expect(add.body.data[0]).toMatchObject({ sharesProgress: false });
    expect((await view()).body.message).toBe('errors.progress.no_access'); // no consent yet

    const sharing = await h.http.get('/v1/me/sharing').set(m.auth);
    expect(sharing.body.data).toMatchObject({
      shareWithTrainer: false,
      trainers: [{ name: 'Coach One' }],
    });
    await h.http.put('/v1/me/sharing').set(m.auth).send({ shareWithTrainer: true });
    const ok = await view();
    expect(ok.status).toBe(200);
    expect(ok.body.data.progress.totalWorkouts).toBe(1);
    const mine = await h.http.get('/v1/admin/my-clients').set(coachUser.auth);
    expect(mine.body.data[0]).toMatchObject({ memberId: m.memberId, sharesProgress: true });

    await h.http.put('/v1/me/sharing').set(m.auth).send({ shareWithTrainer: false });
    expect((await view()).status).toBe(403);

    // Reception has no access to anyone's progress.
    expect(
      (await h.http.get(`/v1/admin/members/${m.memberId}/progress`).set(reception.auth)).status,
    ).toBe(403);
  });
});
