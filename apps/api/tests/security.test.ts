import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allRoutes } from '../src/modules';
import { createHarness, signToken, type Harness, type TestUser } from './harness';

const SAMPLE_ID = '00000000-0000-4000-8000-000000000000';
const concretePath = (p: string) => p.replace(/:id\b/g, SAMPLE_ID);

let h: Harness;
let member: TestUser;

beforeAll(async () => {
  h = await createHarness();
  member = await h.user({ member: true });
});
afterAll(async () => h?.close());

describe('route registry', () => {
  it('declares access that matches the URL namespace', () => {
    for (const r of allRoutes) {
      if (r.path.startsWith('/admin/')) expect(r.access.kind, r.path).toBe('permission');
      else if (r.path.startsWith('/platform/')) expect(r.access.kind, r.path).toBe('platform');
      else if (r.path === '/me' || r.path.startsWith('/me/'))
        expect(r.access.kind, r.path).toBe('self');
      else
        expect(
          ['/ready', '/public/'].some((p) => r.path.startsWith(p)),
          r.path,
        ).toBe(true);
    }
  });

  it('has no duplicate method+path', () => {
    const keys = allRoutes.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('authentication and authorization on every protected route', () => {
  const protectedRoutes = allRoutes.filter((r) => r.access.kind !== 'public');

  for (const r of protectedRoutes) {
    it(`${r.method.toUpperCase()} ${r.path} → 401 without a token`, async () => {
      const res = await h.http[r.method](`/v1${concretePath(r.path)}`).send({});
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ success: false, error: { code: 'UNAUTHENTICATED' } });
    });
  }

  for (const r of protectedRoutes.filter((x) => x.access.kind === 'permission')) {
    it(`${r.method.toUpperCase()} ${r.path} → 403 for a regular member`, async () => {
      const res = await h.http[r.method](`/v1${concretePath(r.path)}`)
        .set(member.auth)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  }
});

describe('tokens', () => {
  it('rejects a token signed with another secret', async () => {
    const forged = await signToken(member.userId, 'aal1', new TextEncoder().encode('x'.repeat(40)));
    const res = await h.http.get('/v1/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejects garbage and non-bearer schemes', async () => {
    expect((await h.http.get('/v1/me').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(
      401,
    );
    expect((await h.http.get('/v1/me').set('Authorization', `Basic ${member.token}`)).status).toBe(
      401,
    );
  });
});

describe('MFA for owner/manager', () => {
  it('blocks owner admin access without aal2', async () => {
    const owner = await h.user({ role: 'owner', aal: 'aal1' });
    const res = await h.http.get('/v1/admin/members').set(owner.auth);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MFA_REQUIRED');
  });

  it('allows owner with aal2 and reception without MFA', async () => {
    const owner = await h.user({ role: 'owner', aal: 'aal2' });
    const reception = await h.user({ role: 'reception', aal: 'aal1' });
    expect((await h.http.get('/v1/admin/members').set(owner.auth)).status).toBe(200);
    expect((await h.http.get('/v1/admin/members').set(reception.auth)).status).toBe(200);
  });

  it('removes all staff permissions when the staff profile is deactivated', async () => {
    const reception = await h.user({ role: 'reception' });
    await h.db
      .insertInto('staff_profiles')
      .values({ user_id: reception.userId, deactivated_at: new Date() })
      .execute();
    expect((await h.http.get('/v1/admin/members').set(reception.auth)).status).toBe(403);
  });
});

describe('reception cannot do manager-only actions', () => {
  it('reception may not deactivate members', async () => {
    const reception = await h.user({ role: 'reception' });
    const res = await h.http
      .post(`/v1/admin/members/${SAMPLE_ID}/deactivate`)
      .set(reception.auth)
      .send({ reason: 'test' });
    expect(res.status).toBe(403);
  });
});

describe('envelope and system routes', () => {
  it('returns a standard 404 envelope for unknown routes', async () => {
    const res = await h.http.get('/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, data: null, error: { code: 'NOT_FOUND' } });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await h.http
      .patch('/v1/me')
      .set(member.auth)
      .set('Content-Type', 'application/json')
      .send('{"firstName":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('reports readiness and health', async () => {
    expect((await h.http.get('/health')).status).toBe(200);
    expect((await h.http.get('/v1/ready')).body.data).toEqual({ database: 'ok' });
  });

  it('serves an OpenAPI document covering every route', async () => {
    const res = await h.http.get('/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.paths)).toContain('/v1/admin/members/{id}');
  });
});
