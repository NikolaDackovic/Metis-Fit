import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let reception: TestUser;
let manager: TestUser;
let planId: string;
let otherPlanId: string;

async function plan(name: string, price: number) {
  const res = await h.http
    .post('/v1/admin/plans')
    .set(manager.auth)
    .send({
      isAvailable: true,
      translations: { sr: { name } },
      kind: 'unlimited',
      priceAmount: price,
      durationDays: 30,
      visitLimit: null,
    });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}
const sell = (memberId: string, body: Record<string, unknown>) =>
  h.http
    .post(`/v1/admin/members/${memberId}/memberships`)
    .set(reception.auth)
    .send({ planId, ...body });
const promo = (body: Record<string, unknown>) =>
  h.http
    .post('/v1/admin/promos')
    .set(manager.auth)
    .send({ kind: 'percent', value: 20, ...body });
const checkIn = (memberId: string, at = sql`now()`) =>
  sql`insert into attendance_attempts (member_id, source, result, reason_code, occurred_at)
      values (${memberId}, 'manual', 'granted', 'OK', ${at})`.execute(h.db);

beforeAll(async () => {
  h = await createHarness();
  reception = await h.user({ role: 'reception' });
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  planId = await plan('Mesečna', 550_000);
  otherPlanId = await plan('Boks', 400_000);
});
afterAll(async () => h?.close());

describe('promo codes', () => {
  it('discounts the membership price once per member and counts usage', async () => {
    expect((await promo({ code: 'jesen20' })).status).toBe(201);
    expect((await promo({ code: 'JESEN20' })).body.message).toBe('errors.promo.duplicate');
    // Reception may not create codes.
    expect(
      (
        await h.http
          .post('/v1/admin/promos')
          .set(reception.auth)
          .send({ code: 'X123', kind: 'fixed', value: 1 })
      ).status,
    ).toBe(403);

    const m = await h.user({ member: true });
    const preview = await h.http
      .post('/v1/admin/promos/check')
      .set(reception.auth)
      .send({ code: 'jesen20', memberId: m.memberId, planId });
    expect(preview.body.data).toEqual({
      code: 'JESEN20',
      originalAmount: 550_000,
      discountAmount: 110_000,
      finalAmount: 440_000,
      currency: 'RSD',
    });

    const sold = await sell(m.memberId!, {
      promoCode: 'Jesen20',
      payment: { amount: 440_000, method: 'cash' },
    });
    expect(sold.status).toBe(201);
    expect(sold.body.data).toMatchObject({
      priceAmount: 440_000,
      promoCode: 'JESEN20',
      discountAmount: 110_000,
      balanceAmount: 0,
    });
    const again = await sell(m.memberId!, { promoCode: 'JESEN20', startDate: undefined });
    expect(again.body.message).toBe('errors.promo.member_limit');

    const list = await h.http.get('/v1/admin/promos').set(manager.auth);
    expect(list.body.data[0]).toMatchObject({
      code: 'JESEN20',
      usesCount: 1,
      totalDiscount: 110_000,
    });
  });

  it('enforces plan scope, dates, total limit and never discounts below zero', async () => {
    await promo({ code: 'BOKS', planIds: [otherPlanId] });
    await promo({ code: 'STARO', validUntil: '2020-01-01' });
    await promo({ code: 'JEDAN', maxUses: 1, maxUsesPerMember: 5 });
    await promo({ code: 'POKLON', kind: 'fixed', value: 9_999_999 });
    const [a, b, c] = [
      await h.user({ member: true }),
      await h.user({ member: true }),
      await h.user({ member: true }),
    ];

    expect((await sell(a.memberId!, { promoCode: 'BOKS' })).body.message).toBe(
      'errors.promo.plan_not_eligible',
    );
    expect((await sell(a.memberId!, { promoCode: 'STARO' })).body.message).toBe(
      'errors.promo.expired',
    );
    expect((await sell(a.memberId!, { promoCode: 'NEMA' })).body.message).toBe(
      'errors.promo.not_found',
    );
    expect((await sell(a.memberId!, { promoCode: 'JEDAN' })).status).toBe(201);
    expect((await sell(b.memberId!, { promoCode: 'JEDAN' })).body.message).toBe(
      'errors.promo.used_up',
    );
    const free = await sell(c.memberId!, { promoCode: 'POKLON' });
    expect(free.body.data).toMatchObject({ priceAmount: 0, discountAmount: 550_000 });
  });

  it('public promotions show only active codes with a title', async () => {
    await promo({
      code: 'LETO',
      isPublic: true,
      translations: { sr: { title: 'Letnja akcija' }, en: { title: 'Summer deal' } },
    });
    const sr = await h.http.get('/v1/public/promotions?locale=sr');
    const en = await h.http.get('/v1/public/promotions?locale=en');
    expect(sr.body.data).toEqual([
      expect.objectContaining({ code: 'LETO', title: 'Letnja akcija', kind: 'percent', value: 20 }),
    ]);
    expect(en.body.data[0].title).toBe('Summer deal');
    // A public promo needs a Serbian title.
    expect((await promo({ code: 'BEZNASLOVA', isPublic: true })).status).toBe(400);
  });
});

describe('loyalty', () => {
  it('earns points for visits (once a day) and payments, and loses them on void and refund', async () => {
    const m = await h.user({ member: true });
    await checkIn(m.memberId!);
    await checkIn(m.memberId!); // same day: no extra points
    await checkIn(m.memberId!, sql`now() - interval '2 days'`);
    const sold = await sell(m.memberId!, { payment: { amount: 550_000, method: 'card' } });
    expect(sold.status).toBe(201);

    let me = await h.http.get('/v1/me/loyalty?locale=sr').set(m.auth);
    expect(me.body.data).toMatchObject({
      balance: 10 + 10 + 55,
      tier: 'bronze',
      nextTier: 'silver',
    });
    expect(me.body.data.pointsToNextTier).toBe(500 - 75);
    expect(me.body.data.rewards.length).toBeGreaterThan(0);

    const pay = await h.db
      .selectFrom('payments')
      .select('id')
      .where('member_id', '=', m.memberId!)
      .executeTakeFirstOrThrow();
    const refund = await h.http
      .post(`/v1/admin/payments/${pay.id}/refund`)
      .set(manager.auth)
      .send({ amount: 100_000, reason: 'Delimični povraćaj' });
    expect(refund.status).toBe(201);
    me = await h.http.get('/v1/me/loyalty').set(m.auth);
    expect(me.body.data.balance).toBe(75 - 10);

    const other = await h.user({ member: true });
    await sell(other.memberId!, { payment: { amount: 550_000, method: 'cash' } });
    const p2 = await h.db
      .selectFrom('payments')
      .select('id')
      .where('member_id', '=', other.memberId!)
      .executeTakeFirstOrThrow();
    await h.http
      .post(`/v1/admin/payments/${p2.id}/void`)
      .set(manager.auth)
      .send({ reason: 'Greška u unosu' })
      .expect(200);
    const o = await h.http.get(`/v1/admin/members/${other.memberId}/loyalty`).set(reception.auth);
    expect(o.body.data.balance).toBe(0);
    expect(o.body.data.history.map((x: { reason: string }) => x.reason)).toEqual([
      'payment_void',
      'payment',
    ]);
  });

  it('reception redeems rewards only with enough points; managers can adjust', async () => {
    const m = await h.user({ member: true });
    const rewards = await h.http.get('/v1/admin/loyalty/rewards').set(reception.auth);
    const cheapest = rewards.body.data.sort(
      (a: { costPoints: number }, b: { costPoints: number }) => a.costPoints - b.costPoints,
    )[0];

    const poor = await h.http
      .post(`/v1/admin/members/${m.memberId}/loyalty/redeem`)
      .set(reception.auth)
      .send({ rewardId: cheapest.id });
    expect(poor.body.message).toBe('errors.loyalty.insufficient');

    expect(
      (
        await h.http
          .post(`/v1/admin/members/${m.memberId}/loyalty/adjust`)
          .set(reception.auth)
          .send({ points: 500, note: 'Pokušaj' })
      ).status,
    ).toBe(403);
    const adj = await h.http
      .post(`/v1/admin/members/${m.memberId}/loyalty/adjust`)
      .set(manager.auth)
      .send({ points: 600, note: 'Dobrodošlica' });
    expect(adj.body.data).toMatchObject({ balance: 600, tier: 'silver' });

    const ok = await h.http
      .post(`/v1/admin/members/${m.memberId}/loyalty/redeem`)
      .set(reception.auth)
      .send({ rewardId: cheapest.id });
    expect(ok.status).toBe(200);
    expect(ok.body.data.balance).toBe(600 - cheapest.costPoints);
    // Spending points does not lower the tier.
    expect(ok.body.data.tier).toBe('silver');
    expect(ok.body.data.history[0]).toMatchObject({
      reason: 'redeem',
      points: -cheapest.costPoints,
    });
  });

  it('marketing messages reach only members who opted in', async () => {
    const yes = await h.user({ member: true });
    const no = await h.user({ member: true });
    const p = await h.http
      .put('/v1/me/notification-preferences')
      .set(yes.auth)
      .send({ marketing: true });
    expect(p.body.data.marketing).toBe(true);
    const sent = await h.http
      .post('/v1/admin/announcements')
      .set(manager.auth)
      .send({ title: 'Akcija', body: '20% popusta na godišnju članarinu', audience: 'marketing' });
    expect(sent.status).toBe(201);
    const got = await h.http.get('/v1/me/notifications').set(yes.auth);
    expect(got.body.data.items[0]).toMatchObject({ kind: 'announcement', category: 'marketing' });
    expect((await h.http.get('/v1/me/notifications').set(no.auth)).body.data.items).toHaveLength(0);
    const consents = await h.db
      .selectFrom('member_consents')
      .select(['type', 'granted'])
      .where('member_id', '=', yes.memberId!)
      .execute();
    expect(consents).toEqual([{ type: 'marketing', granted: true }]);
  });
});
