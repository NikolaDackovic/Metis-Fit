import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerLimiter } from '../src/modules/clubs/clubs.routes';
import { createHarness, type Harness, type TestUser } from './harness';

/** F12-3: a gym registers itself, waits for the platform owner, then goes live. */
let h: Harness;
let platform: TestUser;

beforeAll(async () => {
  h = await createHarness();
  platform = await h.user();
  await h.db.insertInto('platform_admins').values({ user_id: platform.userId }).execute();
});
afterAll(async () => h?.close());
beforeEach(() => registerLimiter.reset());

const register = (u: TestUser, body: Record<string, unknown>) =>
  h.http.post('/v1/me/clubs').set(u.auth).send(body);

describe('gym self-registration (F12-3)', () => {
  it('opens a pending gym with the founder as owner, ready to set up', async () => {
    const founder = await h.user({ aal: 'aal2' });
    const res = await register(founder, {
      name: 'Fit Žona Niš',
      city: 'Niš',
      phone: '+381601234567',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      slug: 'fit-zona-nis',
      status: 'pending',
      roles: ['owner'],
    });
    const club = { 'X-Club': res.body.data.slug };

    // The owner already works in the admin of the new gym ...
    expect((await h.http.get('/v1/admin/members').set(founder.auth).set(club)).status).toBe(200);
    const me = (await h.http.get('/v1/me').set(founder.auth).set(club)).body.data;
    expect(me.roles).toEqual(['owner']);
    expect(me.permissions).toContain('settings.manage');
    // ... but nobody else sees it until it is approved.
    expect((await h.http.get('/v1/public/plans').set(club)).status).toBe(404);
    const dir = (await h.http.get('/v1/public/clubs')).body.data.map(
      (c: { slug: string }) => c.slug,
    );
    expect(dir).not.toContain('fit-zona-nis');
    // And the founder has no rights in GRIT.
    expect((await h.http.get('/v1/admin/members').set(founder.auth)).status).toBe(403);

    const mine = (await h.http.get('/v1/me/clubs').set(founder.auth)).body.data;
    expect(mine).toEqual([
      expect.objectContaining({
        slug: 'fit-zona-nis',
        status: 'pending',
        roles: ['owner'],
        isMember: false,
      }),
    ]);
  });

  it('only the platform owner approves; then the gym is public', async () => {
    const founder = await h.user({ aal: 'aal2' });
    const { slug, id } = (await register(founder, { name: 'Gvozdeni Dom', city: 'Kragujevac' }))
      .body.data;
    expect((await h.http.get('/v1/platform/clubs').set(founder.auth)).status).toBe(403);
    expect(
      (await h.http.post(`/v1/platform/clubs/${id}/approve`).set(founder.auth).send()).status,
    ).toBe(403);

    const list = (
      await h.http.get('/v1/platform/clubs').query({ status: 'pending' }).set(platform.auth)
    ).body.data;
    expect(list.find((c: { id: string }) => c.id === id)).toMatchObject({
      name: 'Gvozdeni Dom',
      city: 'Kragujevac',
      ownerEmail: expect.stringContaining('@'),
    });
    expect(
      (await h.http.post(`/v1/platform/clubs/${id}/approve`).set(platform.auth).send()).status,
    ).toBe(200);
    const dir = (await h.http.get('/v1/public/clubs').query({ q: 'kragu' })).body.data;
    expect(dir).toEqual([{ id, slug, name: 'Gvozdeni Dom', city: 'Kragujevac' }]);
    const info = (await h.http.get('/v1/public/club').set('X-Club', slug)).body.data.info;
    expect(info.name).toBe('Gvozdeni Dom');
  });

  it('suspends with a reason; the default gym cannot be suspended', async () => {
    const founder = await h.user({ aal: 'aal2' });
    const { slug, id } = (await register(founder, { name: 'Brzi Start', city: 'Subotica' })).body
      .data;
    await h.http.post(`/v1/platform/clubs/${id}/approve`).set(platform.auth).send().expect(200);
    expect(
      (await h.http.post(`/v1/platform/clubs/${id}/suspend`).set(platform.auth).send({})).status,
    ).toBe(400);
    await h.http
      .post(`/v1/platform/clubs/${id}/suspend`)
      .set(platform.auth)
      .send({ reason: 'Neplaćena pretplata' })
      .expect(200);
    expect((await h.http.get('/v1/public/club').set('X-Club', slug)).status).toBe(404);
    expect(
      (await h.http.get('/v1/admin/members').set(founder.auth).set('X-Club', slug)).status,
    ).toBe(404);
    await h.http.post(`/v1/platform/clubs/${id}/reactivate`).set(platform.auth).send().expect(200);
    expect((await h.http.get('/v1/public/club').set('X-Club', slug)).status).toBe(200);

    const grit = (
      await h.db
        .selectFrom('clubs')
        .select('id')
        .where('is_default', '=', true)
        .executeTakeFirstOrThrow()
    ).id;
    const r = await h.http
      .post(`/v1/platform/clubs/${grit}/suspend`)
      .set(platform.auth)
      .send({ reason: 'test test' });
    expect(r.body.message).toBe('errors.club.default_locked');
  });

  it('keeps addresses unique and limits pending gyms per person', async () => {
    const a = await h.user();
    const first = await register(a, { name: 'Isti Naziv', city: 'Beograd' });
    const second = await register(a, { name: 'Isti Naziv', city: 'Beograd' });
    expect(first.body.data.slug).toBe('isti-naziv');
    expect(second.body.data.slug).toBe('isti-naziv-2');
    const explicit = await register(a, { name: 'Drugo Ime', city: 'Beograd', slug: 'isti-naziv' });
    expect(explicit.status).toBe(409);
    await register(a, { name: 'Treći', city: 'Beograd' });
    const fourth = await register(a, { name: 'Četvrti', city: 'Beograd' });
    expect(fourth.body.message).toBe('errors.club.too_many_pending');
    expect((await register(a, { name: 'X', city: '' })).status).toBe(400);
  });
});
