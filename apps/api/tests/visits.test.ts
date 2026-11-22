import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AdminLockerMapDto, LockerMapDto } from '@grit/validation';
import { lockerLimiter } from '../src/modules/visits/visits.routes';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let manager: TestUser;
let reception: TestUser;

/** A granted entry (as the desk would record it) opens a visit via the DB trigger. */
const enter = (m: TestUser) =>
  h.db
    .insertInto('attendance_attempts')
    .values({ member_id: m.memberId, source: 'manual', result: 'granted', reason_code: 'OK' })
    .execute();

async function freeLocker(m: TestUser, room = 'men', skip = 0) {
  const map = (await h.http.get('/v1/me/lockers').set(m.auth)).body.data as LockerMapDto;
  return map.find((r) => r.key === room)!.lockers.filter((l) => l.state === 'free')[skip]!;
}
const pick = (m: TestUser, lockerId: string) =>
  h.http.post('/v1/me/visit/locker').set(m.auth).send({ lockerId });

beforeAll(async () => {
  h = await createHarness();
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
  const add = await h.http
    .post('/v1/admin/lockers')
    .set(manager.auth)
    .send({ roomKey: 'men', from: 1, to: 10 });
  expect(add.body.data).toEqual({ added: 10 });
  // Adding an overlapping range only adds the missing numbers.
  const again = await h.http
    .post('/v1/admin/lockers')
    .set(manager.auth)
    .send({ roomKey: 'men', from: 8, to: 12 });
  expect(again.body.data).toEqual({ added: 2 });
});
afterAll(async () => h?.close());
beforeEach(() => lockerLimiter.reset());

describe('visit and locker (guest chooses)', () => {
  it('a guest can take a locker only while inside, and checking out frees it', async () => {
    const m = await h.user({ member: true });
    const l = await freeLocker(m);
    expect((await pick(m, l.id)).body.message).toBe('errors.visit.not_inside');
    expect((await h.http.get('/v1/me/visit').set(m.auth)).body.data).toBeNull();

    await enter(m);
    const r = await pick(m, l.id);
    expect(r.status).toBe(200);
    expect(r.body.data.locker).toMatchObject({ number: l.number, roomKey: 'men' });
    const map = (await h.http.get('/v1/me/lockers').set(m.auth)).body.data as LockerMapDto;
    expect(map[0]!.lockers.find((x) => x.id === l.id)!.state).toBe('mine');

    await h.http.post('/v1/me/visit/checkout').set(m.auth).send();
    expect((await h.http.get('/v1/me/visit').set(m.auth)).body.data).toBeNull();
    const other = await h.user({ member: true });
    expect((await freeLocker(other)).id).toBeDefined();
    const after = (await h.http.get('/v1/me/lockers').set(other.auth)).body.data as LockerMapDto;
    expect(after[0]!.lockers.find((x) => x.id === l.id)!.state).toBe('free');
  });

  it('two guests picking the same locker at once: exactly one gets it', async () => {
    const a = await h.user({ member: true });
    const b = await h.user({ member: true });
    await enter(a);
    await enter(b);
    const l = await freeLocker(a, 'men', 1);
    const [ra, rb] = await Promise.all([pick(a, l.id), pick(b, l.id)]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    const loser = ra.status === 409 ? ra : rb;
    expect(loser.body.message).toBe('errors.visit.locker_taken');
  });

  it('switching lockers releases the previous one; guests never see who holds a locker', async () => {
    const m = await h.user({ member: true });
    await enter(m);
    const first = await freeLocker(m, 'men', 2);
    const second = await freeLocker(m, 'men', 3);
    await pick(m, first.id);
    await pick(m, second.id);
    const other = await h.user({ member: true });
    const map = (await h.http.get('/v1/me/lockers').set(other.auth)).body.data as LockerMapDto;
    const states = Object.fromEntries(map[0]!.lockers.map((x) => [x.id, x.state]));
    expect(states[first.id]).toBe('free');
    expect(states[second.id]).toBe('taken');
    expect(JSON.stringify(map)).not.toContain(m.memberId!);
  });

  it('a forgotten visit closes automatically after the configured hours', async () => {
    const m = await h.user({ member: true });
    await enter(m);
    await h.db
      .updateTable('visits')
      .set({ started_at: sql`now() - interval '6 hours'` })
      .where('member_id', '=', m.memberId!)
      .execute();
    expect((await h.http.get('/v1/me/visit').set(m.auth)).body.data).toBeNull();
  });
});

describe('desk', () => {
  it('reception sees who is inside, checks out, frees lockers; out-of-service needs lockers.manage', async () => {
    const m = await h.user({ member: true });
    await enter(m);
    const l = await freeLocker(m, 'men', 4);
    await pick(m, l.id);

    const occ = await h.http.get('/v1/admin/occupancy').set(reception.auth);
    const mine = occ.body.data.visits.find((v: { memberId: string }) => v.memberId === m.memberId);
    expect(mine.locker).toMatchObject({ number: l.number });

    const lockers = (await h.http.get('/v1/admin/lockers').set(reception.auth)).body
      .data as AdminLockerMapDto;
    expect(lockers[0]!.lockers.find((x) => x.id === l.id)!.occupant).toMatchObject({
      memberId: m.memberId,
    });

    expect(
      (
        await h.http
          .patch(`/v1/admin/lockers/${l.id}`)
          .set(reception.auth)
          .send({ status: 'out_of_service' })
      ).status,
    ).toBe(403);
    const oos = await h.http
      .patch(`/v1/admin/lockers/${l.id}`)
      .set(manager.auth)
      .send({ status: 'out_of_service', note: 'Polomljena brava' });
    expect(oos.status).toBe(200);
    // The guest keeps the visit but loses the broken locker.
    expect((await h.http.get('/v1/me/visit').set(m.auth)).body.data.locker).toBeNull();
    expect((await pick(m, l.id)).body.message).toBe('errors.visit.locker_out_of_service');

    const out = await h.http
      .post(`/v1/admin/visits/${mine.id}/checkout`)
      .set(reception.auth)
      .send();
    expect(out.status).toBe(200);
    expect(
      (await h.http.post(`/v1/admin/visits/${mine.id}/checkout`).set(reception.auth).send()).status,
    ).toBe(404);
    expect((await h.http.get('/v1/admin/occupancy').set(m.auth)).status).toBe(403);
  });
});
