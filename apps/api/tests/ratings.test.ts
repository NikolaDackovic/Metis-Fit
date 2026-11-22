import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runNotificationJobs } from '../src/modules/notifications/jobs';
import { createHarness, type Harness, type TestUser } from './harness';

/** F13-7: members rate classes and personal sessions they had; owners see averages. */
let h: Harness;
let manager: TestUser;
let reception: TestUser;
let trainerId: string;
let classTypeId: string;

/** A class that ended `endedMinAgo` minutes ago, with the member booked on it. */
async function pastClass(m: TestUser, endedMinAgo = 60) {
  const c = await sql<{ id: string }>`
    insert into classes (class_type_id, trainer_id, starts_at, ends_at, capacity)
    values (${classTypeId}, ${trainerId}, now() - make_interval(mins => ${endedMinAgo + 60}),
            now() - make_interval(mins => ${endedMinAgo}), 10)
    returning id`
    .execute(h.db)
    .then((r) => r.rows[0]!.id);
  return sql<{ id: string }>`
    insert into bookings (class_id, member_id, status) values (${c}, ${m.memberId}, 'confirmed')
    returning id`
    .execute(h.db)
    .then((r) => r.rows[0]!.id);
}
const rate = (m: TestUser, id: string, stars: number, comment?: string) =>
  h.http.post('/v1/me/ratings').set(m.auth).send({ kind: 'class', id, stars, comment });

beforeAll(async () => {
  h = await createHarness();
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
  trainerId = (
    await h.db
      .insertInto('trainers')
      .values({ first_name: 'Marko', last_name: 'Trener', is_public: true })
      .returning('id')
      .executeTakeFirstOrThrow()
  ).id;
  classTypeId = await sql<{ id: string }>`
    insert into class_types (key, zone_id) values ('pilates_test', (select id from zones limit 1))
    returning id`
    .execute(h.db)
    .then((r) => r.rows[0]!.id);
  await sql`insert into class_type_translations (class_type_id, locale, name) values (${classTypeId}, 'sr', 'Pilates')`.execute(
    h.db,
  );
});
afterAll(async () => h?.close());

describe('ratings (F13-7)', () => {
  it('a member rates a class they had, once; it leaves the "to rate" list', async () => {
    const m = await h.user({ member: true });
    const booking = await pastClass(m);
    const pending = await h.http.get('/v1/me/ratings/pending').set(m.auth);
    expect(pending.body.data).toEqual([
      expect.objectContaining({
        kind: 'class',
        id: booking,
        title: 'Pilates',
        trainerName: 'Marko Trener',
      }),
    ]);
    expect((await rate(m, booking, 5, 'Odličan trening!')).status).toBe(201);
    expect((await rate(m, booking, 4)).body.message).toBe('errors.rating.already');
    expect((await h.http.get('/v1/me/ratings/pending').set(m.auth)).body.data).toEqual([]);
  });

  it('cannot rate a class that has not ended or that someone else had', async () => {
    const m = await h.user({ member: true });
    const other = await h.user({ member: true });
    const future = await pastClass(m, -120); // ends in two hours
    expect((await rate(m, future, 5)).body.message).toBe('errors.rating.not_allowed');
    const theirs = await pastClass(other);
    expect((await rate(m, theirs, 5)).body.message).toBe('errors.rating.not_allowed');
  });

  it('owners see averages and comments; the app shows the trainer average from 3 ratings', async () => {
    for (const stars of [4, 3]) {
      const m = await h.user({ member: true });
      expect((await rate(m, await pastClass(m), stars)).status).toBe(201);
    }
    const s = await h.http.get('/v1/admin/ratings').set(manager.auth);
    expect(s.status).toBe(200);
    expect(s.body.data.byTrainer[0]).toMatchObject({ name: 'Marko Trener', avg: 4, count: 3 });
    expect(s.body.data.byClassType[0]).toMatchObject({ name: 'Pilates', count: 3 });
    expect(s.body.data.latest.map((r: { comment: string | null }) => r.comment)).toContain(
      'Odličan trening!',
    );
    expect((await h.http.get('/v1/admin/ratings').set(reception.auth)).status).toBe(403);
    const pub = await h.http.get('/v1/public/trainers');
    expect(pub.body.data.find((t: { id: string }) => t.id === trainerId)).toMatchObject({
      rating: { avg: 4, count: 3 },
    });
  });

  it('after a class the member is asked how it was (once)', async () => {
    const m = await h.user({ member: true });
    await pastClass(m, 40);
    await runNotificationJobs(h.db, null, new Date('2030-01-08T02:00:00Z'));
    await runNotificationJobs(h.db, null, new Date('2030-01-08T02:00:00Z'));
    const inbox = await h.http.get('/v1/me/notifications').set(m.auth);
    const prompts = inbox.body.data.items.filter(
      (n: { kind: string }) => n.kind === 'rating_prompt',
    );
    expect(prompts).toHaveLength(1);
    expect(prompts[0].params).toMatchObject({ class: 'Pilates' });
  });
});
