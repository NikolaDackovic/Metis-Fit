import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let manager: TestUser;
let reception: TestUser;
let planId: string;

beforeAll(async () => {
  h = await createHarness();
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
  const plan = await h.http
    .post('/v1/admin/plans')
    .set(manager.auth)
    .send({
      isAvailable: true,
      translations: { sr: { name: 'Mesečna' } },
      kind: 'unlimited',
      priceAmount: 500_000,
      durationDays: 30,
      visitLimit: null,
    });
  planId = plan.body.data.id;
});
afterAll(async () => h?.close());

describe('export and account deletion', () => {
  it('exports own data, then deletion removes personal data and keeps anonymized bookkeeping', async () => {
    const u = await h.user({ email: 'brisanje@example.com' });
    await h.http
      .post('/v1/me/member')
      .set(u.auth)
      .send({ phone: '+381601112233', dateOfBirth: '1990-01-02' });
    const req = await h.http.post('/v1/me/membership-requests').set(u.auth).send({ planId });
    await h.http
      .post(`/v1/admin/memberships/${req.body.data.id}/activate`)
      .set(reception.auth)
      .send({ payment: { amount: 500_000, method: 'cash' } });
    const today = await sql<{ d: string }>`select public.club_today()::text as d`
      .execute(h.db)
      .then((r) => r.rows[0]!.d);
    expect(
      (
        await h.http.post('/v1/me/food-log').set(u.auth).send({
          id: randomUUID(),
          eatenOn: today,
          meal: 'breakfast',
          name: 'Ovsene pahuljice',
          kcal: 350,
          proteinG: 12,
          carbsG: 60,
          fatG: 6,
        })
      ).status,
    ).toBe(201);

    const exp = await h.http.get('/v1/me/export').set(u.auth);
    expect(exp.status).toBe(200);
    expect(exp.body.data.account).toMatchObject({ email: 'brisanje@example.com' });
    expect(exp.body.data.member).toMatchObject({ phone: '+381601112233' });
    expect(exp.body.data.data.payments).toHaveLength(1);
    expect(exp.body.data.data.food_log_entries).toHaveLength(1);
    const memberId: string = exp.body.data.member.id;

    expect((await h.http.post('/v1/me/delete-account').set(u.auth).send({})).status).toBe(400);
    const del = await h.http.post('/v1/me/delete-account').set(u.auth).send({ confirm: true });
    expect(del.status).toBe(200);

    // Login account and profile are gone; the old token no longer works.
    const users = await sql`select 1 from auth.users where id = ${u.userId}`.execute(h.db);
    expect(users.rows).toHaveLength(0);
    expect(
      await h.db.selectFrom('profiles').select('id').where('id', '=', u.userId).executeTakeFirst(),
    ).toBeUndefined();
    expect((await h.http.get('/v1/me').set(u.auth)).status).toBeGreaterThanOrEqual(400);

    // Member row stays anonymized with its payment; personal diary is deleted.
    const m = await h.db
      .selectFrom('members')
      .selectAll()
      .where('id', '=', memberId)
      .executeTakeFirstOrThrow();
    expect(m).toMatchObject({
      first_name: 'Obrisan',
      email: null,
      phone: null,
      date_of_birth: null,
      user_id: null,
    });
    expect(m.anonymized_at).not.toBeNull();
    const pays = await h.db
      .selectFrom('payments')
      .select('amount')
      .where('member_id', '=', memberId)
      .execute();
    expect(pays).toEqual([{ amount: 500_000 }]);
    const food = await h.db
      .selectFrom('food_log_entries')
      .select('id')
      .where('user_id', '=', u.userId)
      .execute();
    expect(food).toHaveLength(0);

    // Audit log keeps the actions, without a link to the deleted person.
    const audit = await h.db
      .selectFrom('audit_logs')
      .select(['action', 'actor_id'])
      .where('action', '=', 'account.delete')
      .where('entity_id', '=', memberId)
      .execute();
    expect(audit).toEqual([{ action: 'account.delete', actor_id: null }]);
  });

  it('staff cannot delete their own account from the app; audit rows stay immutable', async () => {
    const r = await h.http
      .post('/v1/me/delete-account')
      .set(reception.auth)
      .send({ confirm: true });
    expect(r.body.message).toBe('errors.account.staff_cannot_delete');
    await expect(
      sql`update public.audit_logs set action = 'x.y' where id = (select max(id) from public.audit_logs)`.execute(
        h.db,
      ),
    ).rejects.toThrow(/append-only/);
  });

  it('owner or manager erases a member on request at the desk; the app account goes too', async () => {
    const u = await h.user({ email: 'na.zahtev@example.com' });
    await h.http.post('/v1/me/member').set(u.auth).send({ phone: '+381609990000' });
    const me = await h.http.get('/v1/me').set(u.auth);
    const memberId: string = me.body.data.member.id;

    const denied = await h.http
      .post(`/v1/admin/members/${memberId}/erase`)
      .set(reception.auth)
      .send({ reason: 'Zahtev člana na recepciji' });
    expect(denied.status).toBe(403);
    const ok = await h.http
      .post(`/v1/admin/members/${memberId}/erase`)
      .set(manager.auth)
      .send({ reason: 'Zahtev člana na recepciji' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ firstName: 'Obrisan', phone: null, hasAppAccount: false });
    expect(ok.body.data.anonymizedAt).not.toBeNull();
    const users = await sql`select 1 from auth.users where id = ${u.userId}`.execute(h.db);
    expect(users.rows).toHaveLength(0);
    const again = await h.http
      .post(`/v1/admin/members/${memberId}/erase`)
      .set(manager.auth)
      .send({ reason: 'Ponovo' });
    expect(again.body.message).toBe('errors.member.already_anonymized');
  });
});
