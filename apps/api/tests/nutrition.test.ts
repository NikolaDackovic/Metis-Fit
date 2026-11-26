import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ExerciseDto, NutritionWizardBody, WorkoutPlanDto } from '@grit/validation';
import { computeTargets } from '../src/modules/nutrition/targets';
import { createHarness, setFakeMealPlanner, type Harness, type TestUser } from './harness';

let h: Harness;
let manager: TestUser;
let reception: TestUser;
let coach: TestUser;
let otherCoach: TestUser;
let trainerId: string;
let squat: ExerciseDto;

const wizard = (over: Partial<NutritionWizardBody> = {}): NutritionWizardBody => ({
  goal: 'lose',
  sex: 'male',
  age: 30,
  heightCm: 180,
  weightKg: 90,
  activity: 'moderate',
  trainingDays: 4,
  mealsPerDay: 4,
  restrictions: [],
  preferences: null,
  healthConditions: false,
  ...over,
});

beforeAll(async () => {
  h = await createHarness();
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
  coach = await h.user({ role: 'trainer' });
  otherCoach = await h.user({ role: 'trainer' });
  const t = await h.db
    .insertInto('trainers')
    .values({ user_id: coach.userId, first_name: 'Coach', last_name: 'Plan' })
    .returning('id')
    .executeTakeFirstOrThrow();
  trainerId = t.id;
  await h.db
    .insertInto('trainers')
    .values({ user_id: otherCoach.userId, first_name: 'Other', last_name: 'Coach' })
    .execute();
  const lib = (await h.http.get('/v1/public/exercises')).body.data as ExerciseDto[];
  squat = lib.find((e) => e.key === 'back_squat')!;
});
afterAll(async () => h?.close());
afterEach(() => setFakeMealPlanner(async () => null));

describe('nutrition targets (deterministic, safety limits)', () => {
  it('computes Mifflin-St Jeor and a moderate deficit', () => {
    const t = computeTargets(wizard());
    // BMR = 900 + 1125 - 150 + 5 = 1880; TDEE = 1880 × 1.55 = 2914
    expect(t.bmr).toBe(1880);
    expect(t.tdee).toBe(2910);
    expect(t.kcal).toBe(2330); // −20 %
    expect(t.proteinG).toBe(180); // 2 g/kg
    expect(t.weeklyChangeKg).toBeLessThan(0);
    expect(t.weeklyChangeKg).toBeGreaterThan(-0.75);
    expect(t.adjustedBy).toBeNull();
  });

  it('never puts an underweight person on a deficit and never goes below the floor', () => {
    const thin = computeTargets(
      wizard({ sex: 'female', weightKg: 48, heightCm: 172, goal: 'lose' }),
    );
    expect(thin.adjustedBy).toBe('nutrition.adjusted_underweight');
    expect(thin.kcal).toBeGreaterThanOrEqual(thin.tdee - 10);
    const small = computeTargets(
      wizard({ sex: 'female', weightKg: 55, heightCm: 155, age: 60, activity: 'sedentary' }),
    );
    expect(small.kcal).toBeGreaterThanOrEqual(1400);
    expect(small.adjustedBy).toBe('nutrition.adjusted_floor');
  });
});

describe('nutrition wizard', () => {
  it('without AI the member still gets targets (status targets_only)', async () => {
    const m = await h.user({ member: true });
    const r = await h.http.post('/v1/me/nutrition-plans').set(m.auth).send(wizard());
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({
      status: 'targets_only',
      meals: null,
      targets: { kcal: 2330 },
    });
    const latest = await h.http.get('/v1/me/nutrition-plans/latest').set(m.auth);
    expect(latest.body.data.id).toBe(r.body.data.id);
  });

  it('with AI the validated meal plan is stored and the planner gets the safe targets', async () => {
    let seen: number | undefined;
    setFakeMealPlanner(async ({ targets, locale }) => {
      seen = targets.kcal;
      expect(locale).toBe('ru');
      return {
        model: 'test-model',
        plan: {
          summary: 'План',
          meals: [
            {
              name: 'Завтрак',
              time: '08:00',
              options: [
                { title: 'Овсянка', ingredients: ['овсянка 80 г'], kcal: 500, proteinG: 30 },
              ],
            },
            {
              name: 'Обед',
              time: '13:00',
              options: [
                { title: 'Курица с рисом', ingredients: ['курица 200 г'], kcal: 700, proteinG: 55 },
              ],
            },
          ],
          tips: ['Пейте воду'],
        },
      };
    });
    const m = await h.user({ member: true });
    const r = await h.http
      .post('/v1/me/nutrition-plans')
      .query({ locale: 'ru' })
      .send(wizard())
      .set(m.auth);
    expect(r.status).toBe(201);
    expect(seen).toBe(2330);
    expect(r.body.data).toMatchObject({ status: 'ready', meals: { summary: 'План' } });
  });

  it('refuses minors and anyone reporting a health condition; limits daily use', async () => {
    const m = await h.user({ member: true });
    expect(
      (
        await h.http
          .post('/v1/me/nutrition-plans')
          .set(m.auth)
          .send(wizard({ age: 16 }))
      ).status,
    ).toBe(400);
    const sick = await h.http
      .post('/v1/me/nutrition-plans')
      .set(m.auth)
      .send(wizard({ healthConditions: true }));
    expect(sick.body.message).toBe('errors.nutrition.see_professional');
    for (let i = 0; i < 3; i += 1)
      expect((await h.http.post('/v1/me/nutrition-plans').set(m.auth).send(wizard())).status).toBe(
        201,
      );
    const fourth = await h.http.post('/v1/me/nutrition-plans').set(m.auth).send(wizard());
    expect(fourth.status).toBe(429);
    expect(fourth.body.message).toBe('errors.nutrition.daily_limit');
  });
});

describe('InBody measurements', () => {
  it('stores muscle mass, water and visceral fat and computes BMI from the latest height', async () => {
    const m = await h.user({ member: true });
    await h.http
      .post('/v1/me/measurements')
      .set(m.auth)
      .send({ id: randomUUID(), measuredOn: '2026-11-01', heightCm: 180, weightKg: 90 });
    const r = await h.http.post('/v1/me/measurements').set(m.auth).send({
      id: randomUUID(),
      measuredOn: '2026-11-15',
      weightKg: 88,
      muscleMassKg: 40.5,
      bodyWaterPct: 55,
      visceralFat: 9,
    });
    expect(r.body.data[0]).toMatchObject({
      weightKg: 88,
      muscleMassKg: 40.5,
      visceralFat: 9,
      bmi: 27.2,
    });
  });
});

describe('trainer workout plans', () => {
  const body = {
    title: 'Snaga - 3 dana',
    days: [
      {
        title: 'Dan A',
        items: [{ exerciseId: '', sets: 5, reps: '5', weightNote: '75% 1RM', restS: 180 }],
      },
      { title: 'Dan B', items: [] },
    ],
  };

  it('only the active trainer (or a manager) writes plans; the member sees active plans', async () => {
    const m = await h.user({ member: true });
    const plan = {
      ...body,
      days: [
        { ...body.days[0]!, items: [{ ...body.days[0]!.items[0]!, exerciseId: squat.id }] },
        body.days[1]!,
      ],
    };
    const url = `/v1/admin/members/${m.memberId}/workout-plans`;

    expect((await h.http.post(url).set(coach.auth).send(plan)).body.message).toBe(
      'errors.plan.not_your_client',
    );
    await h.http
      .post(`/v1/admin/trainers/${trainerId}/clients`)
      .set(manager.auth)
      .send({ memberId: m.memberId });
    const created = await h.http.post(url).set(coach.auth).send(plan);
    expect(created.status).toBe(201);
    const p = created.body.data as WorkoutPlanDto;
    expect(p).toMatchObject({ trainerName: 'Coach Plan', isActive: true });
    expect(p.days[0]!.items[0]).toMatchObject({ exerciseName: squat.name, sets: 5, reps: '5' });

    expect((await h.http.post(url).set(otherCoach.auth).send(plan)).status).toBe(403);
    expect((await h.http.get(url).set(reception.auth)).status).toBe(403);

    const mine = await h.http.get('/v1/me/workout-plans').set(m.auth);
    expect(mine.body.data).toHaveLength(1);

    const off = await h.http
      .put(`/v1/admin/workout-plans/${p.id}`)
      .set(manager.auth)
      .send({ ...plan, isActive: false });
    expect(off.status).toBe(200);
    expect((await h.http.get('/v1/me/workout-plans').set(m.auth)).body.data).toHaveLength(0);
  });
});

describe('meal plans: trainer plan > AI > club example', () => {
  const content = {
    summary: 'Individualni plan',
    meals: [
      {
        name: 'Doručak',
        time: '08:00',
        options: [{ title: 'Jaja', ingredients: ['3 jaja'], kcal: 300, proteinG: 20 }],
      },
      {
        name: 'Ručak',
        time: '13:00',
        options: [{ title: 'Piletina', ingredients: ['200 g'], kcal: 500, proteinG: 45 }],
      },
    ],
    tips: [],
  };

  it('a member sees the club example for their goal until the trainer writes a plan', async () => {
    const m = await h.user({ member: true });
    const first = await h.http.get('/v1/me/nutrition').query({ locale: 'ru' }).set(m.auth);
    expect(first.body.data).toMatchObject({ latest: null, source: 'template' });
    expect(first.body.data.meals.meals[0].name).toBe('Завтрак');

    await h.http
      .post('/v1/me/nutrition-plans')
      .set(m.auth)
      .send(wizard({ goal: 'gain' }));
    const gain = await h.http.get('/v1/me/nutrition').set(m.auth);
    expect(gain.body.data.meals.summary).toMatch(/mišićne mase/);

    await h.http
      .post(`/v1/admin/trainers/${trainerId}/clients`)
      .set(manager.auth)
      .send({ memberId: m.memberId });
    const put = await h.http
      .put(`/v1/admin/members/${m.memberId}/nutrition-plan`)
      .set(coach.auth)
      .send({ content });
    expect(put.status).toBe(200);
    const own = await h.http.get('/v1/me/nutrition').set(m.auth);
    expect(own.body.data).toMatchObject({
      source: 'trainer',
      trainerName: 'Coach Plan',
      meals: { summary: 'Individualni plan' },
    });

    expect(
      (
        await h.http
          .put(`/v1/admin/members/${m.memberId}/nutrition-plan`)
          .set(otherCoach.auth)
          .send({ content })
      ).status,
    ).toBe(403);
    await h.http.delete(`/v1/admin/members/${m.memberId}/nutrition-plan`).set(coach.auth);
    expect((await h.http.get('/v1/me/nutrition').set(m.auth)).body.data.source).toBe('template');
  });

  it('managers and trainers edit the club examples; reception cannot', async () => {
    const list = await h.http.get('/v1/admin/nutrition-templates').set(coach.auth);
    expect(list.body.data.map((x: { goal: string }) => x.goal)).toEqual([
      'lose',
      'maintain',
      'gain',
    ]);
    const body = { translations: { sr: content } };
    expect(
      (await h.http.put('/v1/admin/nutrition-templates/lose').set(reception.auth).send(body))
        .status,
    ).toBe(403);
    expect(
      (await h.http.put('/v1/admin/nutrition-templates/lose').set(manager.auth).send(body)).status,
    ).toBe(200);
    const m = await h.user({ member: true });
    await h.http
      .post('/v1/me/nutrition-plans')
      .set(m.auth)
      .send(wizard({ goal: 'lose' }));
    expect((await h.http.get('/v1/me/nutrition').set(m.auth)).body.data.meals.summary).toBe(
      'Individualni plan',
    );
  });
});
