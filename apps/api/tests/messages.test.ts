import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

/** F14-3: a member and their trainer write to each other; nobody else can join in. */
let h: Harness;
let coach: TestUser;
let trainerId: string;
let client: TestUser;
let stranger: TestUser;

beforeAll(async () => {
  h = await createHarness();
  coach = await h.user({ role: 'trainer' });
  trainerId = (
    await h.db
      .insertInto('trainers')
      .values({ first_name: 'Ana', last_name: 'Trener', user_id: coach.userId })
      .returning('id')
      .executeTakeFirstOrThrow()
  ).id;
  client = await h.user({ member: true });
  stranger = await h.user({ member: true });
  await h.db
    .insertInto('trainer_clients')
    .values({ trainer_id: trainerId, member_id: client.memberId! })
    .execute();
});
afterAll(async () => h?.close());

describe('member-trainer messages (F14-3)', () => {
  it('the member writes, the trainer sees it unread, opens it and answers', async () => {
    const mine = await h.http.get('/v1/me/conversations').set(client.auth);
    expect(mine.body.data).toEqual([
      expect.objectContaining({ id: trainerId, name: 'Ana Trener', open: true, unread: 0 }),
    ]);
    const sent = await h.http
      .post(`/v1/me/conversations/${trainerId}/messages`)
      .set(client.auth)
      .send({ body: 'Zdravo, može li trening u četvrtak?' });
    expect(sent.status).toBe(201);

    const list = await h.http.get('/v1/admin/my-conversations').set(coach.auth);
    expect(list.body.data[0]).toMatchObject({
      id: client.memberId,
      unread: 1,
      lastMessage: 'Zdravo, može li trening u četvrtak?',
    });
    const read = await h.http
      .get(`/v1/admin/my-conversations/${client.memberId}/messages`)
      .set(coach.auth);
    expect(read.body.data).toEqual([expect.objectContaining({ mine: false })]);
    expect(
      (await h.http.get('/v1/admin/my-conversations').set(coach.auth)).body.data[0].unread,
    ).toBe(0);

    await h.http
      .post(`/v1/admin/my-conversations/${client.memberId}/messages`)
      .set(coach.auth)
      .send({ body: 'Može, u 18h.' })
      .expect(201);
    const thread = await h.http.get(`/v1/me/conversations/${trainerId}/messages`).set(client.auth);
    expect(thread.body.data.map((m: { body: string; mine: boolean }) => [m.body, m.mine])).toEqual([
      ['Zdravo, može li trening u četvrtak?', true],
      ['Može, u 18h.', false],
    ]);
    // Both sides were told (one notification each).
    const inbox = await h.http.get('/v1/me/notifications').set(client.auth);
    expect(inbox.body.data.items.map((n: { kind: string }) => n.kind)).toContain('message');
  });

  it('nobody outside the trainer-client pair can read or write', async () => {
    expect(
      (await h.http.get(`/v1/me/conversations/${trainerId}/messages`).set(stranger.auth)).status,
    ).toBe(404);
    expect(
      (
        await h.http
          .post(`/v1/me/conversations/${trainerId}/messages`)
          .set(stranger.auth)
          .send({ body: 'Ćao' })
      ).body.message,
    ).toBe('errors.message.not_linked');
    expect(
      (
        await h.http
          .post(`/v1/admin/my-conversations/${stranger.memberId}/messages`)
          .set(coach.auth)
          .send({ body: 'Ćao' })
      ).body.message,
    ).toBe('errors.message.not_linked');
    expect((await h.http.get('/v1/admin/my-conversations').set(client.auth)).status).toBe(403);
  });

  it('an empty message is refused', async () => {
    expect(
      (
        await h.http
          .post(`/v1/me/conversations/${trainerId}/messages`)
          .set(client.auth)
          .send({ body: '   ' })
      ).status,
    ).toBe(400);
  });
});
