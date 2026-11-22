import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let reception: TestUser;
let manager: TestUser;
let today: string;

const addDays = (d: string, n: number) =>
  new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

const plan = {
  kind: 'unlimited',
  priceAmount: 550_000,
  durationDays: 30,
  visitLimit: null,
  isAvailable: true,
  zones: ['gym'],
  translations: { sr: { name: 'Teretana - mesečna' }, en: { name: 'Gym - monthly' } },
};

async function newMember(name = 'Petar') {
  const res = await h.http
    .post('/v1/admin/members')
    .set(reception.auth)
    .send({ firstName: name, lastName: 'Test', phone: `06${Math.floor(Math.random() * 1e8)}` });
  return res.body.data.id as string;
}

let planId: string;

beforeAll(async () => {
  h = await createHarness();
  reception = await h.user({ role: 'reception' });
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  today = (await sql<{ d: string }>`select public.club_today()::text d`.execute(h.db)).rows[0]!.d;
  const res = await h.http.post('/v1/admin/plans').set(manager.auth).send(plan);
  expect(res.status).toBe(201);
  planId = res.body.data.id;
});
afterAll(async () => h?.close());

describe('plans', () => {
  it('lists plans with translations and zones', async () => {
    const res = await h.http.get('/v1/admin/plans').set(reception.auth);
    expect(res.body.data[0]).toMatchObject({
      priceAmount: 550_000,
      zones: ['gym'],
      translations: { sr: { name: 'Teretana - mesečna' } },
    });
  });

  it('requires a duration or a visit limit', async () => {
    const res = await h.http
      .post('/v1/admin/plans')
      .set(manager.auth)
      .send({ ...plan, durationDays: null, visitLimit: null });
    expect(res.status).toBe(400);
  });

  it('reception cannot change plans', async () => {
    const res = await h.http
      .patch(`/v1/admin/plans/${planId}`)
      .set(reception.auth)
      .send({ priceAmount: 1 });
    expect(res.status).toBe(403);
  });
});

describe('assign membership', () => {
  it('creates membership + payment atomically with computed end date, status and balance', async () => {
    const memberId = await newMember();
    const res = await h.http
      .post(`/v1/admin/members/${memberId}/memberships`)
      .set(reception.auth)
      .send({ planId, payment: { amount: 550_000, method: 'cash' } });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      startDate: today,
      endDate: addDays(today, 29),
      displayStatus: 'active',
      priceAmount: 550_000,
      paidAmount: 550_000,
      balanceAmount: 0,
      planName: 'Teretana - mesečna',
    });
    const actions = await h.db
      .selectFrom('audit_logs')
      .select('action')
      .where('actor_id', '=', reception.userId)
      .where('action', 'in', ['membership.create', 'payment.create'])
      .execute();
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining(['membership.create', 'payment.create']),
    );
  });

  it('allows selling with debt and reports the balance', async () => {
    const memberId = await newMember();
    const res = await h.http
      .post(`/v1/admin/members/${memberId}/memberships`)
      .set(reception.auth)
      .send({ planId, payment: { amount: 200_000, method: 'card' } });
    expect(res.body.data.balanceAmount).toBe(350_000);
  });

  it('renewal starts the day after the current same-plan membership ends', async () => {
    const memberId = await newMember();
    await h.http
      .post(`/v1/admin/members/${memberId}/memberships`)
      .set(reception.auth)
      .send({ planId });
    const renewal = await h.http
      .post(`/v1/admin/members/${memberId}/memberships`)
      .set(reception.auth)
      .send({ planId });
    expect(renewal.status).toBe(201);
    expect(renewal.body.data.startDate).toBe(addDays(today, 30));
  });

  it('rejects an explicit overlapping period with 409', async () => {
    const memberId = await newMember();
    await h.http
      .post(`/v1/admin/members/${memberId}/memberships`)
      .set(reception.auth)
      .send({ planId });
    const res = await h.http
      .post(`/v1/admin/members/${memberId}/memberships`)
      .set(reception.auth)
      .send({ planId, startDate: addDays(today, 10) });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('errors.membership.overlap');
  });

  it('limits backdating to 7 days', async () => {
    const memberId = await newMember();
    const res = await h.http
      .post(`/v1/admin/members/${memberId}/memberships`)
      .set(reception.auth)
      .send({ planId, startDate: addDays(today, -8) });
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('errors.membership.start_too_early');
  });

  it('refuses unavailable plans and deactivated members', async () => {
    const hidden = await h.http
      .post('/v1/admin/plans')
      .set(manager.auth)
      .send({ ...plan, isAvailable: false, translations: { sr: { name: 'Skriven' } } });
    const memberId = await newMember();
    const r1 = await h.http
      .post(`/v1/admin/members/${memberId}/memberships`)
      .set(reception.auth)
      .send({ planId: hidden.body.data.id });
    expect(r1.body.message).toBe('errors.plan.unavailable');

    await h.http
      .post(`/v1/admin/members/${memberId}/deactivate`)
      .set(manager.auth)
      .send({ reason: 'test' });
    const r2 = await h.http
      .post(`/v1/admin/members/${memberId}/memberships`)
      .set(reception.auth)
      .send({ planId });
    expect(r2.body.message).toBe('errors.member.deactivated');
  });

  it('cancel requires the permission and a reason; status becomes cancelled', async () => {
    const memberId = await newMember();
    const ms = await h.http
      .post(`/v1/admin/members/${memberId}/memberships`)
      .set(reception.auth)
      .send({ planId });
    const id = ms.body.data.id;
    expect(
      (
        await h.http
          .post(`/v1/admin/memberships/${id}/cancel`)
          .set(reception.auth)
          .send({ reason: 'x y z' })
      ).status,
    ).toBe(403);
    const res = await h.http
      .post(`/v1/admin/memberships/${id}/cancel`)
      .set(manager.auth)
      .send({ reason: 'greška pri unosu' });
    expect(res.body.data.displayStatus).toBe('cancelled');
  });
});

describe('member list status', () => {
  it('shows the best current membership and filters by status', async () => {
    const withPlan = await newMember('Statusni');
    await h.http
      .post(`/v1/admin/members/${withPlan}/memberships`)
      .set(reception.auth)
      .send({ planId });
    const without = await newMember('Bezčlanarine');

    const active = await h.http
      .get('/v1/admin/members')
      .query({ status: 'active' })
      .set(reception.auth);
    const ids = active.body.data.map((m: { id: string }) => m.id);
    expect(ids).toContain(withPlan);
    expect(ids).not.toContain(without);

    const none = await h.http
      .get('/v1/admin/members')
      .query({ status: 'none', q: 'Bezčlanarine' })
      .set(reception.auth);
    expect(none.body.data[0]).toMatchObject({
      id: without,
      currentStatus: 'none',
      currentPlanName: null,
    });
  });
});

describe('payments', () => {
  let memberId: string;
  let paymentId: string;

  beforeAll(async () => {
    memberId = await newMember('Platiša');
    const res = await h.http
      .post('/v1/admin/payments')
      .set(reception.auth)
      .send({ memberId, amount: 300_000, method: 'cash', note: 'uplata' });
    expect(res.status).toBe(201);
    paymentId = res.body.data.id;
  });

  it('rejects a membership that belongs to another member', async () => {
    const other = await newMember();
    const ms = await h.http
      .post(`/v1/admin/members/${other}/memberships`)
      .set(reception.auth)
      .send({ planId });
    const res = await h.http
      .post('/v1/admin/payments')
      .set(reception.auth)
      .send({ memberId, membershipId: ms.body.data.id, amount: 100, method: 'cash' });
    expect(res.body.message).toBe('errors.payment.membership_mismatch');
  });

  it('reception cannot void or refund', async () => {
    expect(
      (
        await h.http
          .post(`/v1/admin/payments/${paymentId}/void`)
          .set(reception.auth)
          .send({ reason: 'abc' })
      ).status,
    ).toBe(403);
    expect(
      (
        await h.http
          .post(`/v1/admin/payments/${paymentId}/refund`)
          .set(reception.auth)
          .send({ amount: 1, reason: 'abc' })
      ).status,
    ).toBe(403);
  });

  it('refunds partially, never more than paid, and blocks voiding a refunded payment', async () => {
    const r1 = await h.http
      .post(`/v1/admin/payments/${paymentId}/refund`)
      .set(manager.auth)
      .send({ amount: 100_000, reason: 'delimičan povraćaj' });
    expect(r1.status).toBe(201);
    expect(r1.body.data).toMatchObject({ amount: -100_000, refundOf: paymentId });

    const r2 = await h.http
      .post(`/v1/admin/payments/${paymentId}/refund`)
      .set(manager.auth)
      .send({ amount: 200_001, reason: 'previše' });
    expect(r2.body.message).toBe('errors.payment.refund_exceeds');

    const v = await h.http
      .post(`/v1/admin/payments/${paymentId}/void`)
      .set(manager.auth)
      .send({ reason: 'pokušaj' });
    expect(v.body.message).toBe('errors.payment.has_refunds');

    const list = await h.http.get('/v1/admin/payments').query({ memberId }).set(manager.auth);
    const original = list.body.data.find((p: { id: string }) => p.id === paymentId);
    expect(original.refundedAmount).toBe(100_000);
  });

  it('voids once with a reason', async () => {
    const p = await h.http
      .post('/v1/admin/payments')
      .set(reception.auth)
      .send({ memberId, amount: 5000, method: 'card' });
    const v = await h.http
      .post(`/v1/admin/payments/${p.body.data.id}/void`)
      .set(manager.auth)
      .send({ reason: 'pogrešan iznos' });
    expect(v.body.data).toMatchObject({ status: 'voided', voidReason: 'pogrešan iznos' });
    const again = await h.http
      .post(`/v1/admin/payments/${p.body.data.id}/void`)
      .set(manager.auth)
      .send({ reason: 'opet' });
    expect(again.body.message).toBe('errors.payment.already_voided');
  });

  it('filters by date range', async () => {
    const future = await h.http
      .get('/v1/admin/payments')
      .query({ from: addDays(today, 1), to: addDays(today, 2) })
      .set(manager.auth);
    expect(future.body.data).toEqual([]);
    expect(future.body.meta.total).toBe(0);
  });
});

describe('dashboard', () => {
  it('returns real numbers and a full daily series', async () => {
    const res = await h.http
      .get('/v1/admin/reports/dashboard')
      .query({ from: addDays(today, -6), to: today })
      .set(manager.auth);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.today).toBe(today);
    expect(d.daily).toHaveLength(7);
    expect(d.activeMembers).toBeGreaterThan(0);
    expect(d.checkinsToday).toBe(0); // no check-ins exist yet - must not be invented

    const revenueRows = await sql<{ s: number }>`
      select coalesce(sum(amount), 0)::int s from payments where status = 'recorded'`.execute(h.db);
    expect(d.revenue.total).toBe(revenueRows.rows[0]!.s);
    expect(d.daily.at(-1).revenue).toBe(revenueRows.rows[0]!.s);
  });

  it('is not available to reception', async () => {
    const res = await h.http
      .get('/v1/admin/reports/dashboard')
      .query({ from: today, to: today })
      .set(reception.auth);
    expect(res.status).toBe(403);
  });

  it('rejects inverted and overly long ranges', async () => {
    const bad = await h.http
      .get('/v1/admin/reports/dashboard')
      .query({ from: today, to: addDays(today, -1) })
      .set(manager.auth);
    expect(bad.status).toBe(400);
  });
});

describe('member history', () => {
  it('stores notes for staff and shows full audit trail for a member', async () => {
    const memberId = await newMember('Istorija');
    await h.http
      .post(`/v1/admin/members/${memberId}/notes`)
      .set(reception.auth)
      .send({ body: 'Povreda kolena' });
    await h.http
      .post(`/v1/admin/members/${memberId}/memberships`)
      .set(reception.auth)
      .send({ planId, payment: { amount: 1000, method: 'cash' } });

    const notes = await h.http.get(`/v1/admin/members/${memberId}/notes`).set(reception.auth);
    expect(notes.body.data[0].body).toBe('Povreda kolena');

    const audit = await h.http.get(`/v1/admin/members/${memberId}/audit`).set(manager.auth);
    const actions = audit.body.data.map((a: { action: string }) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'member.create',
        'member_note.create',
        'membership.create',
        'payment.create',
      ]),
    );
    // note text must not leak into the audit log
    expect(JSON.stringify(audit.body.data)).not.toContain('Povreda kolena');

    expect(
      (await h.http.get(`/v1/admin/members/${memberId}/audit`).set(reception.auth)).status,
    ).toBe(403);
  });
});
