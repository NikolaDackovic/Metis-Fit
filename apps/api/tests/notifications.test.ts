import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runNotificationJobs } from '../src/modules/notifications/jobs';
import {
  renderNotification,
  type PushMessage,
  type PushSender,
} from '../src/modules/notifications/push';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let reception: TestUser;
let manager: TestUser;
let planId: string;

async function memberWithMembership(endInDays: number, payment?: number) {
  const m = await h.user({ member: true });
  const res = await h.http
    .post(`/v1/admin/members/${m.memberId}/memberships`)
    .set(reception.auth)
    .send({ planId, ...(payment && { payment: { amount: payment, method: 'cash' } }) });
  expect(res.status).toBe(201);
  await sql`update memberships set start_date = public.club_today() - (30 - ${endInDays})::int,
                                   end_date = public.club_today() + ${endInDays}::int
            where member_id = ${m.memberId}`.execute(h.db);
  return m;
}
const inbox = (m: TestUser) => h.http.get('/v1/me/notifications').set(m.auth);
/** A Tuesday at 03:00 in Belgrade: outside every coaching time window. */
const NEUTRAL = new Date('2030-01-08T02:00:00Z');
const kinds = async (m: TestUser) =>
  ((await inbox(m)).body.data.items as Array<{ kind: string; params: unknown }>).filter((n) =>
    ['weekly_report', 'training_nudge', 'measure_nudge'].includes(n.kind),
  );

beforeAll(async () => {
  h = await createHarness();
  reception = await h.user({ role: 'reception' });
  manager = await h.user({ role: 'manager', aal: 'aal2' });
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
  expect(plan.status).toBe(201);
  planId = plan.body.data.id;
});
afterAll(async () => h?.close());

describe('notifications', () => {
  it('membership reminders are created once, however often the job runs', async () => {
    const m = await memberWithMembership(7);
    const quiet = await memberWithMembership(10);
    await runNotificationJobs(h.db, null, NEUTRAL);
    await runNotificationJobs(h.db, null, NEUTRAL);
    const list = await inbox(m);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0]).toMatchObject({
      kind: 'membership_expiring',
      category: 'membership',
      params: { days: 7, plan: 'Mesečna' },
      link: '/membership',
      readAt: null,
    });
    expect(list.body.data.unread).toBe(1);
    expect((await inbox(quiet)).body.data.items).toHaveLength(0);

    const read = await h.http.post('/v1/me/notifications/read').set(m.auth).send({});
    expect(read.body.data.unread).toBe(0);
  });

  it('respects the member preferences', async () => {
    const m = await memberWithMembership(3);
    const prefs = await h.http
      .put('/v1/me/notification-preferences')
      .set(m.auth)
      .send({ membership: false });
    expect(prefs.body.data).toMatchObject({ membership: false, classes: true, pushEnabled: true });
    await runNotificationJobs(h.db, null, NEUTRAL);
    expect((await inbox(m)).body.data.items).toHaveLength(0);
  });

  it('pushes to registered devices in the member language and forgets dead tokens', async () => {
    const m = await memberWithMembership(1);
    await sql`update profiles set locale = 'en' where id = ${m.userId}`.execute(h.db);
    await h.http
      .post('/v1/me/push-tokens')
      .set(m.auth)
      .send({ token: 'ExponentPushToken[aaaaaaaaaaaa]', platform: 'android' })
      .expect(200);
    await h.http
      .post('/v1/me/push-tokens')
      .set(m.auth)
      .send({ token: 'ExponentPushToken[deaddeaddead]', platform: 'ios' })
      .expect(200);
    const sent: PushMessage[] = [];
    const sender: PushSender = {
      send: async (msgs) => {
        sent.push(...msgs);
        return msgs.map((x) => (x.to.includes('dead') ? 'unregistered' : 'ok'));
      },
    };
    const r = await runNotificationJobs(h.db, sender, NEUTRAL);
    expect(r.pushed).toBe(1);
    expect(sent).toHaveLength(2);
    expect(sent[0]!.title).not.toContain('{{');
    expect(sent[0]!.body).toContain('Monthly');
    const tokens = await h.db
      .selectFrom('push_tokens')
      .select('token')
      .where('user_id', '=', m.userId)
      .execute();
    expect(tokens.map((t) => t.token)).toEqual(['ExponentPushToken[aaaaaaaaaaaa]']);
    // Already pushed: a second run sends nothing.
    sent.length = 0;
    await runNotificationJobs(h.db, sender, NEUTRAL);
    expect(sent).toHaveLength(0);
  });

  it('renders every kind without leftover placeholders', () => {
    for (const kind of [
      'membership_expiring',
      'membership_expired',
      'class_reminder',
      'waitlist_promoted',
      'class_cancelled',
      'birthday',
      'weekly_report',
      'training_nudge',
      'measure_nudge',
    ]) {
      for (const locale of ['sr', 'en', 'ru', 'ar', 'de', 'zh']) {
        const r = renderNotification(
          kind,
          {
            days: 3,
            plan: 'X',
            class: 'CrossFit',
            startsAt: new Date().toISOString(),
            name: 'Ana',
            workouts: 3,
            visits: 2,
            minutes: 45,
          },
          locale,
        );
        expect(r.title.length, `${kind}/${locale}`).toBeGreaterThan(0);
        expect(`${r.title} ${r.body}`).not.toMatch(/\{\{|app\.notify/);
      }
    }
  });

  it('coaching: Monday-morning weekly report, only with something to report, once', async () => {
    const active = await memberWithMembership(20);
    const idle = await memberWithMembership(20);
    await sql`insert into workout_sessions (id, user_id, started_at, ended_at)
              values (gen_random_uuid(), ${active.userId}, '2030-01-09T17:00:00Z', '2030-01-09T18:00:00Z')`.execute(
      h.db,
    );
    await sql`insert into attendance_attempts (member_id, source, result, reason_code, occurred_at)
              values (${active.memberId}, 'qr', 'granted', 'OK', '2030-01-10T16:00:00Z')`.execute(
      h.db,
    );
    const mondayMorning = new Date('2030-01-14T08:00:00Z'); // 09:00 in Belgrade
    await runNotificationJobs(h.db, null, mondayMorning);
    await runNotificationJobs(h.db, null, mondayMorning);
    expect(await kinds(active)).toEqual([
      expect.objectContaining({
        kind: 'weekly_report',
        params: { workouts: 1, visits: 1, minutes: 0 },
      }),
    ]);
    expect(await kinds(idle)).toEqual([]);
    // Monday afternoon is outside the window.
    const late = await memberWithMembership(20);
    await sql`insert into attendance_attempts (member_id, source, result, reason_code, occurred_at)
              values (${late.memberId}, 'qr', 'granted', 'OK', '2030-01-10T16:00:00Z')`.execute(
      h.db,
    );
    await runNotificationJobs(h.db, null, new Date('2030-01-14T15:00:00Z'));
    expect(await kinds(late)).toEqual([]);
  });

  it('coaching: training nudge after 5 quiet days, once a week, and only if wanted', async () => {
    const quiet = await memberWithMembership(20);
    const busy = await memberWithMembership(20);
    const optedOut = await memberWithMembership(20);
    await sql`insert into workout_sessions (id, user_id, started_at)
              values (gen_random_uuid(), ${busy.userId}, '2030-01-15T17:00:00Z')`.execute(h.db);
    await h.http
      .put('/v1/me/notification-preferences')
      .set(optedOut.auth)
      .send({ coaching: false })
      .expect(200);
    const evening = new Date('2030-01-16T16:30:00Z'); // Wednesday 17:30 in Belgrade
    await runNotificationJobs(h.db, null, evening);
    await runNotificationJobs(h.db, null, new Date('2030-01-17T16:30:00Z')); // same week
    expect((await kinds(quiet)).map((n) => n.kind)).toEqual(['training_nudge']);
    expect(await kinds(busy)).toEqual([]);
    expect(await kinds(optedOut)).toEqual([]);
  });

  it('coaching: monthly measurement reminder on Saturday for members who measure', async () => {
    const old = await memberWithMembership(20);
    const fresh = await memberWithMembership(20);
    const never = await memberWithMembership(20);
    for (const [m, day] of [
      [old, '2029-11-01'],
      [fresh, '2030-01-10'],
    ] as const)
      await sql`insert into body_measurements (id, user_id, measured_on, weight_kg)
                values (gen_random_uuid(), ${m.userId}, ${day}, 80)`.execute(h.db);
    await runNotificationJobs(h.db, null, new Date('2030-01-19T09:00:00Z')); // Saturday 10:00
    expect((await kinds(old)).map((n) => n.kind)).toContain('measure_nudge');
    expect((await kinds(fresh)).map((n) => n.kind)).not.toContain('measure_nudge');
    expect((await kinds(never)).map((n) => n.kind)).not.toContain('measure_nudge');
  });

  it('announcements reach members with the app; only managers may send', async () => {
    const m = await h.user({ member: true });
    const denied = await h.http
      .post('/v1/admin/announcements')
      .set(reception.auth)
      .send({ title: 'Praznik', body: 'Klub ne radi 1. januara.', audience: 'all' });
    expect(denied.status).toBe(403);
    const sent = await h.http
      .post('/v1/admin/announcements')
      .set(manager.auth)
      .send({ title: 'Praznik', body: 'Klub ne radi 1. januara.', audience: 'all' });
    expect(sent.status).toBe(201);
    expect(sent.body.data.recipients).toBeGreaterThan(0);
    const got = (await inbox(m)).body.data.items;
    expect(got[0]).toMatchObject({ kind: 'announcement', params: { title: 'Praznik' } });
    const list = await h.http.get('/v1/admin/announcements').set(manager.auth);
    expect(list.body.data[0]).toMatchObject({ title: 'Praznik', audience: 'all' });
  });

  it('alert center lists ending memberships, debts, passive members, birthdays and sign-ups', async () => {
    const ending = await memberWithMembership(2);
    const debtor = await memberWithMembership(20, 100_000);
    const passive = await memberWithMembership(15, 550_000);
    await sql`update members set created_at = now() - interval '60 days' where id = ${passive.memberId}`.execute(
      h.db,
    );
    await sql`update members set date_of_birth = (public.club_today() - interval '30 years' + interval '2 days')::date
              where id = ${ending.memberId}`.execute(h.db);

    const res = await h.http.get('/v1/admin/alerts?locale=en').set(manager.auth);
    expect(res.status).toBe(200);
    const a = res.body.data;
    expect(a.settings).toEqual({ inactiveDays: 30, expiringDays: 7 });
    expect(
      a.expiring.find((x: { memberId: string }) => x.memberId === ending.memberId),
    ).toMatchObject({
      daysLeft: 2,
      planName: 'Monthly',
    });
    expect(a.debts.find((x: { memberId: string }) => x.memberId === debtor.memberId)).toMatchObject(
      {
        amount: 450_000,
        currency: 'RSD',
      },
    );
    expect(a.inactive.map((x: { memberId: string }) => x.memberId)).toContain(passive.memberId);
    expect(a.inactive.map((x: { memberId: string }) => x.memberId)).not.toContain(debtor.memberId);
    expect(
      a.birthdays.find((x: { memberId: string }) => x.memberId === ending.memberId),
    ).toMatchObject({
      inDays: 2,
      age: 30,
    });
    expect(a.signups.map((x: { memberId: string }) => x.memberId)).toContain(debtor.memberId);

    // The front desk sees the alerts too (it collects payments); members do not.
    const r = await h.http.get('/v1/admin/alerts').set(reception.auth);
    expect(r.status).toBe(200);
    expect(r.body.data.debts.length).toBeGreaterThan(0);
    expect((await h.http.get('/v1/admin/alerts').set(debtor.auth)).status).toBe(403);
  });
});
