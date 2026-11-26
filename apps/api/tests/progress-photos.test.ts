import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

/** F18-1: private progress photos; a trainer sees only shared ones, only with consent. */
let h: Harness;
let ana: TestUser;
let bob: TestUser;
let coach: TestUser;

// Smallest byte sequences the server accepts as JPEG (signature + some bytes).
const jpeg = (n: number) =>
  `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 7)]).toString('base64')}`;
const photo = (over: Record<string, unknown> = {}) => ({
  image: jpeg(2000),
  thumb: jpeg(200),
  takenOn: '2026-11-01',
  pose: 'front',
  weightKg: 82.5,
  ...over,
});

beforeAll(async () => {
  h = await createHarness();
  ana = await h.user({ member: true });
  bob = await h.user({ member: true });
  coach = await h.user({ role: 'trainer' });
  const t = await h.db
    .insertInto('trainers')
    .values({ user_id: coach.userId, first_name: 'Foto', last_name: 'Trener' })
    .returning('id')
    .executeTakeFirstOrThrow();
  await h.db
    .insertInto('trainer_clients')
    .values({ trainer_id: t.id, member_id: ana.memberId!, status: 'active' })
    .execute();
});
afterAll(async () => h?.close());

describe('progress photos (F18-1)', () => {
  it('only the owner sees their photos; full size on request; private by default', async () => {
    const add = await h.http.post('/v1/me/progress-photos').set(ana.auth).send(photo());
    expect(add.status).toBe(201);
    expect(add.body.data).toMatchObject({ pose: 'front', weightKg: 82.5, shared: false });
    expect(add.body.data.thumb.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(add.body.data.image).toBeUndefined();
    const id = add.body.data.id as string;

    const full = await h.http.get(`/v1/me/progress-photos/${id}`).set(ana.auth);
    expect(full.body.data.image.length).toBeGreaterThan(2000);
    expect((await h.http.get(`/v1/me/progress-photos/${id}`).set(bob.auth)).status).toBe(404);
    expect((await h.http.get('/v1/me/progress-photos').set(bob.auth)).body.data).toEqual([]);
  });

  it('a file that is not an image is refused', async () => {
    const bad = await h.http
      .post('/v1/me/progress-photos')
      .set(ana.auth)
      .send(
        photo({
          image: `data:image/jpeg;base64,${Buffer.from('not really an image at all').toString('base64')}`,
        }),
      );
    expect(bad.status).toBe(400);
  });

  it('the trainer sees a photo only when it is shared and progress sharing is on', async () => {
    const id = (
      await h.http
        .post('/v1/me/progress-photos')
        .set(ana.auth)
        .send(photo({ pose: 'side' }))
    ).body.data.id as string;
    const list = () =>
      h.http.get(`/v1/admin/members/${ana.memberId}/progress-photos`).set(coach.auth);
    // No consent yet.
    expect((await list()).status).toBe(403);
    await h.http.put('/v1/me/sharing').set(ana.auth).send({ shareWithTrainer: true });
    // Consent, but the photo is not shared.
    expect((await list()).body.data).toEqual([]);
    await h.http.patch(`/v1/me/progress-photos/${id}`).set(ana.auth).send({ shared: true });
    const shared = (await list()).body.data as Array<{ id: string }>;
    expect(shared.map((p) => p.id)).toEqual([id]);
    const one = await h.http
      .get(`/v1/admin/members/${ana.memberId}/progress-photos/${id}`)
      .set(coach.auth);
    expect(one.body.data.image.length).toBeGreaterThan(2000);
    // Not the client of this trainer.
    expect(
      (await h.http.get(`/v1/admin/members/${bob.memberId}/progress-photos`).set(coach.auth))
        .status,
    ).toBe(403);
    // Sharing off again: nothing.
    await h.http.put('/v1/me/sharing').set(ana.auth).send({ shareWithTrainer: false });
    expect((await list()).status).toBe(403);
    // The owner deletes it.
    expect((await h.http.delete(`/v1/me/progress-photos/${id}`).set(ana.auth)).body.data).toEqual({
      ok: true,
    });
  });
});
