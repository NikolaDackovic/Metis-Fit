import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

/** F13-2: membership pause ("freeze"), docs/BUSINESS_RULES.md §2.4. */
let h: Harness;
let manager: TestUser;
let reception: TestUser;
let pausable: string;
let noPause: string;
let today: string;

const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const plan = (name: string, maxPauses: number, maxPauseDays: number) =>
  h.http
    .post('/v1/admin/plans')
    .set(manager.auth)
    .send({
      isAvailable: true,
      translations: { sr: { name } },
      kind: 'unlimited',
      priceAmount: 300_000,
      durationDays: 30,
      visitLimit: null,
      maxPauses,
      maxPauseDays,
    })
    .then((r) => r.body.data.id as string);

/** A member with a paid, active membership of `planId` starting today. */
async function memberWith(planId: string) {
  const m = await h.user({ member: true });
  const r = await h.http
    .post(`/v1/admin/members/${m.memberId}/memberships`)
    .set(reception.auth)
    .send({ planId, payment: { amount: 300_000, method: 'cash' } });
  expect(r.status).toBe(201);
  return {
    user: m,
    membershipId: r.body.data.id as string,
    endDate: r.body.data.endDate as string,
  };
}
const endOf = (id: string) =>
  h.db
    .selectFrom('memberships')
    .select(sql<string>`end_date::text`.as('d'))
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
    .then((r) => r.d);
const ask = (u: TestUser, body: Record<string, unknown>) =>
  h.http.post('/v1/me/pauses').set(u.auth).send(body);

beforeAll(async () => {
  h = await createHarness();
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
  pausable = await plan('Mesečna sa pauzom', 2, 14);
  noPause = await plan('Mesečna bez pauze', 0, 0);
  today = await sql<{ d: string }>`select public.club_today()::text as d`
    .execute(h.db)
    .then((r) => r.rows[0]!.d);
});
afterAll(async () => h?.close());

describe('membership pause (F13-2)', () => {
  it('member asks, the desk approves: the end date moves and the member is told', async () => {
    const { user, membershipId, endDate } = await memberWith(pausable);
    const mine = await h.http.get('/v1/me/pauses').set(user.auth);
    expect(mine.body.data.allowance).toEqual([
      expect.objectContaining({
        membershipId,
        maxPauses: 2,
        maxDays: 14,
        usedPauses: 0,
        usedDays: 0,
      }),
    ]);

    const from = addDays(today, 1);
    const to = addDays(today, 7);
    const r = await ask(user, { membershipId, startsOn: from, endsOn: to, reason: 'Putovanje' });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ status: 'requested', days: 7 });

    // The desk sees it among the alerts.
    const alerts = await h.http.get('/v1/admin/alerts').set(manager.auth);
    expect(alerts.body.data.pauseRequests.map((p: { pauseId: string }) => p.pauseId)).toContain(
      r.body.data.id,
    );

    const ok = await h.http
      .post(`/v1/admin/pauses/${r.body.data.id}/approve`)
      .set(reception.auth)
      .send({});
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('approved');
    expect(await endOf(membershipId)).toBe(addDays(endDate, 7));

    const inbox = await h.http.get('/v1/me/notifications').set(user.auth);
    expect(inbox.body.data.items.map((n: { kind: string }) => n.kind)).toContain('pause_approved');
  });

  it('refuses overlap, a start in the past, too many days and too many pauses', async () => {
    const { user, membershipId } = await memberWith(pausable);
    const first = await ask(user, {
      membershipId,
      startsOn: addDays(today, 2),
      endsOn: addDays(today, 5),
    });
    expect(first.status).toBe(201);
    const msg = async (b: Record<string, unknown>) => (await ask(user, b)).body.message;
    expect(
      await msg({ membershipId, startsOn: addDays(today, 4), endsOn: addDays(today, 6) }),
    ).toBe('errors.pause.overlap');
    expect(await msg({ membershipId, startsOn: addDays(today, -1), endsOn: today })).toBe(
      'errors.pause.past_start',
    );
    // 4 days used, 14 allowed: 11 more is too many.
    expect(
      await msg({ membershipId, startsOn: addDays(today, 10), endsOn: addDays(today, 20) }),
    ).toBe('errors.pause.limit_days');
    expect(
      (await ask(user, { membershipId, startsOn: addDays(today, 10), endsOn: addDays(today, 12) }))
        .status,
    ).toBe(201);
    expect(
      await msg({ membershipId, startsOn: addDays(today, 14), endsOn: addDays(today, 14) }),
    ).toBe('errors.pause.limit_count');
  });

  it('a plan without pauses cannot be paused; another member cannot touch my membership', async () => {
    const a = await memberWith(noPause);
    expect(
      (
        await ask(a.user, {
          membershipId: a.membershipId,
          startsOn: addDays(today, 1),
          endsOn: addDays(today, 2),
        })
      ).body.message,
    ).toBe('errors.pause.not_allowed');
    const b = await memberWith(pausable);
    expect(
      (
        await ask(a.user, {
          membershipId: b.membershipId,
          startsOn: addDays(today, 1),
          endsOn: addDays(today, 2),
        })
      ).status,
    ).toBe(404);
  });

  it('a running pause closes the entry; ending it gives the unused days back', async () => {
    const { user, membershipId, endDate } = await memberWith(pausable);
    const p = await h.http
      .post(`/v1/admin/memberships/${membershipId}/pauses`)
      .set(manager.auth)
      .send({ startsOn: today, endsOn: addDays(today, 4), reason: 'Bolest' });
    expect(p.status).toBe(201);
    expect(await endOf(membershipId)).toBe(addDays(endDate, 5));
    const ms = await h.http.get('/v1/me/memberships').set(user.auth);
    expect(ms.body.data[0].displayStatus).toBe('paused');

    const entry = await h.http
      .post('/v1/admin/access/manual')
      .set(reception.auth)
      .send({ memberId: user.memberId, terminalId: 'reception-1' });
    expect(entry.body.data).toMatchObject({ result: 'denied', reasonCode: 'MEMBERSHIP_PAUSED' });

    // Back on the first day: the whole pause is cancelled and the end date restored.
    const end = await h.http.post(`/v1/admin/pauses/${p.body.data.id}/end`).set(manager.auth);
    expect(end.body.data.status).toBe('cancelled');
    expect(await endOf(membershipId)).toBe(endDate);
    const again = await h.http
      .post('/v1/admin/access/manual')
      .set(reception.auth)
      .send({ memberId: user.memberId, terminalId: 'reception-1' });
    expect(again.body.data.result).toBe('granted');
  });

  it('member withdraws a waiting request but not an approved one; rejection is told', async () => {
    const { user, membershipId } = await memberWith(pausable);
    const r1 = await ask(user, {
      membershipId,
      startsOn: addDays(today, 1),
      endsOn: addDays(today, 2),
    });
    const c = await h.http.post(`/v1/me/pauses/${r1.body.data.id}/cancel`).set(user.auth);
    expect(c.body.data.status).toBe('cancelled');

    const r2 = await ask(user, {
      membershipId,
      startsOn: addDays(today, 3),
      endsOn: addDays(today, 4),
    });
    const rej = await h.http
      .post(`/v1/admin/pauses/${r2.body.data.id}/reject`)
      .set(manager.auth)
      .send({ note: 'Pauza je moguća samo uz potvrdu lekara.' });
    expect(rej.body.data).toMatchObject({ status: 'rejected' });
    expect(
      (await h.http.post(`/v1/me/pauses/${r2.body.data.id}/cancel`).set(user.auth)).body.message,
    ).toBe('errors.pause.not_requested');
    const inbox = await h.http.get('/v1/me/notifications').set(user.auth);
    expect(inbox.body.data.items.map((n: { kind: string }) => n.kind)).toContain('pause_rejected');
  });

  it('a renewal paid in advance cannot be paused before it starts', async () => {
    const { user } = await memberWith(pausable);
    const next = await h.http
      .post(`/v1/admin/members/${user.memberId}/memberships`)
      .set(reception.auth)
      .send({ planId: pausable, payment: { amount: 300_000, method: 'cash' } });
    expect(next.status).toBe(201);
    expect(next.body.data.startDate > today).toBe(true);
    const mine = await h.http.get('/v1/me/pauses').set(user.auth);
    expect(
      mine.body.data.allowance.map((x: { membershipId: string }) => x.membershipId),
    ).not.toContain(next.body.data.id);
    const r = await ask(user, {
      membershipId: next.body.data.id,
      startsOn: next.body.data.startDate,
      endsOn: next.body.data.startDate,
    });
    expect(r.body.message).toBe('errors.pause.not_pausable');

    // Pausing the current one moves the renewal too, so they never overlap.
    const current = (await h.http.get('/v1/me/pauses').set(user.auth)).body.data.allowance[0]
      .membershipId as string;
    const p = await h.http
      .post(`/v1/admin/memberships/${current}/pauses`)
      .set(manager.auth)
      .send({ startsOn: addDays(today, 3), endsOn: addDays(today, 5) });
    expect(p.status).toBe(201);
    const after = await h.db
      .selectFrom('memberships')
      .select([sql<string>`start_date::text`.as('s'), sql<string>`end_date::text`.as('e')])
      .where('id', '=', next.body.data.id)
      .executeTakeFirstOrThrow();
    expect(after.s).toBe(addDays(next.body.data.startDate, 3));
    expect(after.e).toBe(addDays(next.body.data.endDate, 3));
    expect(addDays(await endOf(current), 1)).toBe(after.s);
    // Ending it before it starts moves both back.
    await h.http.post(`/v1/admin/pauses/${p.body.data.id}/end`).set(manager.auth).expect(200);
    expect(await endOf(next.body.data.id)).toBe(next.body.data.endDate);
  });

  it('only staff with the pause permission decide', async () => {
    const trainer = await h.user({ role: 'trainer' });
    expect((await h.http.get('/v1/admin/pauses').set(trainer.auth)).status).toBe(403);
    expect((await h.http.get('/v1/admin/pauses').set(reception.auth)).status).toBe(200);
  });
});
