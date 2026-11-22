import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

/** F13-3 "Bring a friend": code, claim before the first payment, points for both. */
let h: Harness;
let manager: TestUser;
let reception: TestUser;
let planId: string;

const pay = (m: TestUser) =>
  h.http
    .post(`/v1/admin/members/${m.memberId}/memberships`)
    .set(reception.auth)
    .send({ planId, payment: { amount: 300_000, method: 'cash' } });
const loyalty = (m: TestUser) => h.http.get('/v1/me/loyalty').set(m.auth);

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

describe('bring a friend (F13-3)', () => {
  it('is on by default (200 + 100), the owner can turn it off; reception cannot change it', async () => {
    const m = await h.user({ member: true });
    const r = await h.http.get('/v1/me/referral').set(m.auth);
    expect(r.body.data).toMatchObject({ enabled: true, pointsReferrer: 200, pointsFriend: 100 });
    expect(r.body.data.code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    const off = await h.http
      .put('/v1/admin/referrals/settings')
      .set(manager.auth)
      .send({ enabled: false, pointsReferrer: 200, pointsFriend: 100 });
    expect(off.status).toBe(200);
    expect((await h.http.get('/v1/me/referral').set(m.auth)).body.data).toMatchObject({
      enabled: false,
      code: null,
    });
    expect(
      (
        await h.http
          .put('/v1/admin/referrals/settings')
          .set(reception.auth)
          .send({ enabled: true, pointsReferrer: 1, pointsFriend: 1 })
      ).status,
    ).toBe(403);
    const on = await h.http
      .put('/v1/admin/referrals/settings')
      .set(manager.auth)
      .send({ enabled: true, pointsReferrer: 200, pointsFriend: 100 });
    expect(on.status).toBe(200);
  });

  it('friend enters the code, the first payment gives points to both, once', async () => {
    const ana = await h.user({ member: true });
    const mine = await h.http.get('/v1/me/referral').set(ana.auth);
    const code: string = mine.body.data.code;
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    // The code stays the same.
    expect((await h.http.get('/v1/me/referral').set(ana.auth)).body.data.code).toBe(code);

    const bob = await h.user({ member: true });
    expect((await h.http.get('/v1/me/referral').set(bob.auth)).body.data.canClaim).toBe(true);
    const claim = await h.http
      .post('/v1/me/referral/claim')
      .set(bob.auth)
      .send({ code: ` ${code.slice(0, 3).toLowerCase()}-${code.slice(3)} ` });
    expect(claim.status).toBe(201);
    const bobView = (await h.http.get('/v1/me/referral').set(bob.auth)).body.data;
    expect(bobView).toMatchObject({ canClaim: false });
    expect(bobView.referredBy).toMatch(/^Test /);

    const before = (await loyalty(ana)).body.data.balance as number;
    expect((await pay(bob)).status).toBe(201);
    expect((await loyalty(ana)).body.data.balance).toBe(before + 200);
    const bobHistory = (await loyalty(bob)).body.data.history as Array<{ reason: string }>;
    expect(bobHistory.map((x) => x.reason)).toContain('referral');

    // A second payment gives nothing more.
    expect((await pay(bob)).status).toBe(201);
    expect((await loyalty(ana)).body.data.balance).toBe(before + 200);

    const anaView = (await h.http.get('/v1/me/referral').set(ana.auth)).body.data;
    expect(anaView.earned).toBe(200);
    expect(anaView.invited).toEqual([expect.objectContaining({ status: 'rewarded', points: 200 })]);
    const inbox = await h.http.get('/v1/me/notifications').set(ana.auth);
    expect(inbox.body.data.items.map((n: { kind: string }) => n.kind)).toContain(
      'referral_rewarded',
    );
    const admin = await h.http.get('/v1/admin/referrals').set(manager.auth);
    expect(admin.body.data.items[0]).toMatchObject({
      status: 'rewarded',
      referrerPoints: 200,
      friendPoints: 100,
    });
  });

  it('refuses own code, unknown code, a second code and a member who already paid', async () => {
    const a = await h.user({ member: true });
    const codeA = (await h.http.get('/v1/me/referral').set(a.auth)).body.data.code;
    const send = (m: TestUser, code: string) =>
      h.http.post('/v1/me/referral/claim').set(m.auth).send({ code });
    expect((await send(a, codeA)).body.message).toBe('errors.referral.own_code');
    expect((await send(a, 'ZZZZZZ')).body.message).toBe('errors.referral.invalid_code');
    expect((await send(a, 'O0O0O0')).status).toBe(400);

    const b = await h.user({ member: true });
    expect((await send(b, codeA)).status).toBe(201);
    const c = await h.user({ member: true });
    const codeC = (await h.http.get('/v1/me/referral').set(c.auth)).body.data.code;
    expect((await send(b, codeC)).body.message).toBe('errors.referral.already');

    const paid = await h.user({ member: true });
    expect((await pay(paid)).status).toBe(201);
    expect((await send(paid, codeA)).body.message).toBe('errors.referral.too_late');
  });
});
