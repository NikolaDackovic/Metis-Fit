import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deliverFiscal, type PosSale, type PosSender } from '../src/modules/cafe/pos';
import { runNotificationJobs } from '../src/modules/notifications/jobs';
import type { PushMessage, PushSender } from '../src/modules/notifications/push';
import { createHarness, type Harness, type TestUser } from './harness';

/**
 * F12-6: work that runs outside a request (notification jobs, POS hand-over) and the
 * account-wide actions (export, erasure) must respect every gym the person belongs to.
 */
let h: Harness;
let other: string;
let gritManager: TestUser;
const NEUTRAL = new Date('2030-01-08T02:00:00Z');

beforeAll(async () => {
  h = await createHarness();
  other = (
    await h.db
      .insertInto('clubs')
      .values({ slug: 'pozadina-klub', name: 'Pozadina klub', status: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow()
  ).id;
  await sql`insert into roles (club_id, key, is_system)
            select ${other}, key, is_system from roles where club_id = (select id from clubs where is_default)`.execute(
    h.db,
  );
  await sql`insert into role_permissions (club_id, role_id, permission_key)
            select ${other}, rb.id, rp.permission_key
            from role_permissions rp
            join roles ra on ra.id = rp.role_id and ra.club_id = (select id from clubs where is_default)
            join roles rb on rb.key = ra.key and rb.club_id = ${other}`.execute(h.db);
  await sql`insert into settings (club_id, key, value) values (${other}, 'club.short_name', '"POZADINA"')
            on conflict (club_id, key) do update set value = excluded.value`.execute(h.db);
  gritManager = await h.user({ role: 'manager', aal: 'aal2' });
});
afterAll(async () => h?.close());

/** A second member row of the same account, in the other gym. */
const joinOther = (u: TestUser, extra: Record<string, unknown> = {}) =>
  h.db
    .insertInto('members')
    .values({
      user_id: u.userId,
      first_name: 'Dvostruki',
      last_name: 'Clan',
      email: `dvostruki-${randomUUID()}@example.com`,
      club_id: other,
      ...extra,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
    .then((r) => r.id);

describe('background work per gym (F12-6)', () => {
  it('a notification belongs to the gym of the member row and the push names that gym', async () => {
    const u = await h.user({});
    const today = await sql<{ d: string }>`select public.club_today()::text as d`
      .execute(h.db)
      .then((r) => r.rows[0]!.d);
    await joinOther(u, { date_of_birth: today.replace(/^\d{4}/, '1990') });
    await h.http
      .post('/v1/me/push-tokens')
      .set(u.auth)
      .send({ token: 'ExponentPushToken[pozadina0001]', platform: 'android' })
      .expect(200);
    const sent: PushMessage[] = [];
    const sender: PushSender = {
      send: async (msgs) => {
        sent.push(...msgs);
        return msgs.map(() => 'ok');
      },
    };
    await runNotificationJobs(h.db, sender, NEUTRAL);
    const n = await h.db
      .selectFrom('notifications')
      .select(['club_id', 'kind'])
      .where('user_id', '=', u.userId)
      .execute();
    expect(n).toEqual([{ club_id: other, kind: 'birthday' }]);
    const mine = sent.filter((m) => m.to === 'ExponentPushToken[pozadina0001]');
    expect(mine).toHaveLength(1);
    expect(mine[0]!.body).toContain('POZADINA');
  });

  it("paid café orders go only to their own gym's POS", async () => {
    await sql`insert into settings (club_id, key, value) values
                (${other}, 'cafe.pos_mode', '"webhook"'),
                (${other}, 'cafe.pos_url', '"https://pos-b.example.test/sale"')
              on conflict (club_id, key) do update set value = excluded.value`.execute(h.db);
    // The default gym has no POS configured.
    await sql`delete from settings where key in ('cafe.pos_mode', 'cafe.pos_url')
              and club_id = (select id from clubs where is_default)`.execute(h.db);
    const order = (club: string) =>
      sql<{ id: string }>`
        insert into cafe_orders (club_id, number, source, payment_status, payment_method, paid_at,
                                 total_amount, guest_token, fiscal_status)
        values (${club}, 1, 'bar', 'paid', 'cash', now(), 25000, ${randomUUID()}, 'pending')
        returning id`
        .execute(h.db)
        .then((r) => r.rows[0]!.id);
    const inOther = await order(other);
    const inGrit = await order(
      (
        await h.db
          .selectFrom('clubs')
          .select('id')
          .where('is_default', '=', true)
          .executeTakeFirstOrThrow()
      ).id,
    );
    const calls: Array<{ url: string; sale: PosSale }> = [];
    const sender: PosSender = async (url, sale) => {
      calls.push({ url, sale });
      return { ok: true, reference: 'B-1' };
    };
    expect(await deliverFiscal(h.db, sender)).toBe(1);
    expect(calls).toEqual([
      {
        url: 'https://pos-b.example.test/sale',
        sale: expect.objectContaining({ orderId: inOther }),
      },
    ]);
    const grit = await h.db
      .selectFrom('cafe_orders')
      .select('fiscal_status')
      .where('id', '=', inGrit)
      .executeTakeFirstOrThrow();
    expect(grit.fiscal_status).toBe('pending');
  });
});

describe('export and erasure across gyms (F12-6)', () => {
  it('the export contains the member data of every gym', async () => {
    const u = await h.user({ member: true });
    await joinOther(u);
    const exp = await h.http.get('/v1/me/export').set(u.auth);
    expect(exp.status).toBe(200);
    expect(exp.body.data.member.id).toBe(u.memberId);
    expect(exp.body.data.otherGyms).toHaveLength(1);
    expect(exp.body.data.otherGyms[0]).toMatchObject({
      gym: { id: other, name: 'Pozadina klub' },
      member: { first_name: 'Dvostruki' },
    });
  });

  it('erasure at one desk keeps the account when the person belongs to another gym', async () => {
    const u = await h.user({ member: true });
    const elsewhere = await joinOther(u);
    const ok = await h.http
      .post(`/v1/admin/members/${u.memberId}/erase`)
      .set(gritManager.auth)
      .send({ reason: 'Zahtev člana' });
    expect(ok.status).toBe(200);
    const users = await sql`select 1 from auth.users where id = ${u.userId}`.execute(h.db);
    expect(users.rows).toHaveLength(1);
    const still = await h.db
      .selectFrom('members')
      .select(['user_id', 'anonymized_at'])
      .where('id', '=', elsewhere)
      .executeTakeFirstOrThrow();
    expect(still).toMatchObject({ user_id: u.userId, anonymized_at: null });
    // The app still works in the other gym.
    const me = await h.http.get('/v1/me').set(u.auth).set('X-Club', 'pozadina-klub');
    expect(me.body.data.member.id).toBe(elsewhere);
  });

  it('staff of another gym cannot delete their account from the app', async () => {
    const u = await h.user({ member: true });
    const role = await h.db
      .selectFrom('roles')
      .select('id')
      .where('club_id', '=', other)
      .where('key', '=', 'reception')
      .executeTakeFirstOrThrow();
    await h.db
      .insertInto('user_roles')
      .values({ user_id: u.userId, role_id: role.id, club_id: other })
      .execute();
    const r = await h.http.post('/v1/me/delete-account').set(u.auth).send({ confirm: true });
    expect(r.body.message).toBe('errors.account.staff_cannot_delete');
  });

  it('deleting the account anonymizes the member row in every gym', async () => {
    const u = await h.user({ member: true });
    const elsewhere = await joinOther(u);
    const del = await h.http.post('/v1/me/delete-account').set(u.auth).send({ confirm: true });
    expect(del.status).toBe(200);
    const rows = await h.db
      .selectFrom('members')
      .select(['user_id', 'first_name', 'anonymized_at'])
      .where('id', 'in', [u.memberId!, elsewhere])
      .execute();
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.user_id).toBeNull();
      expect(r.first_name).toBe('Obrisan');
      expect(r.anonymized_at).not.toBeNull();
    }
  });
});
