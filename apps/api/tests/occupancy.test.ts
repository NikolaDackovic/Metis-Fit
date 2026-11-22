import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { levelOf } from '../src/modules/occupancy/occupancy.service';
import { createHarness, type Harness, type TestUser } from './harness';

/** F13-1: how busy the gym is - numbers only, per gym, hidden on request. */
let h: Harness;
let owner: TestUser;
let reception: TestUser;

/** A finished visit on the same weekday `weeksAgo` weeks back, 10:00-11:45 in Belgrade. */
async function pastVisit(weeksAgo: number) {
  const m = await h.user({ member: true });
  await sql`insert into visits (member_id, started_at, ended_at, ended_by)
            values (${m.memberId},
                    ((public.club_today() - ${7 * weeksAgo}::int) + time '10:00') at time zone 'Europe/Belgrade',
                    ((public.club_today() - ${7 * weeksAgo}::int) + time '11:45') at time zone 'Europe/Belgrade',
                    'member')`.execute(h.db);
}

beforeAll(async () => {
  h = await createHarness();
  owner = await h.user({ role: 'owner', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
  // Open every day 06-23 so the test does not depend on the weekday it runs on.
  await sql`insert into opening_hours (weekday, opens_at, closes_at, is_closed)
            select d, '06:00', '23:00', false from generate_series(1, 7) d
            on conflict (club_id, weekday) do update
              set opens_at = excluded.opens_at, closes_at = excluded.closes_at, is_closed = false`.execute(
    h.db,
  );
  await pastVisit(2);
  for (let i = 0; i < 3; i++) await pastVisit(1);
  const inside = await h.user({ member: true });
  await sql`insert into visits (member_id, started_at) values (${inside.memberId}, now() - interval '10 minutes')`.execute(
    h.db,
  );
  // Somebody who forgot to check out yesterday does not count as inside.
  const forgot = await h.user({ member: true });
  await sql`insert into visits (member_id, started_at) values (${forgot.memberId}, now() - interval '20 hours')`.execute(
    h.db,
  );
});
afterAll(async () => h?.close());

describe('gym occupancy (F13-1)', () => {
  it('shows people inside now and the usual number per hour, without names', async () => {
    const r = await h.http.get('/v1/public/occupancy');
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d).toMatchObject({ visible: true, now: 1, capacity: null });
    const at = (hour: number) => d.typical.find((x: { hour: number }) => x.hour === hour)?.people;
    expect(at(10)).toBe(2); // (1 + 3) / 2 weeks
    expect(at(11)).toBe(2);
    expect(at(9)).toBe(0);
    expect(at(5)).toBeUndefined(); // closed at 05
    expect(JSON.stringify(d)).not.toMatch(/firstName|memberId|Test/);
  });

  it('the owner sets the capacity or hides it; reception cannot', async () => {
    const denied = await h.http
      .put('/v1/admin/busy-settings')
      .set(reception.auth)
      .send({ visible: true, capacity: 50 });
    expect(denied.status).toBe(403);
    const set = await h.http
      .put('/v1/admin/busy-settings')
      .set(owner.auth)
      .send({ visible: true, capacity: 50 });
    expect(set.status).toBe(200);
    const r = await h.http.get('/v1/public/occupancy');
    expect(r.body.data).toMatchObject({ capacity: 50, level: 'low' });

    await h.http
      .put('/v1/admin/busy-settings')
      .set(owner.auth)
      .send({ visible: false, capacity: 50 })
      .expect(200);
    const hidden = await h.http.get('/v1/public/occupancy');
    expect(hidden.body.data).toMatchObject({ visible: false, now: null, typical: [] });
    expect((await h.http.get('/v1/admin/busy-settings').set(owner.auth)).body.data).toEqual({
      visible: false,
      capacity: 50,
    });
  });

  it('levels: against capacity, else against the busiest hour', () => {
    expect(levelOf(10, 50, 0)).toBe('low');
    expect(levelOf(30, 50, 0)).toBe('medium');
    expect(levelOf(45, 50, 0)).toBe('high');
    expect(levelOf(5, null, 2)).toBeNull(); // too little history to compare
    expect(levelOf(2, null, 10)).toBe('low');
    expect(levelOf(10, null, 10)).toBe('high');
  });
});
