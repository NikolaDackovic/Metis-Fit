import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { issueKioskToken } from '../src/modules/access/kiosk';
import { createHarness, QR_SECRET, type Harness, type TestUser } from './harness';

/** F13-6: entry by scanning the door code with the app; the account name is used everywhere. */
let h: Harness;
let manager: TestUser;
let reception: TestUser;
let planId: string;

async function memberWithMembership() {
  const m = await h.user({ member: true });
  const r = await h.http
    .post(`/v1/admin/members/${m.memberId}/memberships`)
    .set(reception.auth)
    .send({ planId, payment: { amount: 300_000, method: 'cash' } });
  expect(r.status).toBe(201);
  return m;
}
const doorCode = async () =>
  (
    await h.http
      .get('/v1/admin/access/kiosk-token')
      .set(reception.auth)
      .query({ terminalId: 'door-1' })
  ).body.data.token as string;

beforeAll(async () => {
  h = await createHarness();
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
  planId = (
    await h.http
      .post('/v1/admin/plans')
      .set(manager.auth)
      .send({
        isAvailable: true,
        translations: { sr: { name: 'Mesečna' } },
        kind: 'unlimited',
        priceAmount: 300_000,
        durationDays: 30,
        visitLimit: null,
      })
  ).body.data.id;
});
afterAll(async () => h?.close());

describe('entry by scanning the door code (F13-6)', () => {
  it('a member with a valid membership scans the code and gets in; the screen shows who', async () => {
    const m = await memberWithMembership();
    const code = await doorCode();
    const r = await h.http.post('/v1/me/checkin').set(m.auth).send({ token: code });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ result: 'granted', reasonCode: 'OK' });
    const attempt = await h.db
      .selectFrom('attendance_attempts')
      .select(['source', 'terminal_id', 'member_id'])
      .where('id', '=', r.body.data.attemptId)
      .executeTakeFirstOrThrow();
    expect(attempt).toEqual({ source: 'self_scan', terminal_id: 'door-1', member_id: m.memberId });
    const feed = await h.http
      .get('/v1/admin/access/kiosk-feed')
      .set(reception.auth)
      .query({ terminalId: 'door-1' });
    expect(feed.body.data[0]).toMatchObject({ result: 'granted', firstName: 'Test' });
  });

  it('a member without a valid membership is refused with the reason', async () => {
    const m = await h.user({ member: true });
    const r = await h.http
      .post('/v1/me/checkin')
      .set(m.auth)
      .send({ token: await doorCode() });
    expect(r.body.data).toMatchObject({ result: 'denied', reasonCode: 'NO_ACTIVE_MEMBERSHIP' });
  });

  it('refuses an old, forged or other-gym code; only staff get door codes', async () => {
    const m = await memberWithMembership();
    const send = (token: string) => h.http.post('/v1/me/checkin').set(m.auth).send({ token });
    const club = (
      await h.db
        .selectFrom('clubs')
        .select('id')
        .where('is_default', '=', true)
        .executeTakeFirstOrThrow()
    ).id;
    const old = issueKioskToken(QR_SECRET, club, 'door-1', Date.now() - 60_000).token;
    expect((await send(old)).body.message).toBe('errors.kiosk.expired');
    const code = await doorCode();
    expect((await send(`${code.slice(0, -2)}xx`)).body.message).toBe('errors.kiosk.invalid');
    const other = issueKioskToken(QR_SECRET, randomUUID(), 'door-1').token;
    expect((await send(other)).body.message).toBe('errors.kiosk.other_gym');
    expect(
      (await h.http.get('/v1/admin/access/kiosk-token').set(m.auth).query({ terminalId: 'door-1' }))
        .status,
    ).toBe(403);
  });
});

describe('the app account is the person everywhere (F13-6)', () => {
  it('a name changed in the app shows in the gym, and the desk finds it without Serbian letters', async () => {
    const m = await h.user({ member: true });
    await h.http
      .patch('/v1/me')
      .set(m.auth)
      .send({ firstName: 'Nikola', lastName: 'Dačković' })
      .expect(200);
    const row = await h.db
      .selectFrom('members')
      .select(['first_name', 'last_name'])
      .where('id', '=', m.memberId!)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ first_name: 'Nikola', last_name: 'Dačković' });
    const found = await h.http
      .get('/v1/admin/members')
      .set(reception.auth)
      .query({ q: 'nikola dackovic' });
    expect(found.body.data.map((x: { id: string }) => x.id)).toContain(m.memberId);
    const detail = await h.http.get(`/v1/admin/members/${m.memberId}`).set(reception.auth);
    expect(detail.body.data).toHaveProperty('photoUrl');
  });
});
