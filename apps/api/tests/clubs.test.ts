import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

/**
 * F12-1: two gyms on one platform. Nothing of one gym may be visible to, or changeable by,
 * the other - not through staff routes, member routes nor public routes.
 */
let h: Harness;
let otherClub: string;
let gritOwner: TestUser;
let otherOwner: TestUser;

const B = { 'X-Club': 'drugi-klub' };

beforeAll(async () => {
  h = await createHarness();
  const row = await h.db
    .insertInto('clubs')
    .values({ slug: 'drugi-klub', name: 'Drugi klub', status: 'active' })
    .returning('id')
    .executeTakeFirstOrThrow();
  otherClub = row.id;
  // The new club gets its own copy of the system roles and their permissions.
  await sql`insert into roles (club_id, key, is_system)
            select ${otherClub}, key, is_system from roles where club_id = (select id from clubs where is_default)`.execute(
    h.db,
  );
  await sql`insert into role_permissions (club_id, role_id, permission_key)
            select ${otherClub}, rb.id, rp.permission_key
            from role_permissions rp
            join roles ra on ra.id = rp.role_id and ra.club_id = (select id from clubs where is_default)
            join roles rb on rb.key = ra.key and rb.club_id = ${otherClub}`.execute(h.db);
  gritOwner = await h.user({ role: 'owner', aal: 'aal2' });
  otherOwner = await h.user({ role: 'owner', aal: 'aal2', clubId: otherClub });
});
afterAll(async () => h?.close());

const newMember = (u: TestUser, headers: Record<string, string> = {}, name = 'Ana') =>
  h.http
    .post('/v1/admin/members')
    .set(u.auth)
    .set(headers)
    .send({ firstName: name, lastName: 'Test', phone: `+38160${Math.floor(Math.random() * 1e7)}` });

describe('club isolation (F12-1)', () => {
  it('staff of one gym have no rights in another', async () => {
    expect((await h.http.get('/v1/admin/members').set(gritOwner.auth).set(B)).status).toBe(403);
    expect((await h.http.get('/v1/admin/members').set(otherOwner.auth)).status).toBe(403);
    expect((await h.http.get('/v1/admin/members').set(otherOwner.auth).set(B)).status).toBe(200);
  });

  it('members, plans and settings stay inside their gym', async () => {
    const a = await newMember(gritOwner, {}, 'Gritovac');
    const b = await newMember(otherOwner, B, 'Drugovac');
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const inB = await h.http.get('/v1/admin/members').set(otherOwner.auth).set(B);
    const names = inB.body.data.map((m: { firstName: string }) => m.firstName);
    expect(names).toContain('Drugovac');
    expect(names).not.toContain('Gritovac');
    // A record of the other gym cannot be opened by id either.
    expect(
      (await h.http.get(`/v1/admin/members/${a.body.data.id}`).set(otherOwner.auth).set(B)).status,
    ).toBe(404);

    const plan = await h.http
      .post('/v1/admin/plans')
      .set(otherOwner.auth)
      .set(B)
      .send({
        isAvailable: true,
        translations: { sr: { name: 'Samo drugi klub' } },
        kind: 'unlimited',
        priceAmount: 100_000,
        durationDays: 30,
        visitLimit: null,
      });
    expect(plan.status).toBe(201);
    const publicB = await h.http.get('/v1/public/plans').set(B);
    const publicGrit = await h.http.get('/v1/public/plans');
    const planNames = (r: { body: { data: Array<{ name: string }> } }) =>
      r.body.data.map((p) => p.name);
    expect(planNames(publicB)).toContain('Samo drugi klub');
    expect(planNames(publicGrit)).not.toContain('Samo drugi klub');

    // Club profile (settings) is per gym.
    const profile = await h.http
      .put('/v1/admin/club')
      .set(otherOwner.auth)
      .set(B)
      .send({ name: 'Drugi klub Fitness', shortName: 'DRUGI', tagline: {} });
    expect(profile.status).toBe(200);
    expect((await h.http.get('/v1/public/club').set(B)).body.data.info.name).toBe(
      'Drugi klub Fitness',
    );
    expect((await h.http.get('/v1/public/club')).body.data.info.name).not.toBe(
      'Drugi klub Fitness',
    );
  });

  it('one person can be a member of two gyms; "me" follows the chosen gym', async () => {
    const person = await h.user({ member: true });
    await h.db
      .insertInto('members')
      .values({
        user_id: person.userId,
        first_name: 'Isti',
        last_name: 'Covek',
        email: `isti-${Date.now()}@example.com`,
        club_id: otherClub,
      })
      .execute();
    const inGrit = (await h.http.get('/v1/me').set(person.auth)).body.data.member;
    const inB = (await h.http.get('/v1/me').set(person.auth).set(B)).body.data.member;
    expect(inGrit.id).toBe(person.memberId);
    expect(inB.id).not.toBe(person.memberId);
    expect(inB.firstName).toBe('Isti');
  });

  it('tells clients which gym is the original one (logo fallback)', async () => {
    expect((await h.http.get('/v1/public/club')).body.data.isDefault).toBe(true);
    expect((await h.http.get('/v1/public/club').set(B)).body.data.isDefault).toBe(false);
  });

  it('unknown and suspended gyms are refused', async () => {
    expect((await h.http.get('/v1/public/club').set('X-Club', 'nema-ga')).status).toBe(404);
    expect((await h.http.get('/v1/public/club').set('X-Club', '../etc')).status).toBe(404);
    await h.db
      .insertInto('clubs')
      .values({ slug: 'ugasen', name: 'Ugašen', status: 'suspended' })
      .execute();
    expect((await h.http.get('/v1/public/club').set('X-Club', 'ugasen')).status).toBe(404);
  });

  it('the database itself refuses cross-club rows for the API role', async () => {
    // Even a raw query without any club filter sees only the current club.
    const counts = await h.db.transaction().execute(async (tx) => {
      await sql`select set_config('app.club_id', ${otherClub}, true)`.execute(tx);
      await sql`set local role grit_api`.execute(tx);
      const seen = await sql<{ n: number }>`select count(*)::int n from members`.execute(tx);
      const foreign = await sql<{ n: number }>`
        select count(*)::int n from members where club_id <> ${otherClub}`.execute(tx);
      return { seen: seen.rows[0]!.n, foreign: foreign.rows[0]!.n };
    });
    expect(counts.seen).toBeGreaterThan(0);
    expect(counts.foreign).toBe(0);
    // Writing a row into another club is rejected.
    await expect(
      h.db.transaction().execute(async (tx) => {
        await sql`select set_config('app.club_id', ${otherClub}, true)`.execute(tx);
        await sql`set local role grit_api`.execute(tx);
        await sql`insert into zones (club_id, key) values ((select id from clubs where is_default), 'upad')`.execute(
          tx,
        );
      }),
    ).rejects.toThrow(/row-level security/);
  });
});
