import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.close());

const today = () =>
  sql<{ d: string }>`select public.club_today()::text as d`.execute(h.db).then((r) => r.rows[0]!.d);

describe('self-tracking beyond the gym', () => {
  it('logs activities with a calorie estimate from body weight, private per member', async () => {
    const m = await h.user({ member: true });
    const other = await h.user({ member: true });
    const day = await today();
    await h.http
      .post('/v1/me/measurements')
      .set(m.auth)
      .send({ id: randomUUID(), measuredOn: day, weightKg: 80 })
      .expect(201);
    const id = randomUUID();
    const res = await h.http.post('/v1/me/activities').set(m.auth).send({
      id,
      kind: 'running',
      doneOn: day,
      durationMin: 30,
      distanceKm: 5,
      intensity: 'moderate',
    });
    expect(res.status).toBe(201);
    // 9.8 MET × 80 kg × 0.5 h
    expect(res.body.data[0]).toMatchObject({ kind: 'running', kcal: 392, distanceKm: 5 });
    expect((await h.http.get('/v1/me/activities').set(other.auth)).body.data).toEqual([]);
    expect(
      (
        await h.http
          .post('/v1/me/activities')
          .set(other.auth)
          .send({ id, kind: 'yoga', doneOn: day, durationMin: 10 })
      ).status,
    ).toBe(409);
    const del = await h.http.delete(`/v1/me/activities/${id}`).set(m.auth);
    expect(del.body.data).toEqual([]);
  });

  it('saves daily habits, not in the future, with goals and recent days', async () => {
    const m = await h.user({ member: true });
    const day = await today();
    const r = await h.http
      .put(`/v1/me/checkins/${day}`)
      .set(m.auth)
      .send({ waterMl: 2750, sleepH: 7.5, steps: 9000, mood: 4, energy: 3 });
    expect(r.status).toBe(200);
    expect(r.body.data.checkin).toMatchObject({ waterMl: 2750, sleepH: 7.5, mood: 4 });
    expect(r.body.data.goals).toEqual({ waterMl: 2500, sleepH: 8, steps: 8000 });
    expect(r.body.data.recent).toHaveLength(1);
    const future = await h.http
      .put('/v1/me/checkins/2999-01-01')
      .set(m.auth)
      .send({ waterMl: 100 });
    expect(future.body.message).toBe('errors.checkin.future');
    const empty = await h.http.get('/v1/me/checkins/2020-01-01').set(m.auth);
    expect(empty.body.data.checkin).toMatchObject({ day: '2020-01-01', waterMl: null });
  });

  it('summarizes the week across workouts, activities, habits and food', async () => {
    const m = await h.user({ member: true });
    const day = await today();
    await h.http.post('/v1/me/activities').set(m.auth).send({
      id: randomUUID(),
      kind: 'cycling',
      doneOn: day,
      durationMin: 60,
      intensity: 'light',
    });
    await h.http
      .put(`/v1/me/checkins/${day}`)
      .set(m.auth)
      .send({ waterMl: 3000, sleepH: 8, steps: 10000 });
    await h.http
      .post('/v1/me/food-log')
      .set(m.auth)
      .send({ id: randomUUID(), eatenOn: day, meal: 'lunch', name: 'Piletina', kcal: 700 });
    const w = await h.http.get('/v1/me/week').set(m.auth);
    expect(w.status).toBe(200);
    expect(w.body.data).toMatchObject({
      activities: 1,
      activityMinutes: 60,
      activityKcal: 280,
      avgSleepH: 8,
      avgSteps: 10000,
      waterGoalDays: 1,
      avgKcalIn: 700,
      workouts: 0,
    });
    expect(w.body.data.activeDays).toHaveLength(1);
    const isoDow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
    expect(w.body.data.activeDays[0]).toBe(isoDow);
  });
});
