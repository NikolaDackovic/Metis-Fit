import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { createTokenVerifier } from '../src/middleware/auth';
import { createLocalMediaStore } from '../src/shared/media';
import { createHarness, type Harness } from './harness';

const SECRET = 'dev-secret-dev-secret-dev-secret-123456';
const base = {
  DATABASE_URL: 'postgres://x',
  SUPABASE_JWT_SECRET: SECRET,
  QR_TOKEN_SECRET: 'q'.repeat(40),
};

describe('env guards', () => {
  it('refuses DEV_LOGIN outside development', () => {
    for (const NODE_ENV of ['production', 'staging', 'test']) {
      expect(() => loadEnv({ ...base, NODE_ENV, DEV_LOGIN: 'true' })).toThrow(/DEV_LOGIN/);
    }
    expect(loadEnv({ ...base, NODE_ENV: 'development', DEV_LOGIN: 'true' }).DEV_LOGIN).toBe(true);
  });

  it('MFA for the admin is on by default; the platform owner may switch it off', () => {
    const prod = {
      DATABASE_URL: 'postgres://x',
      QR_TOKEN_SECRET: 'q'.repeat(40),
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      CORS_ORIGINS: 'https://admin.example.rs',
      MEDIA_STORE: 'supabase',
    };
    expect(loadEnv(prod).REQUIRE_MFA_FOR_ADMIN).toBe(true);
    expect(loadEnv({ ...prod, REQUIRE_MFA_FOR_ADMIN: 'false' }).REQUIRE_MFA_FOR_ADMIN).toBe(false);
  });

  it('production needs JWKS, https CORS and remote media storage', () => {
    const prod = {
      DATABASE_URL: 'postgres://x',
      QR_TOKEN_SECRET: 'q'.repeat(40),
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      CORS_ORIGINS: 'https://admin.example.rs',
      MEDIA_STORE: 'supabase',
    };
    expect(loadEnv(prod).MEDIA_STORE).toBe('supabase');
    expect(() => loadEnv({ ...prod, SUPABASE_URL: '', SUPABASE_JWT_SECRET: SECRET })).toThrow(
      /JWKS/,
    );
    expect(() => loadEnv({ ...prod, CORS_ORIGINS: 'http://admin.example.rs' })).toThrow(/CORS/);
    expect(() => loadEnv({ ...prod, CORS_ORIGINS: '' })).toThrow(/CORS/);
    expect(() => loadEnv({ ...prod, MEDIA_STORE: 'local' })).toThrow(/MEDIA_STORE/);
    expect(() => loadEnv({ ...prod, SUPABASE_SERVICE_ROLE_KEY: '' })).toThrow(/SERVICE_ROLE/);
  });
});

describe('supabase media store', () => {
  it('uploads, deletes and builds public URLs with the service key, never accepts odd keys', async () => {
    const { createSupabaseMediaStore } = await import('../src/shared/media');
    const calls: Array<{ url: string; method: string; auth?: string }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      const h = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, method: init?.method ?? 'GET', auth: h.authorization });
      return new Response(null, { status: init?.method === 'HEAD' ? 404 : 200 });
    }) as unknown as typeof fetch;
    const store = createSupabaseMediaStore({
      supabaseUrl: 'https://abc.supabase.co/',
      serviceRoleKey: 'srk',
      bucket: 'club-media',
      fetchImpl,
    });
    await store.put('club/logo-1.png', Buffer.from('x'), 'image/png');
    await store.remove('club/logo-1.png');
    expect(await store.exists('defaults/a.jpg')).toBe(false);
    expect(calls[0]).toEqual({
      url: 'https://abc.supabase.co/storage/v1/object/club-media/club/logo-1.png',
      method: 'POST',
      auth: 'Bearer srk',
    });
    expect(calls[1]!.method).toBe('DELETE');
    expect(calls[2]!.auth).toBeUndefined();
    expect(store.url('club/logo-1.png')).toBe(
      'https://abc.supabase.co/storage/v1/object/public/club-media/club/logo-1.png',
    );
    await expect(store.put('../etc/passwd', Buffer.from('x'), 'image/png')).rejects.toThrow();
  });
});

describe('dev login', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => h?.close());

  const app = (nodeEnv: 'development' | 'test', enabled: boolean) =>
    request(
      createApp({
        db: h.db,
        logger: pino({ level: 'silent' }),
        env: { NODE_ENV: nodeEnv, CORS_ORIGINS: [], REQUIRE_MFA_FOR_ADMIN: true },
        verifyToken: createTokenVerifier({ jwtSecret: SECRET }),
        devLogin: enabled ? { jwtSecret: SECRET } : undefined,
        accessTokenSecret: 'q'.repeat(40),
        media: createLocalMediaStore('.tmp/media-test', 'http://localhost/media'),
        mealPlanner: async () => null,
      }),
    );

  it('health and readiness probes answer without a token', async () => {
    expect((await app('test', false).get('/health')).body).toEqual({ status: 'ok' });
    expect((await app('test', false).get('/ready')).body).toEqual({ status: 'ready' });
  });

  it('does not exist unless explicitly enabled in development', async () => {
    expect((await app('test', true).post('/v1/dev/login').send({ email: 'a@b.rs' })).status).toBe(
      404,
    );
    expect(
      (await app('development', false).post('/v1/dev/login').send({ email: 'a@b.rs' })).status,
    ).toBe(404);
  });

  it('issues a working token only for existing users', async () => {
    const user = await h.user({ role: 'owner', email: 'owner@grit.local' });
    const dev = app('development', true);
    expect((await dev.post('/v1/dev/login').send({ email: 'nobody@grit.local' })).status).toBe(401);
    const res = await dev.post('/v1/dev/login').send({ email: 'owner@grit.local' });
    expect(res.status).toBe(200);
    const me = await dev.get('/v1/me').set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(me.body.data).toMatchObject({ id: user.userId, roles: ['owner'], aal: 'aal2' });
    expect(me.body.data.permissions).toContain('payments.void');
  });
});
