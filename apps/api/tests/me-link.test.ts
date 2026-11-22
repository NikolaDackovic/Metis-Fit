import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { linkIpLimiter, linkUserLimiter } from '../src/modules/me/me-membership.routes';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let reception: TestUser;
let manager: TestUser;
let planId: string;

async function newMember(name: string) {
  const res = await h.http
    .post('/v1/admin/members')
    .set(reception.auth)
    .send({ firstName: name, lastName: 'Link', phone: `06${Math.floor(Math.random() * 1e8)}` });
  return res.body.data.id as string;
}
const issueCode = async (memberId: string) =>
  (await h.http.post(`/v1/admin/members/${memberId}/link-code`).set(reception.auth).send()).body
    .data as { code: string; expiresAt: string };

beforeAll(async () => {
  h = await createHarness();
  reception = await h.user({ role: 'reception' });
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  const plan = await h.http
    .post('/v1/admin/plans')
    .set(manager.auth)
    .send({
      kind: 'unlimited',
      priceAmount: 550_000,
      durationDays: 30,
      visitLimit: null,
      isAvailable: true,
      translations: { sr: { name: 'Teretana' }, en: { name: 'Gym' } },
    });
  planId = plan.body.data.id;
});
afterAll(async () => h?.close());
beforeEach(() => {
  linkUserLimiter.reset();
  linkIpLimiter.reset();
});

describe('linking an app account', () => {
  it('links with a valid code, once; the code is never stored in plain text', async () => {
    const memberId = await newMember('Ana');
    const { code } = await issueCode(memberId);
    expect(code).toMatch(/^\d{6}$/);

    const stored = await h.db
      .selectFrom('member_link_codes')
      .select('code_hash')
      .where('member_id', '=', memberId)
      .execute();
    expect(stored[0]!.code_hash).not.toContain(code);

    const user = await h.user();
    const res = await h.http.post('/v1/me/link').set(user.auth).send({ code });
    expect(res.status).toBe(200);
    expect(res.body.data.memberId).toBe(memberId);

    const me = await h.http.get('/v1/me').set(user.auth);
    expect(me.body.data.member.id).toBe(memberId);
    expect(me.body.data.firstName).toBe('Test'); // an existing profile name is never overwritten

    const other = await h.user();
    const reuse = await h.http.post('/v1/me/link').set(other.auth).send({ code });
    expect(reuse.body.message).toBe('errors.member.invalid_link_code');
  });

  it('rejects wrong codes and rate-limits guessing', async () => {
    const user = await h.user();
    for (let i = 0; i < 5; i++) {
      const r = await h.http.post('/v1/me/link').set(user.auth).send({ code: '000000' });
      expect(r.status).toBe(422);
    }
    const blocked = await h.http.post('/v1/me/link').set(user.auth).send({ code: '000000' });
    expect(blocked.status).toBe(429);
  });

  it('a new code invalidates the previous one', async () => {
    const memberId = await newMember('Boris');
    const first = await issueCode(memberId);
    const second = await issueCode(memberId);
    const user = await h.user();
    expect(
      (await h.http.post('/v1/me/link').set(user.auth).send({ code: first.code })).status,
    ).toBe(422);
    if (first.code !== second.code) {
      expect(
        (await h.http.post('/v1/me/link').set(user.auth).send({ code: second.code })).status,
      ).toBe(200);
    }
  });

  it('refuses codes for already-linked members and a second link for the same account', async () => {
    const linked = await h.user({ member: true });
    const res = await h.http
      .post(`/v1/admin/members/${linked.memberId}/link-code`)
      .set(reception.auth)
      .send();
    expect(res.body.message).toBe('errors.member.already_linked');

    const memberId = await newMember('Ceca');
    const { code } = await issueCode(memberId);
    const again = await h.http.post('/v1/me/link').set(linked.auth).send({ code });
    expect(again.body.message).toBe('errors.member.account_already_linked');
  });

  it('members cannot issue link codes', async () => {
    const member = await h.user({ member: true });
    const memberId = await newMember('Dina');
    expect(
      (await h.http.post(`/v1/admin/members/${memberId}/link-code`).set(member.auth).send()).status,
    ).toBe(403);
  });
});

describe('member self-service data', () => {
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    a = await h.user({ member: true });
    b = await h.user({ member: true });
    for (const m of [a, b]) {
      await h.http
        .post(`/v1/admin/members/${m.memberId}/memberships`)
        .set(reception.auth)
        .send({ planId, payment: { amount: 550_000, method: 'cash', note: 'interna napomena' } });
    }
  });

  it('shows only my memberships, localized, with computed status', async () => {
    const res = await h.http.get('/v1/me/memberships').query({ locale: 'en' }).set(a.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      memberId: a.memberId,
      planName: 'Gym',
      displayStatus: 'active',
    });
  });

  it('falls back to the Serbian plan name and still shows plans no longer on sale', async () => {
    await h.http.patch(`/v1/admin/plans/${planId}`).set(manager.auth).send({ isAvailable: false });
    const res = await h.http.get('/v1/me/memberships').query({ locale: 'ru' }).set(a.auth);
    expect(res.body.data[0].planName).toBe('Teretana');
    await h.http.patch(`/v1/admin/plans/${planId}`).set(manager.auth).send({ isAvailable: true });
  });

  it('shows my payments without internal notes', async () => {
    const res = await h.http.get('/v1/me/payments').set(a.auth);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ amount: 550_000, planName: 'Teretana' });
    expect(JSON.stringify(res.body.data)).not.toContain('interna napomena');
  });

  it('returns empty lists for a user without a member profile', async () => {
    const lonely = await h.user();
    expect((await h.http.get('/v1/me/memberships').set(lonely.auth)).body.data).toEqual([]);
    expect((await h.http.get('/v1/me/visits').set(lonely.auth)).body.data).toEqual([]);
  });
});
