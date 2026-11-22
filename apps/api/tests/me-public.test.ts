import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let a: TestUser;
let b: TestUser;

beforeAll(async () => {
  h = await createHarness();
  a = await h.user({ member: true });
  b = await h.user({ member: true });
});
afterAll(async () => h?.close());

describe('/me (RLS-scoped)', () => {
  it('returns own profile and linked member only', async () => {
    const res = await h.http.get('/v1/me').set(a.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: a.userId, roles: [], member: { id: a.memberId } });
  });

  it('works for a user without a member profile', async () => {
    const lonely = await h.user();
    const res = await h.http.get('/v1/me').set(lonely.auth);
    expect(res.body.data.member).toBeNull();
  });

  it('updates own profile and leaves others untouched', async () => {
    const res = await h.http.patch('/v1/me').set(a.auth).send({ firstName: 'Ana', locale: 'en' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ firstName: 'Ana', locale: 'en' });
    const other = await h.http.get('/v1/me').set(b.auth);
    expect(other.body.data.firstName).toBe('Test');
  });

  it('rejects unsupported locales and unknown fields', async () => {
    expect((await h.http.patch('/v1/me').set(a.auth).send({ locale: 'pt' })).status).toBe(400);
    expect((await h.http.patch('/v1/me').set(a.auth).send({ locale: 'de' })).status).toBe(200);
    expect((await h.http.patch('/v1/me').set(a.auth).send({ id: b.userId })).status).toBe(400);
  });
});

describe('/public/club', () => {
  it('is available without a token and exposes only club.* settings', async () => {
    const res = await h.http.get('/v1/public/club');
    expect(res.status).toBe(200);
    expect(res.body.data.info).toMatchObject({
      phone: '+381 62 1090 771',
      email: 'admin@gritgym.rs',
    });
    expect(Object.keys(res.body.data.info).some((k) => k.includes('membership'))).toBe(false);
    expect(res.headers['cache-control']).toContain('max-age=300');
  });
});
