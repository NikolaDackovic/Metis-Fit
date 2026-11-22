import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.close());

describe('food diary', () => {
  it('adds entries idempotently, sums the day and keeps members apart', async () => {
    const m = await h.user({ member: true });
    const other = await h.user({ member: true });
    const id = randomUUID();
    const entry = {
      id,
      eatenOn: '2026-11-17',
      meal: 'breakfast',
      name: 'Ovsene pahuljice',
      kcal: 380,
      proteinG: 14,
    };

    const a = await h.http.post('/v1/me/food-log').set(m.auth).send(entry);
    expect(a.status).toBe(201);
    const again = await h.http
      .post('/v1/me/food-log')
      .set(m.auth)
      .send({ ...entry, kcal: 400 });
    expect(again.body.data.entries).toHaveLength(1);
    await h.http.post('/v1/me/food-log').set(m.auth).send({
      id: randomUUID(),
      eatenOn: '2026-11-17',
      meal: 'lunch',
      name: 'Piletina i pirinač',
      kcal: 650,
      proteinG: 45.5,
    });

    const day = await h.http.get('/v1/me/food-log?date=2026-11-17').set(m.auth);
    expect(day.body.data.totals).toMatchObject({ kcal: 1050, proteinG: 59.5 });
    expect(day.body.data.recent.map((r: { name: string }) => r.name)).toContain('Ovsene pahuljice');
    expect(day.body.data.targets).toBeNull();

    // Another member can neither see nor overwrite or delete the entry.
    const theirs = await h.http.get('/v1/me/food-log?date=2026-11-17').set(other.auth);
    expect(theirs.body.data.entries).toHaveLength(0);
    const steal = await h.http.post('/v1/me/food-log').set(other.auth).send(entry);
    expect(steal.status).toBe(409);
    expect((await h.http.delete(`/v1/me/food-log/${id}`).set(other.auth)).status).toBe(404);

    const del = await h.http.delete(`/v1/me/food-log/${id}`).set(m.auth);
    expect(del.body.data.totals.kcal).toBe(650);

    const bad = await h.http
      .post('/v1/me/food-log')
      .set(m.auth)
      .send({ ...entry, id: randomUUID(), kcal: -5 });
    expect(bad.status).toBe(400);
  });
});
