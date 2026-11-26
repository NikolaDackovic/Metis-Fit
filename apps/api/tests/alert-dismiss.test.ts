import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

/** The desk can hide an alert row for a while; it is gone from the list and the badge. */
let h: Harness;
let manager: TestUser;
let ana: TestUser;

beforeAll(async () => {
  h = await createHarness();
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  ana = await h.user({ member: true });
});
afterAll(async () => h?.close());

const signups = () =>
  h.http
    .get('/v1/admin/alerts')
    .set(manager.auth)
    .then((r) => (r.body.data.signups as Array<{ memberId: string }>).map((s) => s.memberId));

describe('alert dismissals', () => {
  it('hides a row; a member cannot dismiss', async () => {
    expect(await signups()).toContain(ana.memberId);
    const r = await h.http
      .post('/v1/admin/alerts/dismiss')
      .set(manager.auth)
      .send({ kind: 'signups', memberId: ana.memberId, days: 30 });
    expect(r.status).toBe(200);
    expect(await signups()).not.toContain(ana.memberId);
    // Again (e.g. another click) just moves the date.
    expect(
      (
        await h.http
          .post('/v1/admin/alerts/dismiss')
          .set(manager.auth)
          .send({ kind: 'signups', memberId: ana.memberId, days: 7 })
      ).status,
    ).toBe(200);
    expect(
      (
        await h.http
          .post('/v1/admin/alerts/dismiss')
          .set(ana.auth)
          .send({ kind: 'signups', memberId: ana.memberId, days: 7 })
      ).status,
    ).toBe(403);
  });
});
