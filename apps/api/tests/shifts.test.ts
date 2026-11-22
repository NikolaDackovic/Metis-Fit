import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PayrollDto, ShiftWeekDto } from '@grit/validation';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let manager: TestUser;
let reception: TestUser;
let trainer: TestUser;
let first: string;
let second: string;
const MONDAY = '2030-01-07';

beforeAll(async () => {
  h = await createHarness();
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
  trainer = await h.user({ role: 'trainer' });
});
afterAll(async () => h?.close());

const week = async (u: TestUser, path = '/v1/admin/shifts/week') =>
  (await h.http.get(path).query({ start: '2030-01-09' }).set(u.auth)).body.data as ShiftWeekDto;

describe('shift schedule', () => {
  it('the club defines its own shifts; reception cannot', async () => {
    const mk = (name: string, startsAt: string, endsAt: string, color: string) =>
      h.http
        .post('/v1/admin/shifts/types')
        .set(manager.auth)
        .send({ name, startsAt, endsAt, color });
    const a = await mk('Prva', '07:00', '15:00', '#2E7D32');
    const b = await mk('Druga', '15:00', '23:00', '#1565C0');
    expect(a.status).toBe(201);
    first = a.body.data.id;
    second = b.body.data.id;
    expect(
      (
        await h.http
          .post('/v1/admin/shifts/types')
          .set(reception.auth)
          .send({ name: 'X', startsAt: '08:00', endsAt: '09:00', color: '#000000' })
      ).status,
    ).toBe(403);
  });

  it('"Mon-Wed first, Thu-Sat second" in one save builds the weekly table', async () => {
    const people = (await h.http.get('/v1/admin/shifts/people').set(manager.auth)).body.data;
    expect(people.map((p: { userId: string }) => p.userId)).toContain(trainer.userId);

    const res = await h.http
      .post('/v1/admin/shifts/rules')
      .set(manager.auth)
      .send({
        userId: trainer.userId,
        validFrom: MONDAY,
        lines: [
          { shiftTypeId: first, weekdays: [1, 2, 3] },
          { shiftTypeId: second, weekdays: [4, 5, 6] },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(2);

    const w = await week(manager);
    expect(w.monday).toBe(MONDAY);
    const mine = w.assignments.filter((a) => a.userId === trainer.userId);
    expect(mine.filter((a) => a.shiftTypeId === first).map((a) => a.date)).toEqual([
      '2030-01-07',
      '2030-01-08',
      '2030-01-09',
    ]);
    expect(mine.filter((a) => a.shiftTypeId === second).map((a) => a.date)).toEqual([
      '2030-01-10',
      '2030-01-11',
      '2030-01-12',
    ]);
    expect(mine.some((a) => a.date === '2030-01-13')).toBe(false); // Sunday off

    // The same weekday twice in one save is a mistake.
    const twice = await h.http
      .post('/v1/admin/shifts/rules')
      .set(manager.auth)
      .send({
        userId: trainer.userId,
        validFrom: MONDAY,
        lines: [
          { shiftTypeId: first, weekdays: [1] },
          { shiftTypeId: second, weekdays: [1] },
        ],
      });
    expect(twice.status).toBe(400);
  });

  it('absences and closed days take people off the table', async () => {
    expect(
      (
        await h.http.post('/v1/admin/shifts/absences').set(manager.auth).send({
          userId: trainer.userId,
          kind: 'sick',
          startsOn: '2030-01-08',
          endsOn: '2030-01-08',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await h.http
          .post('/v1/admin/shifts/closures')
          .set(manager.auth)
          .send({ day: '2030-01-10', name: 'Slava' })
      ).status,
    ).toBe(201);

    const w = await week(manager);
    const days = w.assignments.filter((a) => a.userId === trainer.userId).map((a) => a.date);
    expect(days).not.toContain('2030-01-08'); // sick
    expect(days).not.toContain('2030-01-10'); // closed
    expect(w.absences).toContainEqual(
      expect.objectContaining({ date: '2030-01-08', userId: trainer.userId, kind: 'sick' }),
    );
    expect(w.days[3]!.closure).toEqual({ name: 'Slava', isClosed: true });
  });

  it('a trainer sees only their own shifts, not the whole table', async () => {
    expect((await h.http.get('/v1/admin/shifts/week').set(trainer.auth)).status).toBe(403);
    const mine = await week(trainer, '/v1/admin/my-shifts');
    expect(mine.assignments.every((a) => a.userId === trainer.userId)).toBe(true);
    expect(mine.assignments.length).toBe(4); // 6 days - sick day - closed day
    expect((await h.http.get('/v1/admin/shifts/week').set(reception.auth)).status).toBe(200);
  });
});

describe('time clock and payout', () => {
  it('clock in and out once at a time', async () => {
    const inn = await h.http.post('/v1/admin/timeclock/in').set(trainer.auth).send();
    expect(inn.status).toBe(200);
    expect(inn.body.data.open).not.toBeNull();
    expect((await h.http.post('/v1/admin/timeclock/in').set(trainer.auth).send()).status).toBe(409);
    const out = await h.http.post('/v1/admin/timeclock/out').set(trainer.auth).send();
    expect(out.body.data.open).toBeNull();
    expect((await h.http.post('/v1/admin/timeclock/out').set(trainer.auth).send()).status).toBe(
      409,
    );
  });

  it('hours x hourly rate = monthly payout; only managers see it', async () => {
    await h.http
      .put(`/v1/admin/payroll/rates/${trainer.userId}`)
      .set(manager.auth)
      .send({ hourlyRateMinor: 60_000 }); // 600 RSD / h
    const add = (clockIn: string, clockOut: string) =>
      h.http
        .post('/v1/admin/payroll/entries')
        .set(manager.auth)
        .send({ userId: trainer.userId, clockIn, clockOut, note: 'test' });
    expect((await add('2030-01-07T07:00:00+01:00', '2030-01-07T15:00:00+01:00')).status).toBe(201);
    expect((await add('2030-01-09T07:00:00+01:00', '2030-01-09T11:30:00+01:00')).status).toBe(201);

    const p = (await h.http.get('/v1/admin/payroll').query({ month: '2030-01' }).set(manager.auth))
      .body.data as PayrollDto;
    const row = p.rows.find((r) => r.userId === trainer.userId)!;
    expect(row).toMatchObject({ days: 2, minutes: 750, hourlyRateMinor: 60_000 });
    expect(row.payoutMinor).toBe(750_000); // 12.5 h x 600 RSD = 7.500 RSD

    expect(
      (await h.http.get('/v1/admin/payroll').query({ month: '2030-01' }).set(trainer.auth)).status,
    ).toBe(403);
    const bad = await add('2030-01-10T15:00:00+01:00', '2030-01-10T07:00:00+01:00');
    expect(bad.status).toBe(400);
  });
});
