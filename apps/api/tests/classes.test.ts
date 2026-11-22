import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BookingDto, ClassAdminDto } from '@grit/validation';
import { bookingLimiter, ptRequestLimiter } from '../src/modules/classes/classes.routes';
import { resetGenerationThrottle } from '../src/modules/classes/classes.query';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let manager: TestUser;
let reception: TestUser;
let crossfitType: string;
let boxingType: string;
let trainerId: string;
const plans: Record<string, string> = {};

const MIN = 60_000;
const inMinutes = (m: number) => new Date(Date.now() + m * MIN).toISOString();

async function createPlan(key: string, body: Record<string, unknown>) {
  const res = await h.http
    .post('/v1/admin/plans')
    .set(manager.auth)
    .send({ isAvailable: true, translations: { sr: { name: key } }, ...body });
  expect(res.status).toBe(201);
  plans[key] = res.body.data.id;
}

/** A linked app member with an (optional) membership of the given plan. */
async function member(planKey?: string) {
  const m = await h.user({ member: true });
  if (planKey) {
    const res = await h.http
      .post(`/v1/admin/members/${m.memberId}/memberships`)
      .set(reception.auth)
      .send({ planId: plans[planKey] });
    expect(res.status).toBe(201);
  }
  return m;
}

async function createClass(opts: { startsIn: number; capacity?: number; type?: string }) {
  const res = await h.http
    .post('/v1/admin/classes')
    .set(manager.auth)
    .send({
      classTypeId: opts.type ?? crossfitType,
      trainerId,
      startsAt: inMinutes(opts.startsIn),
      durationMin: 60,
      capacity: opts.capacity ?? 10,
      roomKey: 'crossfit',
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data as ClassAdminDto;
}

const book = (m: TestUser, classId: string, waitlist = true) =>
  h.http.post('/v1/me/bookings').set(m.auth).send({ classId, waitlist });
const cancel = (m: TestUser, bookingId: string) =>
  h.http.post(`/v1/me/bookings/${bookingId}/cancel`).set(m.auth).send();
const roster = (classId: string) =>
  h.http.get(`/v1/admin/classes/${classId}/roster`).set(reception.auth);

beforeAll(async () => {
  h = await createHarness();
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
  const ct = await h.http
    .post('/v1/admin/class-types')
    .set(manager.auth)
    .send({
      key: 'crossfit',
      zone: 'crossfit',
      color: '#E54E26',
      translations: { sr: { name: 'CrossFit' }, ru: { name: 'Кроссфит' } },
    });
  expect(ct.status).toBe(201);
  crossfitType = ct.body.data.id;
  const bt = await h.http
    .post('/v1/admin/class-types')
    .set(manager.auth)
    .send({
      key: 'boxing',
      zone: 'boxing',
      color: '#F5A524',
      translations: { sr: { name: 'Boks' } },
    });
  boxingType = bt.body.data.id;
  const tr = await h.http
    .post('/v1/admin/trainers')
    .set(manager.auth)
    .send({
      firstName: 'Ana',
      lastName: 'Trener',
      isPublic: true,
      translations: { sr: { title: 'CrossFit trener' }, ru: { title: 'Тренер по кроссфиту' } },
    });
  expect(tr.status).toBe(201);
  trainerId = tr.body.data.id;
  await createPlan('crossfit', {
    kind: 'class_pack',
    priceAmount: 700_000,
    durationDays: 30,
    visitLimit: null,
    zones: ['crossfit', 'gym'],
  });
  await createPlan('boxing', {
    kind: 'class_pack',
    priceAmount: 800_000,
    durationDays: 30,
    visitLimit: null,
    zones: ['boxing'],
  });
  await createPlan('pt', {
    kind: 'personal_training',
    priceAmount: 2_400_000,
    durationDays: 45,
    visitLimit: 2,
    zones: ['gym'],
  });
});
afterAll(async () => h?.close());
beforeEach(() => {
  bookingLimiter.reset();
  ptRequestLimiter.reset();
});

describe('schedule (public)', () => {
  it('lists sessions with free spots and a localized type name', async () => {
    const c = await createClass({ startsIn: 24 * 60 });
    // The API filters by the club's (Belgrade) calendar day, not the UTC one.
    const day = new Date(c.startsAt).toLocaleDateString('sv-SE', { timeZone: 'Europe/Belgrade' });
    const res = await h.http.get('/v1/public/classes').query({ from: day, to: day, locale: 'ru' });
    expect(res.status).toBe(200);
    const found = res.body.data.find((s: { id: string }) => s.id === c.id);
    expect(found).toMatchObject({
      typeName: 'Кроссфит',
      capacity: 10,
      spotsLeft: 10,
      trainer: { name: 'Ana Trener' },
    });
    expect(found).not.toHaveProperty('seriesId');
  });

  it('rejects ranges longer than 14 days', async () => {
    const res = await h.http
      .get('/v1/public/classes')
      .query({ from: '2026-01-01', to: '2026-02-01' });
    expect(res.status).toBe(400);
  });

  it('exposes booking rules (DECISIONS A15)', async () => {
    const res = await h.http.get('/v1/public/class-rules');
    expect(res.body.data).toEqual({
      bookingWindowDays: 7,
      cancelCutoffMinutes: 120,
      strikeLimit: 3,
      strikeWindowDays: 30,
      banDays: 7,
    });
  });

  it('hides trainers without a public profile', async () => {
    const hidden = await h.http
      .post('/v1/admin/trainers')
      .set(manager.auth)
      .send({ firstName: 'Skriveni', lastName: 'Trener', isPublic: false });
    const res = await h.http.get('/v1/public/trainers');
    const ids = res.body.data.map((t: { id: string }) => t.id);
    expect(ids).toContain(trainerId);
    expect(ids).not.toContain(hidden.body.data.id);
  });
});

describe('booking rules', () => {
  it('a member with a matching membership books; others are refused', async () => {
    const c = await createClass({ startsIn: 24 * 60 });
    const ok = await member('crossfit');
    const res = await book(ok, c.id);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'confirmed', class: { spotsLeft: 9 } });

    const again = await book(ok, c.id);
    expect(again.status).toBe(409);
    expect(again.body.message).toBe('errors.booking.already_booked');

    const none = await book(await member(), c.id);
    expect(none.status).toBe(422);
    expect(none.body.message).toBe('errors.booking.no_membership');

    // A boxing membership does not cover CrossFit.
    const wrongZone = await book(await member('boxing'), c.id);
    expect(wrongZone.body.message).toBe('errors.booking.no_membership');

    const unlinked = await h.user();
    expect((await book(unlinked, c.id)).body.message).toBe('errors.booking.not_linked');
  });

  it('booking opens 7 days ahead and closes at the start; the desk may still book', async () => {
    const m = await member('crossfit');
    const far = await createClass({ startsIn: 8 * 24 * 60 });
    const early = await book(m, far.id);
    expect(early.status).toBe(422);
    expect(early.body.message).toBe('errors.booking.not_open_yet');

    const started = await createClass({ startsIn: -10 });
    expect((await book(m, started.id)).body.message).toBe('errors.booking.closed');
    const desk = await h.http
      .post(`/v1/admin/classes/${started.id}/bookings`)
      .set(reception.auth)
      .send({ memberId: m.memberId });
    expect(desk.status).toBe(201);
  });

  it('the last spot goes to exactly one member under concurrent requests', async () => {
    const c = await createClass({ startsIn: 24 * 60, capacity: 3 });
    const members = await Promise.all(Array.from({ length: 8 }, () => member('crossfit')));
    const results = await Promise.all(members.map((m) => book(m, c.id)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    const statuses = results.map((r) => (r.body.data as BookingDto).status);
    expect(statuses.filter((s) => s === 'confirmed')).toHaveLength(3);
    expect(statuses.filter((s) => s === 'waitlisted')).toHaveLength(5);
    const positions = results
      .map((r) => (r.body.data as BookingDto).waitlistPosition)
      .filter((p) => p !== null)
      .sort();
    expect(positions).toEqual([1, 2, 3, 4, 5]);

    // Without waitlist the request fails instead.
    const late = await book(await member('crossfit'), c.id, false);
    expect(late.body.message).toBe('errors.booking.full');
  });

  it('cancelling a confirmed booking promotes the first member on the waitlist (FIFO)', async () => {
    const c = await createClass({ startsIn: 24 * 60, capacity: 1 });
    const [a, b, d] = [
      await member('crossfit'),
      await member('crossfit'),
      await member('crossfit'),
    ];
    const ba = (await book(a, c.id)).body.data as BookingDto;
    const bb = (await book(b, c.id)).body.data as BookingDto;
    await book(d, c.id);
    expect(bb).toMatchObject({ status: 'waitlisted', waitlistPosition: 1 });

    const res = await cancel(a, ba.id);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ lateCancel: false, booking: { status: 'cancelled' } });

    const mine = await h.http.get('/v1/me/bookings').set(b.auth);
    expect(mine.body.data.upcoming[0]).toMatchObject({ status: 'confirmed' });
    expect(mine.body.data.upcoming[0].promotedAt).not.toBeNull();
    // The promoted member is told in the app (F8); the one still waiting is not.
    const inboxB = await h.http.get('/v1/me/notifications').set(b.auth);
    expect(inboxB.body.data.items[0]).toMatchObject({
      kind: 'waitlist_promoted',
      category: 'classes',
    });
    expect((await h.http.get('/v1/me/notifications').set(d.auth)).body.data.items).toHaveLength(0);
    const r = await roster(c.id);
    const byStatus = r.body.data.entries.map((e: { status: string }) => e.status);
    expect(byStatus).toEqual(['cancelled', 'confirmed', 'waitlisted']);

    // Another member cannot cancel someone else's booking.
    expect((await cancel(d, bb.id)).status).toBe(404);
  });

  it('a cancellation within 2 hours of the start is late (counts as a strike)', async () => {
    const c = await createClass({ startsIn: 60 });
    const m = await member('crossfit');
    const b = (await book(m, c.id)).body.data as BookingDto;
    const res = await cancel(m, b.id);
    expect(res.body.data.lateCancel).toBe(true);
    const mine = await h.http.get('/v1/me/bookings').set(m.auth);
    expect(mine.body.data.strikes).toBe(1);
    expect(mine.body.data.bannedUntil).toBeNull();
  });

  it('3 no-shows in 30 days block app booking for 7 days', async () => {
    const m = await member('crossfit');
    for (let i = 0; i < 3; i += 1) {
      const c = await createClass({ startsIn: -5 - i });
      const desk = await h.http
        .post(`/v1/admin/classes/${c.id}/bookings`)
        .set(reception.auth)
        .send({ memberId: m.memberId });
      const mark = await h.http
        .post(`/v1/admin/bookings/${desk.body.data.id}/attendance`)
        .set(reception.auth)
        .send({ status: 'no_show' });
      expect(mark.status).toBe(200);
    }
    const next = await createClass({ startsIn: 24 * 60 });
    const res = await book(m, next.id);
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('errors.booking.banned');
    const mine = await h.http.get('/v1/me/bookings').set(m.auth);
    expect(mine.body.data.strikes).toBe(3);
    expect(mine.body.data.bannedUntil).not.toBeNull();
  });

  it('attendance cannot be marked long before the class', async () => {
    const c = await createClass({ startsIn: 24 * 60 });
    const m = await member('crossfit');
    const b = (await book(m, c.id)).body.data as BookingDto;
    const res = await h.http
      .post(`/v1/admin/bookings/${b.id}/attendance`)
      .set(reception.auth)
      .send({ status: 'attended' });
    expect(res.body.message).toBe('errors.booking.attendance_too_early');
  });
});

describe('managing sessions', () => {
  it('capacity cannot drop below confirmed bookings; raising it promotes the waitlist', async () => {
    const c = await createClass({ startsIn: 24 * 60, capacity: 1 });
    const a = await member('crossfit');
    const b = await member('crossfit');
    await book(a, c.id);
    await book(b, c.id);
    const down = await h.http
      .patch(`/v1/admin/classes/${c.id}`)
      .set(manager.auth)
      .send({ capacity: 0 });
    expect(down.status).toBe(400);
    const up = await h.http
      .patch(`/v1/admin/classes/${c.id}`)
      .set(manager.auth)
      .send({ capacity: 2 });
    expect(up.status).toBe(200);
    expect(up.body.data).toMatchObject({ capacity: 2, booked: 2, waitlisted: 0 });
  });

  it('cancelling a session cancels all bookings without penalty', async () => {
    const c = await createClass({ startsIn: 30 });
    const m = await member('crossfit');
    await book(m, c.id);
    const res = await h.http
      .post(`/v1/admin/classes/${c.id}/cancel`)
      .set(manager.auth)
      .send({ reason: 'Trener bolestan' });
    expect(res.body.data).toEqual({ cancelledBookings: 1 });
    const mine = await h.http.get('/v1/me/bookings').set(m.auth);
    expect(mine.body.data.strikes).toBe(0);
    expect((await book(m, c.id)).body.message).toBe('errors.booking.class_cancelled');
    const inbox = await h.http.get('/v1/me/notifications').set(m.auth);
    expect(inbox.body.data.items.map((n: { kind: string }) => n.kind)).toContain('class_cancelled');
  });

  it('a weekly series generates sessions; ending it removes later empty sessions', async () => {
    resetGenerationThrottle();
    const s = await h.http.post('/v1/admin/class-series').set(manager.auth).send({
      classTypeId: boxingType,
      weekday: 3,
      startTime: '19:00',
      durationMin: 60,
      capacity: 12,
    });
    expect(s.status).toBe(201);
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 35 * 24 * 60 * MIN).toISOString().slice(0, 10);
    const list = async () =>
      (
        (await h.http.get('/v1/admin/classes').set(reception.auth).query({ from, to })).body
          .data as ClassAdminDto[]
      ).filter((c) => c.seriesId === s.body.data.id && c.status === 'scheduled');
    const before = await list();
    expect(before.length).toBeGreaterThanOrEqual(3);
    expect(new Set(before.map((c) => new Date(c.startsAt).getUTCDay()))).toEqual(new Set([3]));

    // Moving a generated session is not allowed (end the series and create a new one instead).
    const move = await h.http
      .patch(`/v1/admin/classes/${before[0]!.id}`)
      .set(manager.auth)
      .send({ startsAt: inMinutes(60 * 24 * 3) });
    expect(move.body.message).toBe('errors.class.series_time_locked');

    const end = await h.http
      .patch(`/v1/admin/class-series/${s.body.data.id}`)
      .set(manager.auth)
      .send({ validUntil: before[0]!.startsAt.slice(0, 10) });
    expect(end.status).toBe(200);
    expect((await list()).length).toBe(1);
  });

  it('only managers edit the schedule; members never see rosters', async () => {
    const c = await createClass({ startsIn: 24 * 60 });
    const res = await h.http
      .post('/v1/admin/classes')
      .set(reception.auth)
      .send({ classTypeId: crossfitType, startsAt: inMinutes(60), durationMin: 60, capacity: 5 });
    expect(res.status).toBe(403);
    const m = await member('crossfit');
    expect((await h.http.get(`/v1/admin/classes/${c.id}/roster`).set(m.auth)).status).toBe(403);
    expect((await roster(c.id)).status).toBe(200);
  });
});

describe('personal training', () => {
  it('a member requests PT once at a time and never sees internal notes', async () => {
    const m = await member();
    const res = await h.http.post('/v1/me/pt-requests').set(m.auth).send({
      trainerId,
      goal: 'Snaga i tehnika čučnja',
      preferredTimes: 'radnim danima posle 18h',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'new', trainerName: 'Ana Trener' });
    const dup = await h.http.post('/v1/me/pt-requests').set(m.auth).send({ goal: 'Još jedan' });
    expect(dup.status).toBe(409);

    const upd = await h.http
      .patch(`/v1/admin/pt-requests/${res.body.data.id}`)
      .set(reception.auth)
      .send({ status: 'contacted', staffNote: 'Pozvati u utorak' });
    expect(upd.status).toBe(200);
    expect(upd.body.data).toMatchObject({ status: 'contacted', staffNote: 'Pozvati u utorak' });

    const mine = await h.http.get('/v1/me/pt-requests').set(m.auth);
    expect(mine.body.data[0].status).toBe('contacted');
    expect(JSON.stringify(mine.body.data)).not.toContain('Pozvati');

    const list = await h.http
      .get('/v1/admin/pt-requests')
      .set(reception.auth)
      .query({ status: 'contacted' });
    expect(list.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('held PT sessions consume the package; voiding gives the session back', async () => {
    const m = await member('pt');
    const ms = await h.http.get(`/v1/admin/members/${m.memberId}/memberships`).set(reception.auth);
    const membershipId = ms.body.data[0].id as string;
    const rec = () =>
      h.http
        .post(`/v1/admin/memberships/${membershipId}/pt-sessions`)
        .set(reception.auth)
        .send({ trainerId });
    expect((await rec()).status).toBe(201);
    const second = await rec();
    expect(second.body.data).toMatchObject({ visitLimit: 2, visitsUsed: 2 });
    const third = await rec();
    expect(third.status).toBe(422);
    expect(third.body.message).toBe('errors.pt.no_sessions_left');

    const voided = await h.http
      .post(`/v1/admin/pt-sessions/${second.body.data.sessions[0].id}/void`)
      .set(reception.auth)
      .send({ reason: 'Greškom upisano' });
    expect(voided.body.data.visitsUsed).toBe(1);

    // Only personal-training memberships have sessions.
    const other = await member('crossfit');
    const oms = await h.http
      .get(`/v1/admin/members/${other.memberId}/memberships`)
      .set(reception.auth);
    const bad = await h.http
      .post(`/v1/admin/memberships/${oms.body.data[0].id}/pt-sessions`)
      .set(reception.auth)
      .send({});
    expect(bad.body.message).toBe('errors.pt.not_pt_membership');
  });
});

describe('trainer photos', () => {
  // 1×1 PNG
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('stores a real image, exposes its public URL and serves it to other origins', async () => {
    const res = await h.http
      .put(`/v1/admin/trainers/${trainerId}/photo`)
      .set(manager.auth)
      .send({ image: png });
    expect(res.status).toBe(200);
    const url = res.body.data.photoUrl as string;
    expect(url).toMatch(/^http:\/\/localhost\/media\/trainers\/.+\.png$/);
    const pub = await h.http.get('/v1/public/trainers');
    expect(pub.body.data.find((t: { id: string }) => t.id === trainerId).photoUrl).toBe(url);
    const file = await h.http.get(url.replace('http://localhost', ''));
    expect(file.status).toBe(200);
    expect(file.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('rejects files that are not images, whatever they claim to be', async () => {
    const fake = `data:image/png;base64,${Buffer.from('<script>alert(1)</script> not an image').toString('base64')}`;
    const res = await h.http
      .put(`/v1/admin/trainers/${trainerId}/photo`)
      .set(manager.auth)
      .send({ image: fake });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].message).toBe('validation.invalid_image');
  });

  it('only trainer managers can change photos; removing works', async () => {
    const denied = await h.http
      .put(`/v1/admin/trainers/${trainerId}/photo`)
      .set(reception.auth)
      .send({ image: png });
    expect(denied.status).toBe(403);
    const del = await h.http.delete(`/v1/admin/trainers/${trainerId}/photo`).set(manager.auth);
    expect(del.body.data.photoUrl).toBeNull();
  });
});
