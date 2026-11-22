import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let reception: TestUser;
let manager: TestUser;

beforeAll(async () => {
  h = await createHarness();
  reception = await h.user({ role: 'reception' });
  manager = await h.user({ role: 'manager', aal: 'aal2' });
});
afterAll(async () => h?.close());

const create = (body: Record<string, unknown>, who = reception) =>
  h.http.post('/v1/admin/members').set(who.auth).send(body);

describe('POST /admin/members', () => {
  it('creates a member, assigns a member number and writes an audit entry', async () => {
    const res = await create({
      firstName: 'Marko',
      lastName: 'Marković',
      phone: '+381 62 111 2233',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      firstName: 'Marko',
      phone: '+381621112233',
      hasAppAccount: false,
      deactivatedAt: null,
    });
    expect(res.body.data.memberNumber).toMatch(/^G-\d{6}$/);

    const audit = await h.db
      .selectFrom('audit_logs')
      .selectAll()
      .where('entity_id', '=', res.body.data.id)
      .execute();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'member.create',
      actor_id: reception.userId,
      actor_roles: ['reception'],
    });
  });

  it('returns field-level validation errors as translation keys', async () => {
    const res = await create({ firstName: '', lastName: 'X', email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['firstName', 'email']));
  });

  it('rejects a duplicate active email with 409', async () => {
    await create({ firstName: 'Ana', lastName: 'A', email: 'ana@example.com' });
    const res = await create({ firstName: 'Ana', lastName: 'B', email: 'ANA@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('errors.member.email_taken');
  });

  it('ignores attempts to set server-controlled fields', async () => {
    const res = await create({
      firstName: 'A',
      lastName: 'B',
      phone: '0601234567',
      memberNumber: 'G-999999',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /admin/members', () => {
  beforeAll(async () => {
    await create({ firstName: 'Jovana', lastName: 'Petrović', phone: '0641234567' });
    await create({ firstName: 'Nikola', lastName: 'Jovanović', email: 'nikola@example.com' });
  });

  it('searches by name in either order, case-insensitive', async () => {
    const res = await h.http
      .get('/v1/admin/members')
      .query({ q: 'petrović jov' })
      .set(reception.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((m: { lastName: string }) => m.lastName)).toEqual(['Petrović']);
  });

  it('searches by phone digits and email', async () => {
    const byPhone = await h.http
      .get('/v1/admin/members')
      .query({ q: '064 123' })
      .set(reception.auth);
    expect(byPhone.body.data.map((m: { firstName: string }) => m.firstName)).toContain('Jovana');
    const byEmail = await h.http
      .get('/v1/admin/members')
      .query({ q: 'nikola@' })
      .set(reception.auth);
    expect(byEmail.body.data).toHaveLength(1);
  });

  it('treats LIKE wildcards in the search literally', async () => {
    const res = await h.http.get('/v1/admin/members').query({ q: '%' }).set(reception.auth);
    expect(res.body.data).toHaveLength(0);
  });

  it('paginates with meta', async () => {
    const res = await h.http
      .get('/v1/admin/members')
      .query({ pageSize: 2, page: 1 })
      .set(reception.auth);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 2 });
    // Marko, Ana (duplicate rejected), Jovana, Nikola
    expect(res.body.meta.total).toBe(4);
  });
});

describe('GET/PATCH /admin/members/:id', () => {
  it('returns 404 for unknown and 400 for malformed ids', async () => {
    const missing = await h.http
      .get('/v1/admin/members/00000000-0000-4000-8000-000000000000')
      .set(reception.auth);
    expect(missing.status).toBe(404);
    const malformed = await h.http.get('/v1/admin/members/123').set(reception.auth);
    expect(malformed.status).toBe(400);
  });

  it('updates and audits only the changed fields', async () => {
    const created = await create({ firstName: 'Old', lastName: 'Name', phone: '0601111111' });
    const id = created.body.data.id;
    const res = await h.http
      .patch(`/v1/admin/members/${id}`)
      .set(reception.auth)
      .send({ firstName: 'New', lastName: 'Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('New');

    const audit = await h.db
      .selectFrom('audit_logs')
      .select(['action', 'diff'])
      .where('entity_id', '=', id)
      .where('action', '=', 'member.update')
      .executeTakeFirstOrThrow();
    expect(audit.diff).toEqual({ before: { firstName: 'Old' }, after: { firstName: 'New' } });
  });
});

describe('POST /admin/members/:id/deactivate', () => {
  it('deactivates (manager), hides from default list, frees the email, and cannot repeat', async () => {
    const created = await create({
      firstName: 'Gone',
      lastName: 'Member',
      email: 'gone@example.com',
    });
    const id = created.body.data.id;
    const res = await h.http
      .post(`/v1/admin/members/${id}/deactivate`)
      .set(manager.auth)
      .send({ reason: 'moved away' });
    expect(res.status).toBe(200);
    expect(res.body.data.deactivatedAt).not.toBeNull();

    const list = await h.http.get('/v1/admin/members').query({ q: 'gone@' }).set(manager.auth);
    expect(list.body.data).toHaveLength(0);
    const withInactive = await h.http
      .get('/v1/admin/members')
      .query({ q: 'gone@', includeDeactivated: 'true' })
      .set(manager.auth);
    expect(withInactive.body.data).toHaveLength(1);

    expect(
      (await create({ firstName: 'New', lastName: 'Owner', email: 'gone@example.com' })).status,
    ).toBe(201);

    const again = await h.http
      .post(`/v1/admin/members/${id}/deactivate`)
      .set(manager.auth)
      .send({ reason: 'again' });
    expect(again.status).toBe(422);
  });
});
