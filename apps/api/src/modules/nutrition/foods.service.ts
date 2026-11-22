import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { FoodDto, FoodInput, FoodListsDto } from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { AppError } from '../../shared/errors';

/**
 * F15-2 food catalog for the calorie counter: the starting catalog, foods found by barcode in
 * Open Food Facts (cached), and each member's own foods (private).
 */
const MAX_OWN = 300;
const n = (v: unknown) => Math.round(Number(v ?? 0) * 10) / 10;
/** Same folding as the generated `foods.search` column: lower case, no Serbian diacritics. */
export const fold = (s: string) =>
  s.toLowerCase().replace(/č|ć/g, 'c').replace(/ž/g, 'z').replace(/š/g, 's').replace(/đ/g, 'd');

const COLS = [
  'id',
  'name',
  'name_en',
  'brand',
  'barcode',
  'serving_g',
  'serving_label',
  'kcal_100g',
  'protein_100g',
  'carbs_100g',
  'fat_100g',
  'owner_id',
] as const;
type Row = {
  id: string;
  name: string;
  name_en: string | null;
  brand: string | null;
  barcode: string | null;
  serving_g: unknown;
  serving_label: string | null;
  kcal_100g: unknown;
  protein_100g: unknown;
  carbs_100g: unknown;
  fat_100g: unknown;
  owner_id: string | null;
};
const toDto = (r: Row, userId: string): FoodDto => ({
  id: r.id,
  name: r.name,
  nameEn: r.name_en,
  brand: r.brand,
  barcode: r.barcode,
  servingG: n(r.serving_g),
  servingLabel: r.serving_label,
  kcal100: n(r.kcal_100g),
  protein100: n(r.protein_100g),
  carbs100: n(r.carbs_100g),
  fat100: n(r.fat_100g),
  mine: r.owner_id === userId,
});

/** A food the member may use: public (catalog, Open Food Facts) or their own. */
export async function visibleFood(tx: Tx, userId: string, id: string) {
  const r = await tx
    .selectFrom('foods')
    .select([...COLS])
    .where('id', '=', id)
    .where((eb) => eb.or([eb('owner_id', 'is', null), eb('owner_id', '=', userId)]))
    .executeTakeFirst();
  if (!r) throw new AppError('NOT_FOUND', 'errors.food.not_found');
  return r;
}

/** Amounts from a food and grams (kcal whole, macros to one decimal). */
export function portion(f: Row, grams: number) {
  const k = grams / 100;
  return {
    kcal: Math.round(n(f.kcal_100g) * k),
    protein_g: n(n(f.protein_100g) * k),
    carbs_g: n(n(f.carbs_100g) * k),
    fat_g: n(n(f.fat_100g) * k),
  };
}

type OffProduct = {
  product_name?: string;
  product_name_sr?: string;
  product_name_en?: string;
  brands?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
};

/**
 * Open Food Facts by barcode. Only the barcode leaves the server (no member data); 5 s timeout;
 * anything incomplete or odd counts as "not found" so a member never logs nonsense.
 */
async function openFoodFacts(code: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_sr,product_name_en,brands,serving_quantity,nutriments`,
      { headers: { 'user-agent': 'MetisFit/1.0 (calorie counter)' }, signal: ctrl.signal },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { status?: number; product?: OffProduct };
    const p = j.product;
    if (j.status !== 1 || !p) return null;
    const nu = p.nutriments ?? {};
    const num = (k: string) => {
      const v = Number(nu[k]);
      return Number.isFinite(v) && v >= 0 ? v : null;
    };
    const kcal = num('energy-kcal_100g') ?? (num('energy_100g') ?? NaN) / 4.184;
    const name = (p.product_name_sr || p.product_name || p.product_name_en || '').trim();
    if (!name || !Number.isFinite(kcal) || kcal > 900) return null;
    const clamp = (v: number | null) => Math.min(100, Math.max(0, n(v ?? 0)));
    const serving = Number(p.serving_quantity);
    return {
      name: name.slice(0, 120),
      name_en: p.product_name_en?.trim().slice(0, 120) || null,
      brand: p.brands?.split(',')[0]?.trim().slice(0, 80) || null,
      serving_g: Number.isFinite(serving) && serving > 0 && serving <= 2000 ? n(serving) : 100,
      kcal_100g: n(kcal),
      protein_100g: clamp(num('proteins_100g')),
      carbs_100g: clamp(num('carbohydrates_100g')),
      fat_100g: clamp(num('fat_100g')),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function createFoodsService(db: Kysely<DB>) {
  const asUser = <T>(actor: Actor, fn: (tx: Tx, userId: string) => Promise<T>) =>
    withStaffTx(db, (tx) => fn(tx, actor.userId));

  return {
    /** Search by any words in the name or brand ("cevap" finds "Ćevapi"); my foods first. */
    search: (actor: Actor, q: string): Promise<FoodDto[]> =>
      asUser(actor, async (tx, userId) => {
        const words = fold(q)
          .split(/\s+/)
          .map((w) => w.replace(/[%_\\]/g, ''))
          .filter((w) => w.length >= 2)
          .slice(0, 5);
        if (!words.length) return [];
        let query = tx
          .selectFrom('foods')
          .select([...COLS])
          .where((eb) => eb.or([eb('owner_id', 'is', null), eb('owner_id', '=', userId)]));
        for (const w of words) query = query.where('search', 'like', `%${w}%`);
        const rows = await query
          .orderBy(sql`owner_id is null`)
          .orderBy(sql`search like ${`${words[0]}%`}`, 'desc')
          .orderBy(sql`length(name)`)
          .limit(30)
          .execute();
        return rows.map((r) => toDto(r, userId));
      }),

    /** For the empty search: what I logged lately, and my own foods. */
    lists: (actor: Actor): Promise<FoodListsDto> =>
      asUser(actor, async (tx, userId) => {
        const recent = await tx
          .selectFrom('foods as f')
          .innerJoin(
            (eb) =>
              eb
                .selectFrom('food_log_entries')
                .select(['food_id', sql<Date>`max(created_at)`.as('last')])
                .where('user_id', '=', userId)
                .where('food_id', 'is not', null)
                .groupBy('food_id')
                .as('l'),
            (j) => j.onRef('l.food_id', '=', 'f.id'),
          )
          .select(COLS.map((c) => `f.${c}` as const))
          .where((eb) => eb.or([eb('f.owner_id', 'is', null), eb('f.owner_id', '=', userId)]))
          .orderBy('l.last', 'desc')
          .limit(20)
          .execute();
        const mine = await tx
          .selectFrom('foods')
          .select([...COLS])
          .where('owner_id', '=', userId)
          .orderBy('name')
          .limit(100)
          .execute();
        return {
          recent: recent.map((r) => toDto(r as Row, userId)),
          mine: mine.map((r) => toDto(r, userId)),
        };
      }),

    get: (actor: Actor, id: string) =>
      asUser(actor, async (tx, userId) => toDto(await visibleFood(tx, userId, id), userId)),

    /** My own food with this barcode, else a known one, else Open Food Facts (then cached). */
    barcode: (actor: Actor, code: string): Promise<FoodDto> =>
      asUser(actor, async (tx, userId) => {
        const known = await tx
          .selectFrom('foods')
          .select([...COLS])
          .where('barcode', '=', code)
          .where((eb) => eb.or([eb('owner_id', 'is', null), eb('owner_id', '=', userId)]))
          .orderBy(sql`owner_id is null`)
          .executeTakeFirst();
        if (known) return toDto(known, userId);
        const off = await openFoodFacts(code);
        if (!off) throw new AppError('NOT_FOUND', 'errors.food.barcode_not_found');
        await tx
          .insertInto('foods')
          .values({ ...off, barcode: code, source: 'off' })
          .onConflict((oc) =>
            oc
              .column('barcode')
              .where(sql<boolean>`owner_id is null and barcode is not null`)
              .doNothing(),
          )
          .execute();
        const row = await tx
          .selectFrom('foods')
          .select([...COLS])
          .where('barcode', '=', code)
          .where('owner_id', 'is', null)
          .executeTakeFirstOrThrow();
        return toDto(row, userId);
      }),

    create: (actor: Actor, b: FoodInput): Promise<FoodDto> =>
      asUser(actor, async (tx, userId) => {
        const count = await tx
          .selectFrom('foods')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('owner_id', '=', userId)
          .executeTakeFirstOrThrow();
        if (Number(count.n) >= MAX_OWN)
          throw new AppError('BUSINESS_RULE', 'errors.food.limit_reached');
        if (b.barcode) {
          const dup = await tx
            .selectFrom('foods')
            .select('id')
            .where('owner_id', '=', userId)
            .where('barcode', '=', b.barcode)
            .executeTakeFirst();
          if (dup) throw new AppError('CONFLICT', 'errors.food.duplicate_barcode');
        }
        const row = await tx
          .insertInto('foods')
          .values({
            name: b.name,
            brand: b.brand ?? null,
            barcode: b.barcode ?? null,
            serving_g: b.servingG,
            serving_label: b.servingLabel ?? null,
            kcal_100g: b.kcal100,
            protein_100g: b.protein100,
            carbs_100g: b.carbs100,
            fat_100g: b.fat100,
            source: 'user',
            owner_id: userId,
          })
          .returning([...COLS])
          .executeTakeFirstOrThrow();
        return toDto(row, userId);
      }),

    remove: (actor: Actor, id: string) =>
      asUser(actor, async (tx, userId) => {
        const r = await tx
          .deleteFrom('foods')
          .where('id', '=', id)
          .where('owner_id', '=', userId)
          .returning('id')
          .executeTakeFirst();
        if (!r) throw new AppError('NOT_FOUND', 'errors.food.not_found');
        return { ok: true };
      }),
  };
}
