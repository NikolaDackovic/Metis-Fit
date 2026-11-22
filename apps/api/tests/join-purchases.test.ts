import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let manager: TestUser;
let reception: TestUser;
let planId: string;

beforeAll(async () => {
  h = await createHarness();
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
  const plan = await h.http
    .post('/v1/admin/plans')
    .set(manager.auth)
    .send({
      isAvailable: true,
      translations: { sr: { name: 'Mesečna' }, en: { name: 'Monthly' } },
      kind: 'unlimited',
      priceAmount: 550_000,
      durationDays: 30,
      visitLimit: null,
    });
  planId = plan.body.data.id;
});
afterAll(async () => h?.close());

describe('joining from the app', () => {
  it('a new account becomes a member, asks for a membership, reception activates it', async () => {
    const u = await h.user();
    // Not a member yet.
    expect(
      (await h.http.post('/v1/me/membership-requests').set(u.auth).send({ planId })).status,
    ).toBeGreaterThanOrEqual(400);
    const plans = await h.http.get('/v1/public/plans?locale=en');
    expect(plans.body.data.find((p: { id: string }) => p.id === planId)).toMatchObject({
      name: 'Monthly',
      priceAmount: 550_000,
    });

    const join = await h.http
      .post('/v1/me/member')
      .set(u.auth)
      .send({ phone: '+381601234567', dateOfBirth: '1995-05-20' });
    expect(join.status).toBe(201);
    expect((await h.http.post('/v1/me/member').set(u.auth).send({})).status).toBe(409);
    const me = await h.http.get('/v1/me').set(u.auth);
    expect(me.body.data.member).toBeTruthy();

    const req = await h.http.post('/v1/me/membership-requests').set(u.auth).send({ planId });
    expect(req.status).toBe(201);
    expect(req.body.data).toMatchObject({
      state: 'pending',
      displayStatus: 'pending',
      priceAmount: 550_000,
    });
    expect(
      (await h.http.post('/v1/me/membership-requests').set(u.auth).send({ planId })).body.message,
    ).toBe('errors.membership.request_open');

    // The front desk sees the request among the alerts and activates it with the payment.
    const alerts = await h.http.get('/v1/admin/alerts').set(reception.auth);
    expect(
      alerts.body.data.requests.map((r: { membershipId: string }) => r.membershipId),
    ).toContain(req.body.data.id);
    expect(alerts.body.data.debts.map((d: { memberId: string }) => d.memberId)).not.toContain(
      me.body.data.member.id,
    );
    const act = await h.http
      .post(`/v1/admin/memberships/${req.body.data.id}/activate`)
      .set(reception.auth)
      .send({ payment: { amount: 550_000, method: 'cash' } });
    expect(act.status).toBe(200);
    expect(act.body.data).toMatchObject({ state: 'active', balanceAmount: 0 });
    expect(
      (
        await h.http
          .post(`/v1/admin/memberships/${req.body.data.id}/activate`)
          .set(reception.auth)
          .send({})
      ).status,
    ).toBe(409);
  });

  it('someone already registered at the front desk must use the link code', async () => {
    const u = await h.user({ email: 'vec.clan@example.com' });
    await h.db
      .insertInto('members')
      .values({ first_name: 'Već', last_name: 'Član', email: 'vec.clan@example.com' })
      .execute();
    const r = await h.http.post('/v1/me/member').set(u.auth).send({});
    expect(r.body.message).toBe('errors.member.use_link_code');
  });

  it('a member can withdraw an unpaid request', async () => {
    const m = await h.user({ member: true });
    const req = await h.http.post('/v1/me/membership-requests').set(m.auth).send({ planId });
    expect(
      (await h.http.delete(`/v1/me/membership-requests/${req.body.data.id}`).set(m.auth)).status,
    ).toBe(200);
    expect(
      (await h.http.delete(`/v1/me/membership-requests/${req.body.data.id}`).set(m.auth)).status,
    ).toBe(404);
  });
});
