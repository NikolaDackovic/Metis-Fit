import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, signToken, type Harness, type TestUser } from './harness';

let h: Harness;
let owner: TestUser;
let manager: TestUser;
let reception: TestUser;

beforeAll(async () => {
  h = await createHarness();
  owner = await h.user({ role: 'owner', aal: 'aal2' });
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
});
afterAll(async () => h?.close());

const authOf = async (userId: string) => ({
  Authorization: `Bearer ${await signToken(userId, 'aal2')}`,
});

describe('staff and roles', () => {
  it('a manager adds a staff member; the new account works with its role at once', async () => {
    expect(
      (
        await h.http
          .post('/v1/admin/staff')
          .set(reception.auth)
          .send({ email: 'x@grit.test', firstName: 'X', lastName: 'Y', roles: ['reception'] })
      ).status,
    ).toBe(403);
    const res = await h.http
      .post('/v1/admin/staff')
      .set(manager.auth)
      .send({
        email: 'Marko@Grit.test',
        firstName: 'Marko',
        lastName: 'Šank',
        roles: ['cafe_staff'],
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      email: 'marko@grit.test',
      roles: ['cafe_staff'],
      deactivated: false,
    });
    const marko = await authOf(res.body.data.userId);
    expect((await h.http.get('/v1/admin/cafe/orders').set(marko)).status).toBe(200);
    expect((await h.http.get('/v1/admin/members').set(marko)).status).toBe(403);

    // Deactivation removes access immediately; reactivation restores it.
    await h.http
      .post(`/v1/admin/staff/${res.body.data.userId}/active`)
      .set(manager.auth)
      .send({ active: false })
      .expect(200);
    expect((await h.http.get('/v1/admin/cafe/orders').set(marko)).status).toBe(403);
    await h.http
      .post(`/v1/admin/staff/${res.body.data.userId}/active`)
      .set(manager.auth)
      .send({ active: true })
      .expect(200);
    expect((await h.http.get('/v1/admin/cafe/orders').set(marko)).status).toBe(200);
  });

  it('protects the owner role and your own account', async () => {
    const s = await h.http
      .post('/v1/admin/staff')
      .set(manager.auth)
      .send({ email: 'ana@grit.test', firstName: 'Ana', lastName: 'R', roles: ['reception'] });
    const id = s.body.data.userId;
    const makeOwner = await h.http
      .put(`/v1/admin/staff/${id}`)
      .set(manager.auth)
      .send({ roles: ['owner'] });
    expect(makeOwner.body.message).toBe('errors.staff.owner_only');
    expect(
      (
        await h.http
          .put(`/v1/admin/staff/${id}`)
          .set(owner.auth)
          .send({ roles: ['owner'] })
      ).status,
    ).toBe(200);
    const self = await h.http
      .put(`/v1/admin/staff/${manager.userId}`)
      .set(manager.auth)
      .send({ roles: [] });
    expect(self.body.message).toBe('errors.staff.not_yourself');
    // Removing the other owner works while one owner remains.
    expect(
      (
        await h.http
          .put(`/v1/admin/staff/${id}`)
          .set(owner.auth)
          .send({ roles: ['reception'] })
      ).status,
    ).toBe(200);
    const list = await h.http.get('/v1/admin/staff').set(manager.auth);
    expect(list.body.data.find((x: { userId: string }) => x.userId === id).roles).toEqual([
      'reception',
    ]);
  });

  it('the owner edits role permissions and creates custom roles; the owner role is locked', async () => {
    expect(
      (
        await h.http
          .put('/v1/admin/roles/reception/permissions')
          .set(manager.auth)
          .send({ permissions: [] })
      ).status,
    ).toBe(403);
    expect(
      (
        await h.http
          .put('/v1/admin/roles/owner/permissions')
          .set(owner.auth)
          .send({ permissions: [] })
      ).body.message,
    ).toBe('errors.staff.role_locked');
    const created = await h.http
      .post('/v1/admin/roles')
      .set(owner.auth)
      .send({ key: 'cafe_lead', name: 'Šef kafića', copyFrom: 'cafe_staff' });
    expect(created.status).toBe(201);
    await h.http
      .put('/v1/admin/roles/cafe_lead/permissions')
      .set(owner.auth)
      .send({ permissions: ['cafe.orders', 'cafe.manage', 'not.a_permission'] })
      .expect(200);
    const roles = await h.http.get('/v1/admin/roles').set(manager.auth);
    const lead = roles.body.data.roles.find((r: { key: string }) => r.key === 'cafe_lead');
    expect(lead).toMatchObject({ name: 'Šef kafića', isSystem: false });
    expect(lead.permissions.sort()).toEqual(['cafe.manage', 'cafe.orders']);
    expect(roles.body.data.roles.find((r: { key: string }) => r.key === 'owner').locked).toBe(true);
    expect(roles.body.data.roles.some((r: { key: string }) => r.key === 'member')).toBe(false);

    const u = await h.http
      .post('/v1/admin/staff')
      .set(manager.auth)
      .send({ email: 'lead@grit.test', firstName: 'Lea', lastName: 'K', roles: ['cafe_lead'] });
    expect((await h.http.delete('/v1/admin/roles/cafe_lead').set(owner.auth)).body.message).toBe(
      'errors.staff.role_in_use',
    );
    // The invite returns exactly the new person (regression: it once returned the first staff member).
    expect(u.body.data).toMatchObject({ firstName: 'Lea', roles: ['cafe_lead'] });
    const upd = await h.http
      .put(`/v1/admin/staff/${u.body.data.userId}`)
      .set(owner.auth)
      .send({ roles: ['cafe_staff'] });
    expect(upd.body.data).toMatchObject({ firstName: 'Lea', roles: ['cafe_staff'] });
    expect((await h.http.delete('/v1/admin/roles/cafe_lead').set(owner.auth)).status).toBe(200);
    expect((await h.http.delete('/v1/admin/roles/reception').set(owner.auth)).body.message).toBe(
      'errors.staff.role_locked',
    );
  });
});

describe('trainer schedule', () => {
  it('a trainer plans their own appointments, sees classes they lead, and the member is told', async () => {
    const coachUser = await h.user({ role: 'trainer', aal: 'aal2' });
    const t = await h.http
      .post('/v1/admin/trainers')
      .set(manager.auth)
      .send({
        firstName: 'Iva',
        lastName: 'Trener',
        isPublic: false,
        translations: { sr: { title: 'Trener' } },
      });
    const trainerId = t.body.data.id;
    // Link the trainer profile to the account (from the staff screen).
    await h.http
      .put(`/v1/admin/staff/${coachUser.userId}`)
      .set(manager.auth)
      .send({ roles: ['trainer'], trainerId })
      .expect(200);
    const other = await h.http
      .post('/v1/admin/trainers')
      .set(manager.auth)
      .send({
        firstName: 'Ivo',
        lastName: 'Drugi',
        isPublic: false,
        translations: { sr: { title: 'Trener' } },
      });

    const m = await h.user({ member: true });
    const day = await sql<{ d: string }>`select (public.club_today() + 1)::text as d`
      .execute(h.db)
      .then((r) => r.rows[0]!.d);
    const startsAt = `${day}T10:00:00+01:00`;
    const appt = (trainer: string, start = startsAt) =>
      h.http.post('/v1/admin/appointments').set(coachUser.auth).send({
        trainerId: trainer,
        memberId: m.memberId,
        kind: 'pt',
        startsAt: start,
        durationMin: 60,
        location: 'Sala 1',
      });

    expect((await appt(trainerId)).status).toBe(201);
    expect((await appt(other.body.data.id)).status).toBe(403);
    expect((await appt(trainerId, `${day}T10:30:00+01:00`)).body.message).toBe(
      'errors.appointment.overlap',
    );

    const sched = await h.http
      .get(`/v1/admin/my-schedule?from=${day}&to=${day}`)
      .set(coachUser.auth);
    expect(sched.status).toBe(200);
    expect(sched.body.data).toEqual([
      expect.objectContaining({
        type: 'appointment',
        kind: 'pt',
        location: 'Sala 1',
        memberName: expect.any(String),
      }),
    ]);
    // The front desk sees every trainer's schedule.
    const all = await h.http
      .get(`/v1/admin/trainer-schedule?from=${day}&to=${day}`)
      .set(reception.auth);
    expect(all.body.data.length).toBeGreaterThanOrEqual(1);

    const mine = await h.http.get('/v1/me/appointments').set(m.auth);
    expect(mine.body.data[0]).toMatchObject({ kind: 'pt', trainerName: 'Iva Trener' });
    const inbox = await h.http.get('/v1/me/notifications').set(m.auth);
    expect(inbox.body.data.items[0]).toMatchObject({ kind: 'appointment_booked' });

    await h.http
      .post(`/v1/admin/appointments/${sched.body.data[0].id}/status`)
      .set(coachUser.auth)
      .send({ status: 'cancelled' })
      .expect(200);
    expect((await h.http.get('/v1/me/appointments').set(m.auth)).body.data).toEqual([]);
    // A cancelled slot can be booked again.
    expect((await appt(trainerId)).status).toBe(201);
  });
});
