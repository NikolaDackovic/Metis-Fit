import type { ExerciseDto } from '@grit/validation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

/** F17-2: program templates assigned to many clients, and the trainer dashboard. */
let h: Harness;
let coach: TestUser;
let other: TestUser;
let ana: TestUser;
let bob: TestUser;
let stranger: TestUser;
let trainerId: string;
let squat: ExerciseDto;

const days = () => [
  {
    title: 'Dan A',
    items: [{ exerciseId: squat.id, sets: 4, reps: '8-10', weightNote: '70% 1RM', restS: 120 }],
  },
];

beforeAll(async () => {
  h = await createHarness();
  coach = await h.user({ role: 'trainer' });
  other = await h.user({ role: 'trainer' });
  ana = await h.user({ member: true });
  bob = await h.user({ member: true });
  stranger = await h.user({ member: true });
  trainerId = (
    await h.db
      .insertInto('trainers')
      .values({ user_id: coach.userId, first_name: 'Tea', last_name: 'Šablon' })
      .returning('id')
      .executeTakeFirstOrThrow()
  ).id;
  await h.db
    .insertInto('trainers')
    .values({ user_id: other.userId, first_name: 'Drugi', last_name: 'Trener' })
    .execute();
  await h.db
    .insertInto('trainer_clients')
    .values([
      { trainer_id: trainerId, member_id: ana.memberId!, status: 'active' },
      { trainer_id: trainerId, member_id: bob.memberId!, status: 'active' },
    ])
    .execute();
  const lib = (await h.http.get('/v1/public/exercises')).body.data as ExerciseDto[];
  squat = lib.find((e) => e.key === 'back_squat')!;
});
afterAll(async () => h?.close());

describe('program templates (F17-2)', () => {
  it('a trainer saves a template and gives it to two clients at once', async () => {
    const dash0 = await h.http.get('/v1/admin/my-dashboard').set(coach.auth);
    expect(dash0.body.data).toMatchObject({ clients: 2, activePrograms: 0 });
    expect(dash0.body.data.waiting).toHaveLength(2);

    const created = await h.http
      .post('/v1/admin/workout-templates')
      .set(coach.auth)
      .send({ title: 'Snaga 3x nedeljno', days: days() });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    const list = await h.http.get('/v1/admin/workout-templates').set(coach.auth);
    expect(list.body.data[0]).toMatchObject({ title: 'Snaga 3x nedeljno', mine: true });
    expect(list.body.data[0].days[0].items[0]).toMatchObject({ sets: 4, reps: '8-10' });

    const assigned = await h.http
      .post(`/v1/admin/workout-templates/${id}/assign`)
      .set(coach.auth)
      .send({ memberIds: [ana.memberId, bob.memberId] });
    expect(assigned.body.data).toEqual({ created: 2 });
    const anaPlans = await h.http.get('/v1/me/workout-plans').set(ana.auth);
    expect(anaPlans.body.data[0]).toMatchObject({ title: 'Snaga 3x nedeljno' });

    const dash = await h.http.get('/v1/admin/my-dashboard').set(coach.auth);
    expect(dash.body.data).toMatchObject({ clients: 2, activePrograms: 2, waiting: [] });
  });

  it('private templates stay private; only own clients; only the author edits', async () => {
    const mine = await h.http
      .post('/v1/admin/workout-templates')
      .set(coach.auth)
      .send({ title: 'Samo moj', days: days() });
    const id = mine.body.data.id as string;
    // Another trainer neither sees it nor can change or use it.
    const seen = await h.http.get('/v1/admin/workout-templates').set(other.auth);
    expect(seen.body.data.map((t: { id: string }) => t.id)).not.toContain(id);
    expect(
      (
        await h.http
          .put(`/v1/admin/workout-templates/${id}`)
          .set(other.auth)
          .send({ title: 'Tuđe', days: days() })
      ).status,
    ).toBe(403);
    // Not my client: refused, nothing created.
    const refused = await h.http
      .post(`/v1/admin/workout-templates/${id}/assign`)
      .set(coach.auth)
      .send({ memberIds: [stranger.memberId] });
    expect(refused.body.message).toBe('errors.plan.not_your_client');
    // Shared: the other trainer sees it (read-only).
    await h.http
      .put(`/v1/admin/workout-templates/${id}`)
      .set(coach.auth)
      .send({ title: 'Za sve', shared: true, days: days() });
    const shared = await h.http.get('/v1/admin/workout-templates').set(other.auth);
    expect(shared.body.data.find((t: { id: string }) => t.id === id)).toMatchObject({
      title: 'Za sve',
      mine: false,
    });
    // Members cannot reach templates at all.
    expect((await h.http.get('/v1/admin/workout-templates').set(ana.auth)).status).toBe(403);
    expect(
      (await h.http.delete(`/v1/admin/workout-templates/${id}`).set(coach.auth)).body.data,
    ).toEqual({ ok: true });
  });
});
