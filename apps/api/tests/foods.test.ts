import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

/** F15-2: calorie counter (food catalog, barcode, own foods, amounts, copy a meal). */
let h: Harness;
let ana: TestUser;
let bob: TestUser;
const day = '2026-11-20';

beforeAll(async () => {
  h = await createHarness();
  ana = await h.user({ member: true });
  bob = await h.user({ member: true });
});
afterAll(async () => h?.close());
afterEach(() => vi.unstubAllGlobals());

const search = (u: TestUser, q: string) =>
  h.http
    .get('/v1/me/foods')
    .query({ q })
    .set(u.auth)
    .then((r) => r.body.data as Array<{ id: string; name: string; mine: boolean }>);

describe('calorie counter (F15-2)', () => {
  it('finds catalog foods by any word, without diacritics', async () => {
    const cevapi = await search(ana, 'cevap');
    expect(cevapi[0]!.name).toBe('Ćevapi');
    expect((await search(ana, 'pileće grudi')).map((f) => f.name)).toContain(
      'Pileće grudi, pečene',
    );
    expect((await search(ana, 'chicken breast'))[0]!.name).toBe('Pileće grudi, pečene');
    expect(await search(ana, 'x')).toEqual([]);
  });

  it('a food plus grams gives the right numbers; the diary remembers food and amount', async () => {
    const egg = (await search(ana, 'jaje')).find((f) => f.name === 'Jaje')!;
    const r = await h.http.post('/v1/me/food-log').set(ana.auth).send({
      id: randomUUID(),
      eatenOn: day,
      meal: 'breakfast',
      name: 'Jaje',
      kcal: 1, // only a preview: the server works it out
      foodId: egg.id,
      grams: 110,
    });
    expect(r.status).toBe(201);
    const e = r.body.data.entries[0];
    expect(e).toMatchObject({ kcal: 157, proteinG: 13.9, grams: 110, foodId: egg.id });
    // Without grams: one serving (55 g).
    const one = await h.http
      .post('/v1/me/food-log')
      .set(ana.auth)
      .send({
        id: randomUUID(),
        eatenOn: day,
        meal: 'snack',
        name: 'Jaje',
        kcal: 0,
        foodId: egg.id,
      });
    expect(one.body.data.entries[1].kcal).toBe(79);
    // Recently used foods come back for the empty search.
    const lists = await h.http.get('/v1/me/foods').set(ana.auth);
    expect(lists.body.data.recent[0].id).toBe(egg.id);
  });

  it('own foods are private and searchable; the limit on macros is checked', async () => {
    const mine = await h.http.post('/v1/me/foods').set(ana.auth).send({
      name: 'Zdravkova kaša',
      servingG: 300,
      servingLabel: '1 činija',
      kcal100: 120,
      protein100: 8,
      carbs100: 15,
      fat100: 3,
      barcode: '1234567890123',
    });
    expect(mine.status).toBe(201);
    expect((await search(ana, 'zdravkov'))[0]).toMatchObject({ name: 'Zdravkova kaša', mine: true });
    expect(await search(bob, 'zdravkov')).toEqual([]);
    expect((await h.http.get(`/v1/me/foods/${mine.body.data.id}`).set(bob.auth)).status).toBe(404);
    // My own barcode is found without asking anyone outside.
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const byCode = await h.http.get('/v1/me/foods/barcode/1234567890123').set(ana.auth);
    expect(byCode.body.data.name).toBe('Zdravkova kaša');
    expect(fetchSpy).not.toHaveBeenCalled();
    const bad = await h.http.post('/v1/me/foods').set(ana.auth).send({
      name: 'Nemoguće',
      servingG: 100,
      kcal100: 500,
      protein100: 60,
      carbs100: 60,
      fat100: 10,
    });
    expect(bad.status).toBe(400);
  });

  it('an unknown barcode is looked up in Open Food Facts once, then cached', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          product_name: 'Proteinski jogurt',
          brands: 'Mlekara, Druga',
          serving_quantity: 200,
          nutriments: {
            'energy-kcal_100g': 70,
            proteins_100g: 10,
            carbohydrates_100g: 5,
            fat_100g: 1,
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    const r = await h.http.get('/v1/me/foods/barcode/8600000000017').set(bob.auth);
    expect(r.body.data).toMatchObject({
      name: 'Proteinski jogurt',
      brand: 'Mlekara',
      servingG: 200,
      kcal100: 70,
      protein100: 10,
    });
    expect(String(fetchSpy.mock.calls[0]![0])).toContain('/product/8600000000017.json');
    // Second time (any member) it comes from the cache.
    await h.http.get('/v1/me/foods/barcode/8600000000017').set(ana.auth);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Not found anywhere.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 0 }) }),
    );
    const none = await h.http.get('/v1/me/foods/barcode/8600000000999').set(bob.auth);
    expect(none.body.message).toBe('errors.food.barcode_not_found');
  });

  it('copies yesterday’s meal to today', async () => {
    const r = await h.http
      .post('/v1/me/food-log/copy')
      .set(ana.auth)
      .send({ from: day, to: '2026-11-21', meal: 'breakfast' });
    expect(r.status).toBe(201);
    expect(r.body.data.entries).toHaveLength(1);
    expect(r.body.data.entries[0]).toMatchObject({ meal: 'breakfast', kcal: 157, grams: 110 });
    const empty = await h.http
      .post('/v1/me/food-log/copy')
      .set(ana.auth)
      .send({ from: '2026-01-01', to: '2026-11-21' });
    expect(empty.body.message).toBe('errors.food_log.nothing_to_copy');
  });
});
