import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let manager: TestUser;
let reception: TestUser;
let coach: TestUser;
let trainerId: string;
let otherTrainerId: string;
let massage: { id: string; priceAmount: number };
let ptService: string;
let month: string;

beforeAll(async () => {
  h = await createHarness();
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
  coach = await h.user({ role: 'trainer' });
  const t1 = await h.http
    .post('/v1/admin/trainers')
    .set(manager.auth)
    .send({
      firstName: 'Ana',
      lastName: 'Masaža',
      isPublic: false,
      translations: { sr: { title: 'Terapeut' } },
    });
  trainerId = t1.body.data.id;
  await sql`update trainers set user_id = ${coach.userId} where id = ${trainerId}`.execute(h.db);
  const t2 = await h.http
    .post('/v1/admin/trainers')
    .set(manager.auth)
    .send({
      firstName: 'Bojan',
      lastName: 'PT',
      isPublic: false,
      translations: { sr: { title: 'Trener' } },
    });
  otherTrainerId = t2.body.data.id;
  const list = await h.http.get('/v1/admin/services?locale=en').set(reception.auth);
  const m = list.body.data.find((s: { name: string }) => /massage/i.test(s.name));
  massage = { id: m.id, priceAmount: m.priceAmount };
  ptService = list.body.data.find((s: { key: string | null }) => s.key === 'pt_session').id;
  month = await sql<{ m: string }>`select to_char(public.club_today(), 'YYYY-MM') as m`
    .execute(h.db)
    .then((r) => r.rows[0]!.m);
});
afterAll(async () => h?.close());

describe('services and trainer earnings', () => {
  it('public price list hides the internal PT entry', async () => {
    const pub = await h.http.get('/v1/public/services?locale=sr');
    expect(pub.body.data.some((s: { key: string | null }) => s.key === 'pt_session')).toBe(false);
    expect(pub.body.data.length).toBeGreaterThan(0);
  });

  it('a sale freezes the trainer share; later rate changes do not rewrite it', async () => {
    // Needs a provider.
    const noTrainer = await h.http
      .post('/v1/admin/service-sales')
      .set(reception.auth)
      .send({ serviceId: massage.id, paymentMethod: 'cash' });
    expect(noTrainer.status).toBe(400);

    const sale = await h.http
      .post('/v1/admin/service-sales')
      .set(reception.auth)
      .send({ serviceId: massage.id, trainerId, paymentMethod: 'card', qty: 2 });
    expect(sale.status).toBe(201);
    expect(sale.body.data).toMatchObject({
      totalAmount: massage.priceAmount * 2,
      trainerShareAmount: Math.round(massage.priceAmount * 2 * 0.4), // default 40 %
      trainerName: 'Ana Masaža',
    });

    // Ana gets a fixed 1.000 RSD per massage from now on.
    expect(
      (
        await h.http
          .put('/v1/admin/trainer-rates')
          .set(reception.auth)
          .send({ trainerId, serviceId: massage.id, shareKind: 'fixed', shareValue: 100_000 })
      ).status,
    ).toBe(403);
    await h.http
      .put('/v1/admin/trainer-rates')
      .set(manager.auth)
      .send({ trainerId, serviceId: massage.id, shareKind: 'fixed', shareValue: 100_000 })
      .expect(200);
    const second = await h.http
      .post('/v1/admin/service-sales')
      .set(reception.auth)
      .send({ serviceId: massage.id, trainerId, paymentMethod: 'cash' });
    expect(second.body.data.trainerShareAmount).toBe(100_000);

    // A walk-in guest buys something without a provider.
    const towel = (
      await h.http.get('/v1/admin/services?locale=en').set(reception.auth)
    ).body.data.find((s: { name: string }) => /towel/i.test(s.name));
    const guest = await h.http
      .post('/v1/admin/service-sales')
      .set(reception.auth)
      .send({ serviceId: towel.id, paymentMethod: 'cash' });
    expect(guest.body.data).toMatchObject({ memberId: null, trainerShareAmount: 0 });

    // Voiding: reception cannot, a manager can; voided sales leave the earnings.
    const voidIt = (who: TestUser) =>
      h.http
        .post(`/v1/admin/service-sales/${second.body.data.id}/void`)
        .set(who.auth)
        .send({ reason: 'Greška' });
    expect((await voidIt(reception)).status).toBe(403);
    expect((await voidIt(manager)).body.data.voidReason).toBe('Greška');

    const e = await h.http
      .get(`/v1/admin/trainer-earnings?month=${month}&locale=en`)
      .set(manager.auth);
    const ana = e.body.data.trainers.find((t: { trainerId: string }) => t.trainerId === trainerId);
    expect(ana).toMatchObject({
      servicesShare: Math.round(massage.priceAmount * 2 * 0.4),
      ptSessions: 0,
    });
    expect(ana.services[0]).toMatchObject({ count: 2, revenue: massage.priceAmount * 2 });
  });

  it('PT sessions earn the per-session share; trainers see only their own earnings', async () => {
    // Bojan: 60 % of the per-session value of the package.
    await h.http
      .put('/v1/admin/trainer-rates')
      .set(manager.auth)
      .send({
        trainerId: otherTrainerId,
        serviceId: ptService,
        shareKind: 'percent',
        shareValue: 60,
      })
      .expect(200);
    const plan = await h.http
      .post('/v1/admin/plans')
      .set(manager.auth)
      .send({
        isAvailable: true,
        translations: { sr: { name: 'PT 10' } },
        kind: 'personal_training',
        priceAmount: 3_000_000,
        durationDays: 60,
        visitLimit: 10,
      });
    const m = await h.user({ member: true });
    const ms = await h.http
      .post(`/v1/admin/members/${m.memberId}/memberships`)
      .set(reception.auth)
      .send({ planId: plan.body.data.id });
    const rec = await h.http
      .post(`/v1/admin/memberships/${ms.body.data.id}/pt-sessions`)
      .set(reception.auth)
      .send({ trainerId: otherTrainerId });
    expect(rec.status).toBe(201);
    const e = await h.http.get(`/v1/admin/trainer-earnings?month=${month}`).set(manager.auth);
    const bojan = e.body.data.trainers.find(
      (t: { trainerId: string }) => t.trainerId === otherTrainerId,
    );
    // 30.000 RSD / 10 sessions × 60 % = 1.800 RSD
    expect(bojan).toMatchObject({ ptSessions: 1, ptShare: 180_000, total: 180_000 });

    expect(
      (await h.http.get(`/v1/admin/trainer-earnings?month=${month}`).set(coach.auth)).status,
    ).toBe(403);
    const mine = await h.http.get(`/v1/admin/my-earnings?month=${month}`).set(coach.auth);
    expect(mine.status).toBe(200);
    expect(mine.body.data.trainers.map((t: { trainerId: string }) => t.trainerId)).toEqual([
      trainerId,
    ]);
  });
});
