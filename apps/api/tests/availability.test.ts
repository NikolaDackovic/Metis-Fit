import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runNotificationJobs } from '../src/modules/notifications/jobs';
import { createHarness, type Harness, type TestUser } from './harness';

/** F14-4: trainers publish when they take personal sessions; members book a free slot. */
let h: Harness;
let coach: TestUser;
let trainerId: string;
let ana: TestUser;
let bob: TestUser;

const allWeek = (startsAt: string, endsAt: string) =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startsAt, endsAt }));
const slots = (u: TestUser) =>
  h.http
    .get(`/v1/me/trainers/${trainerId}/slots`)
    .set(u.auth)
    .then((r) => r.body.data.slots as string[]);

beforeAll(async () => {
  h = await createHarness();
  coach = await h.user({ role: 'trainer' });
  trainerId = (
    await h.db
      .insertInto('trainers')
      .values({ first_name: 'Ana', last_name: 'Trener', user_id: coach.userId })
      .returning('id')
      .executeTakeFirstOrThrow()
  ).id;
  ana = await h.user({ member: true });
  bob = await h.user({ member: true });
});
afterAll(async () => h?.close());

describe('trainer free slots (F14-4)', () => {
  it('no windows, no slots; the trainer sets them and members see hourly slots, each once', async () => {
    expect(await slots(ana)).toEqual([]);
    const set = await h.http
      .put('/v1/admin/my-availability')
      .set(coach.auth)
      .send({ slotMinutes: 60, rules: allWeek('00:00', '23:59') });
    expect(set.status).toBe(200);
    const mine = await h.http.get('/v1/admin/my-availability').set(coach.auth);
    expect(mine.body.data.rules).toHaveLength(7);
    const s = await slots(ana);
    expect(s.length).toBeGreaterThan(100);
    expect(Date.parse(s[0]!)).toBeGreaterThan(Date.now() + 2 * 3600_000 - 60_000);
    // Hourly slots (the gap can be longer only across midnight, where the last slot does not fit).
    const gaps = s.slice(1).map((x, i) => Date.parse(x) - Date.parse(s[i]!));
    expect(Math.min(...gaps)).toBe(3600_000);
    expect(gaps.filter((g) => g === 3600_000).length).toBeGreaterThan(gaps.length / 2);
    expect(new Set(s).size).toBe(s.length);
  });

  it('a member books a slot once; it is gone for everyone and the trainer is told', async () => {
    const s = await slots(ana);
    const pick = s.find((x) => Date.parse(x) > Date.now() + 8 * 3600_000)!;
    const r = await h.http
      .post(`/v1/me/trainers/${trainerId}/book`)
      .set(ana.auth)
      .send({ startsAt: pick });
    expect(r.status).toBe(201);
    const again = await h.http
      .post(`/v1/me/trainers/${trainerId}/book`)
      .set(bob.auth)
      .send({ startsAt: pick });
    expect(again.body.message).toBe('errors.slot.taken');
    expect(await slots(bob)).not.toContain(pick);
    const inbox = await h.http.get('/v1/me/notifications').set(coach.auth);
    expect(inbox.body.data.items.map((n: { kind: string }) => n.kind)).toContain('pt_booked');
    // The trainer sees it in their schedule.
    const appt = await h.db
      .selectFrom('trainer_appointments')
      .select(['kind', 'status', 'member_id'])
      .where('id', '=', r.body.data.id)
      .executeTakeFirstOrThrow();
    expect(appt).toEqual({ kind: 'pt', status: 'scheduled', member_id: ana.memberId });

    // Cancelling in time frees the slot again.
    expect(
      (await h.http.post(`/v1/me/appointments/${r.body.data.id}/cancel`).set(ana.auth)).status,
    ).toBe(200);
    expect(await slots(bob)).toContain(pick);
  });

  it('a class the trainer leads blocks the slot; late cancelling is refused', async () => {
    const s = await slots(ana);
    const pick = s.find((x) => Date.parse(x) > Date.now() + 8 * 3600_000)!;
    await sql`insert into class_types (key, zone_id) values ('pt_block_test', (select id from zones limit 1))
     `.execute(h.db);
    await sql`
      insert into classes (class_type_id, trainer_id, starts_at, ends_at, capacity)
      values ((select id from class_types where key = 'pt_block_test'), ${trainerId}, ${pick}::timestamptz,
              ${pick}::timestamptz + interval '1 hour', 10)`.execute(h.db);
    expect(await slots(ana)).not.toContain(pick);

    const soon = await sql<{ id: string }>`
      insert into trainer_appointments (trainer_id, member_id, kind, starts_at, ends_at)
      values (${trainerId}, ${ana.memberId}, 'pt', now() + interval '3 hours', now() + interval '4 hours')
      returning id`
      .execute(h.db)
      .then((r) => r.rows[0]!.id);
    expect(
      (await h.http.post(`/v1/me/appointments/${soon}/cancel`).set(ana.auth)).body.message,
    ).toBe('errors.slot.late');
  });

  it('only real free slots can be booked', async () => {
    const odd = new Date(Date.now() + 26 * 3600_000 + 17 * 60_000).toISOString();
    expect(
      (await h.http.post(`/v1/me/trainers/${trainerId}/book`).set(bob.auth).send({ startsAt: odd }))
        .body.message,
    ).toBe('errors.slot.taken');
  });
  it('a member can hold at most 4 upcoming sessions', async () => {
    const free = (await slots(bob)).filter((x) => Date.parse(x) > Date.now() + 30 * 3600_000);
    for (const startsAt of free.slice(0, 4))
      expect(
        (await h.http.post(`/v1/me/trainers/${trainerId}/book`).set(bob.auth).send({ startsAt }))
          .body.message,
      ).toBeNull();
    const fifth = await h.http
      .post(`/v1/me/trainers/${trainerId}/book`)
      .set(bob.auth)
      .send({ startsAt: free[5] });
    expect(fifth.body.message).toBe('errors.slot.limit');
  });
  it('a manager sets the hours for a trainer; members and the trainer see them', async () => {
    const manager = await h.user({ role: 'manager', aal: 'aal2' });
    const rules = [{ weekday: 2, startsAt: '09:00', endsAt: '11:00' }];
    const put = await h.http
      .put(`/v1/admin/trainers/${trainerId}/availability`)
      .set(manager.auth)
      .send({ slotMinutes: 30, rules });
    expect(put.status).toBe(200);
    const mine = await h.http.get('/v1/admin/my-availability').set(coach.auth);
    expect(mine.body.data).toEqual({ slotMinutes: 30, rules });
    // A member cannot change a trainer's hours.
    expect(
      (
        await h.http
          .put(`/v1/admin/trainers/${trainerId}/availability`)
          .set(ana.auth)
          .send({ slotMinutes: 30, rules })
      ).status,
    ).toBe(403);
  });
  it('reminds the member a day before (if booked earlier) and an hour before', async () => {
    const add = (startsIn: string, createdAgo: string) =>
      sql<{ id: string }>`
        insert into trainer_appointments (trainer_id, member_id, kind, starts_at, ends_at, created_at)
        values (${trainerId}, ${ana.memberId}, 'pt', now() + ${startsIn}::interval,
                now() + ${startsIn}::interval + interval '30 minutes', now() - ${createdAgo}::interval)
        returning id`
        .execute(h.db)
        .then((r) => r.rows[0]!.id);
    const early = await add('20 hours', '2 days');
    const late = await add('21 hours', '1 hour');
    const soon = await add('40 minutes', '2 days');
    await runNotificationJobs(h.db, null);
    await runNotificationJobs(h.db, null);
    const keys = await h.db
      .selectFrom('notifications')
      .select(['dedupe_key', 'kind', 'params'])
      .where('user_id', '=', ana.userId)
      .where('kind', '=', 'pt_reminder')
      .execute();
    expect(keys.map((k) => k.dedupe_key).sort()).toEqual(
      [`pt:day:${early}`, `pt:hour:${soon}`].sort(),
    );
    expect(keys.some((k) => k.dedupe_key?.endsWith(late))).toBe(false);
    expect((keys[0]!.params as { trainer: string }).trainer).toBe('Ana Trener');
  });
  it('the trainer gets a morning overview of the day, once, only in the morning', async () => {
    // A session at 10:00 Belgrade, 5 days from now (a day nothing else is on).
    const day = await sql<{ d: string; morning: Date; noon: Date }>`
      select to_char(public.club_today() + 5, 'YYYY-MM-DD') d,
             ((public.club_today() + 5) + time '07:30') at time zone 'Europe/Belgrade' morning,
             ((public.club_today() + 5) + time '12:00') at time zone 'Europe/Belgrade' noon`
      .execute(h.db)
      .then((r) => r.rows[0]!);
    await sql`
      delete from trainer_appointments
      where trainer_id = ${trainerId} and (starts_at at time zone 'Europe/Belgrade')::date = ${day.d}::date`.execute(
      h.db,
    );
    await sql`
      insert into trainer_appointments (trainer_id, member_id, kind, starts_at, ends_at)
      values (${trainerId}, ${ana.memberId}, 'pt',
              (${day.d}::date + time '10:00') at time zone 'Europe/Belgrade',
              (${day.d}::date + time '11:00') at time zone 'Europe/Belgrade')`.execute(h.db);
    const mine = () =>
      h.db
        .selectFrom('notifications')
        .select(['params', 'dedupe_key'])
        .where('user_id', '=', coach.userId)
        .where('kind', '=', 'trainer_day')
        .execute();
    await runNotificationJobs(h.db, null, new Date(day.noon));
    expect(await mine()).toHaveLength(0);
    await runNotificationJobs(h.db, null, new Date(day.morning));
    await runNotificationJobs(h.db, null, new Date(day.morning));
    const got = await mine();
    expect(got).toHaveLength(1);
    expect(got[0]!.params).toMatchObject({ classes: 0, sessions: 1 });
  });
});
