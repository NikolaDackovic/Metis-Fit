import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tokenIssueLimiter, validateLimiter } from '../src/modules/access/access.routes';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let reception: TestUser;
let reception2: TestUser;
let manager: TestUser;
const plans: Record<string, string> = {};

async function createPlan(key: string, body: Record<string, unknown>) {
  const res = await h.http
    .post('/v1/admin/plans')
    .set(manager.auth)
    .send({ isAvailable: true, translations: { sr: { name: key } }, ...body });
  expect(res.status).toBe(201);
  plans[key] = res.body.data.id;
}

/** A linked member (app account) with an optional membership of the given plan. */
async function member(planKey?: string, payment?: number) {
  const m = await h.user({ member: true });
  if (planKey) {
    const res = await h.http
      .post(`/v1/admin/members/${m.memberId}/memberships`)
      .set(reception.auth)
      .send({
        planId: plans[planKey],
        ...(payment && { payment: { amount: payment, method: 'cash' } }),
      });
    expect(res.status).toBe(201);
  }
  return m;
}

const issue = (m: TestUser) => h.http.post('/v1/me/access-token').set(m.auth).send();
const scan = (token: string, who = reception, terminalId = 'reception-1') =>
  h.http.post('/v1/admin/access/validate').set(who.auth).send({ token, terminalId });

beforeAll(async () => {
  h = await createHarness();
  reception = await h.user({ role: 'reception' });
  reception2 = await h.user({ role: 'reception' });
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  await createPlan('monthly', {
    kind: 'unlimited',
    priceAmount: 550_000,
    durationDays: 30,
    visitLimit: null,
  });
  await createPlan('single', {
    kind: 'visit_pack',
    priceAmount: 80_000,
    durationDays: 30,
    visitLimit: 1,
  });
  await createPlan('pt', {
    kind: 'personal_training',
    priceAmount: 2_400_000,
    durationDays: 45,
    visitLimit: 8,
  });
  await createPlan('windowed', {
    kind: 'time_based',
    priceAmount: 300_000,
    durationDays: 30,
    visitLimit: null,
  });
});
afterAll(async () => h?.close());
beforeEach(() => {
  tokenIssueLimiter.reset();
  validateLimiter.reset();
});

describe('issuing QR tokens', () => {
  it('refuses a token when entry would be denied (no QR that only looks valid)', async () => {
    const m = await member();
    const res = await issue(m);
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('errors.access.no_active_membership');
  });

  it('issues a compact token with no personal data, valid for 60 s', async () => {
    const m = await member('monthly');
    const res = await issue(m);
    expect(res.status).toBe(200);
    const { token, expiresAt, refreshInSec } = res.body.data;
    expect(token).toMatch(/^g1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/);
    expect(token).not.toContain(m.memberId);
    expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan(50_000);
    expect(Date.parse(expiresAt) - Date.now()).toBeLessThanOrEqual(60_000);
    expect(refreshInSec).toBe(45);
  });

  it('refuses users without a linked member profile', async () => {
    const lonely = await h.user();
    expect((await issue(lonely)).body.message).toBe('errors.access.not_linked');
  });

  it('offline pass: valid for hours, works once, a new one revokes the old one', async () => {
    const m = await member('monthly');
    const offline = () => h.http.post('/v1/me/access-token/offline').set(m.auth).send();
    const first = await offline();
    expect(first.status).toBe(200);
    const hours = (Date.parse(first.body.data.expiresAt) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(11);
    expect(hours).toBeLessThanOrEqual(12);

    const second = (await offline()).body.data.token as string;
    // The first spare code was replaced: scanning it fails, the new one passes exactly once.
    expect((await scan(first.body.data.token)).body.data.result).toBe('denied');
    expect((await scan(second)).body.data).toMatchObject({ result: 'granted' });
    expect((await scan(second, reception2, 'reception-2')).body.data).toMatchObject({
      result: 'denied',
      reasonCode: 'TOKEN_REUSED',
    });
    // Live 60 s tokens are independent of the offline pass.
    expect((await issue(m)).status).toBe(200);
    expect(
      (
        await h.http
          .post('/v1/me/access-token/offline')
          .set((await member()).auth)
          .send()
      ).status,
    ).toBe(422);
  });

  it('rate-limits token requests', async () => {
    const m = await member('monthly');
    for (let i = 0; i < 10; i++) expect((await issue(m)).status).toBe(200);
    expect((await issue(m)).status).toBe(429);
  });
});

describe('validating QR tokens (docs/SECURITY.md §5)', () => {
  it('a valid token passes once and the attempt is recorded', async () => {
    const m = await member('monthly');
    const { token } = (await issue(m)).body.data;
    const res = await scan(token);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      result: 'granted',
      reasonCode: 'OK',
      member: { id: m.memberId },
      membership: { planName: 'monthly', displayStatus: 'active' },
    });
    const attempts = await h.db
      .selectFrom('attendance_attempts')
      .selectAll()
      .where('member_id', '=', m.memberId!)
      .execute();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      source: 'qr',
      result: 'granted',
      performed_by: reception.userId,
    });
  });

  it('a reused token is rejected (and recorded)', async () => {
    const m = await member('monthly');
    const { token } = (await issue(m)).body.data;
    await scan(token);
    const second = await scan(token, reception2);
    expect(second.body.data).toMatchObject({
      result: 'denied',
      reasonCode: 'TOKEN_REUSED',
      member: { id: m.memberId },
    });
  });

  it('a scanner double-read at the same desk returns the first result without a second entry', async () => {
    const m = await member('monthly');
    const { token } = (await issue(m)).body.data;
    const first = await scan(token);
    const again = await scan(token);
    expect(again.body.data).toMatchObject({
      result: 'granted',
      attemptId: first.body.data.attemptId,
    });
    const n = await h.db
      .selectFrom('attendance_attempts')
      .select('id')
      .where('member_id', '=', m.memberId!)
      .execute();
    expect(n).toHaveLength(1);
  });

  it('an expired token is rejected', async () => {
    const m = await member('monthly');
    const { token } = (await issue(m)).body.data;
    await sql`update access_tokens set issued_at = now() - interval '2 minutes', expires_at = now() - interval '1 second'
              where member_id = ${m.memberId}`.execute(h.db);
    expect((await scan(token)).body.data.reasonCode).toBe('TOKEN_EXPIRED');
  });

  it('a tampered or garbage token is rejected and recorded without a member', async () => {
    const m = await member('monthly');
    const { token } = (await issue(m)).body.data as { token: string };
    const tampered = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA');
    const a = await scan(tampered);
    expect(a.body.data).toMatchObject({
      result: 'denied',
      reasonCode: 'TOKEN_INVALID',
      member: null,
    });
    expect((await scan('not-a-token')).body.data.reasonCode).toBe('TOKEN_INVALID');
    const invalid = await h.db
      .selectFrom('attendance_attempts')
      .select('id')
      .where('reason_code', '=', 'TOKEN_INVALID')
      .execute();
    expect(invalid.length).toBeGreaterThanOrEqual(2);
  });

  it('a token issued before the membership ended is denied after it ends', async () => {
    const m = await member('monthly');
    const { token } = (await issue(m)).body.data;
    await sql`update memberships set state = 'cancelled', cancelled_reason = 'test' where member_id = ${m.memberId}`.execute(
      h.db,
    );
    expect((await scan(token)).body.data).toMatchObject({
      result: 'denied',
      reasonCode: 'NO_ACTIVE_MEMBERSHIP',
    });
  });

  it('two parallel scans of one token by different desks: exactly one is granted', async () => {
    const m = await member('monthly');
    const { token } = (await issue(m)).body.data;
    const [a, b] = await Promise.all([
      scan(token, reception, 'desk-a'),
      scan(token, reception2, 'desk-b'),
    ]);
    const results = [a.body.data.reasonCode, b.body.data.reasonCode].sort();
    expect(results).toEqual(['OK', 'TOKEN_REUSED']);
    const granted = await h.db
      .selectFrom('attendance_attempts')
      .select('id')
      .where('member_id', '=', m.memberId!)
      .where('result', '=', 'granted')
      .execute();
    expect(granted).toHaveLength(1);
  });

  it('only staff with attendance.checkin can validate', async () => {
    const m = await member('monthly');
    const { token } = (await issue(m)).body.data;
    expect((await scan(token, m)).status).toBe(403);
  });
});

describe('entry rules', () => {
  const manual = (memberId: string, who = reception) =>
    h.http
      .post('/v1/admin/access/manual')
      .set(who.auth)
      .send({ memberId, terminalId: 'reception-1' });

  it('a visit pack consumes one visit; same-day re-entry is free; exhausted packs are denied', async () => {
    const m = await member('single');
    const first = await manual(m.memberId!);
    expect(first.body.data).toMatchObject({
      result: 'granted',
      consumedVisit: true,
      membership: { visitsRemaining: 0 },
    });
    const reentry = await manual(m.memberId!);
    expect(reentry.body.data).toMatchObject({ result: 'granted', consumedVisit: false });

    const other = await member('single');
    await sql`update memberships set visits_used = 1 where member_id = ${other.memberId}`.execute(
      h.db,
    );
    expect((await manual(other.memberId!)).body.data.reasonCode).toBe('NO_VISITS_LEFT');
  });

  it('personal-training packs admit the member without consuming a session', async () => {
    const m = await member('pt');
    const res = await manual(m.memberId!);
    expect(res.body.data).toMatchObject({ result: 'granted', consumedVisit: false });
  });

  it('time-window plans deny entry outside their hours', async () => {
    const { isodow } = await sql<{ isodow: number }>`
      select extract(isodow from now() at time zone 'Europe/Belgrade')::int as isodow`
      .execute(h.db)
      .then((r) => r.rows[0]!);
    await h.db
      .insertInto('membership_plan_time_windows')
      .values({
        plan_id: plans.windowed!,
        weekday: (isodow % 7) + 1,
        starts_at: '06:00',
        ends_at: '14:00',
      })
      .execute();
    const m = await member('windowed');
    expect((await manual(m.memberId!)).body.data.reasonCode).toBe('OUTSIDE_TIME_WINDOW');
  });

  it('deactivated members are denied', async () => {
    const m = await member('monthly');
    await h.http
      .post(`/v1/admin/members/${m.memberId}/deactivate`)
      .set(manager.auth)
      .send({ reason: 'test' });
    expect((await manual(m.memberId!)).body.data.reasonCode).toBe('MEMBER_DEACTIVATED');
  });

  it('debt does not block entry but warns reception', async () => {
    const m = await member('monthly', 200_000);
    const res = await manual(m.memberId!);
    expect(res.body.data.result).toBe('granted');
    expect(res.body.data.warnings).toEqual([{ code: 'DEBT', amount: 350_000, currency: 'RSD' }]);
  });
});

describe('override', () => {
  it('requires a reason, is audited and never consumes a visit', async () => {
    const m = await member();
    const short = await h.http
      .post('/v1/admin/access/override')
      .set(reception.auth)
      .send({ memberId: m.memberId, reason: 'ok' });
    expect(short.status).toBe(400);

    const res = await h.http
      .post('/v1/admin/access/override')
      .set(reception.auth)
      .send({ memberId: m.memberId, reason: 'Zaboravio telefon, plaća sutra' });
    expect(res.body.data).toMatchObject({
      result: 'granted',
      reasonCode: 'OVERRIDE',
      consumedVisit: false,
    });
    const audit = await h.db
      .selectFrom('audit_logs')
      .select(['action', 'diff'])
      .where('entity_id', '=', m.memberId!)
      .where('action', '=', 'attendance.override')
      .executeTakeFirstOrThrow();
    expect(audit.diff).toMatchObject({ after: { wouldHaveBeen: 'NO_ACTIVE_MEMBERSHIP' } });
  });

  it('is not available to trainers', async () => {
    const trainer = await h.user({ role: 'trainer' });
    const m = await member('monthly');
    const res = await h.http
      .post('/v1/admin/access/override')
      .set(trainer.auth)
      .send({ memberId: m.memberId, reason: 'pokušaj trenera' });
    expect(res.status).toBe(403);
  });
});

describe('attendance reporting', () => {
  it('lists attempts for staff and only granted visits for the member', async () => {
    const m = await member('monthly');
    const { token } = (await issue(m)).body.data;
    await scan(token);
    await scan(token, reception2); // reused → denied

    const list = await h.http
      .get('/v1/admin/attendance')
      .query({ pageSize: 100 })
      .set(manager.auth);
    const mine = list.body.data.filter((a: { memberId: string }) => a.memberId === m.memberId);
    expect(mine.map((a: { result: string }) => a.result).sort()).toEqual(['denied', 'granted']);

    const visits = await h.http.get('/v1/me/visits').set(m.auth);
    expect(visits.body.data).toHaveLength(1);

    const dash = await h.http
      .get('/v1/admin/reports/dashboard')
      .query({
        from: new Date().toISOString().slice(0, 10),
        to: new Date().toISOString().slice(0, 10),
      })
      .set(manager.auth);
    expect(dash.body.data.checkinsToday).toBeGreaterThan(0);
  });
});
