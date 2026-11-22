import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

/** F14-8: a member's calendar subscription link. */
let h: Harness;
let ana: TestUser;
let bob: TestUser;
let trainerId: string;

const feed = (token: string) => h.http.get(`/v1/public/calendar/${token}/feed.ics`);

beforeAll(async () => {
  h = await createHarness();
  ana = await h.user({ member: true });
  bob = await h.user({ member: true });
  trainerId = (
    await h.db
      .insertInto('trainers')
      .values({ first_name: 'Iva', last_name: 'Kalendar' })
      .returning('id')
      .executeTakeFirstOrThrow()
  ).id;
  await sql`
    insert into trainer_appointments (trainer_id, member_id, kind, starts_at, ends_at)
    values (${trainerId}, ${ana.memberId}, 'pt', now() + interval '2 days', now() + interval '2 days 1 hour'),
           (${trainerId}, ${bob.memberId}, 'pt', now() + interval '3 days', now() + interval '3 days 1 hour')`.execute(
    h.db,
  );
});
afterAll(async () => h?.close());

describe('calendar subscription (F14-8)', () => {
  it('off by default; creating it returns the secret once, and the feed lists only my sessions', async () => {
    expect((await h.http.get('/v1/me/calendar-feed').set(ana.auth)).body.data).toMatchObject({
      active: false,
      token: null,
    });
    const created = await h.http.post('/v1/me/calendar-feed').set(ana.auth);
    expect(created.status).toBe(201);
    const token = created.body.data.token as string;
    expect(token).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    const again = await h.http.get('/v1/me/calendar-feed').set(ana.auth);
    expect(again.body.data).toMatchObject({ active: true, token: null });

    const r = await feed(token);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/^text\/calendar/);
    const text = r.text;
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1); // Bob's session is not in Ana's calendar
    expect(text).toContain('Iva Kalendar');
  });

  it('a new link replaces the old one; turning it off stops it; bad links are refused', async () => {
    const first = (await h.http.post('/v1/me/calendar-feed').set(ana.auth)).body.data.token;
    const second = (await h.http.post('/v1/me/calendar-feed').set(ana.auth)).body.data.token;
    expect((await feed(first)).status).toBe(404);
    expect((await feed(second)).status).toBe(200);
    await h.http.delete('/v1/me/calendar-feed').set(ana.auth);
    expect((await feed(second)).status).toBe(404);
    // Right club, wrong secret.
    const forged = `${second.slice(0, 37)}${'A'.repeat(43)}`;
    expect((await feed(forged)).status).toBe(404);
    expect((await feed('not-a-token')).status).toBe(400);
  });
});
