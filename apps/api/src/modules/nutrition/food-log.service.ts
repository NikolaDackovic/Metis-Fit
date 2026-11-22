import type { Kysely } from 'kysely';
import type { DB } from '@grit/database';
import { randomUUID } from 'node:crypto';
import {
  nutritionTargetsDto,
  type FoodCopyBody,
  type FoodDayDto,
  type FoodEntryDto,
  type FoodEntryInput,
} from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { AppError } from '../../shared/errors';
import { portion, visibleFood } from './foods.service';

const num = (v: unknown) => (v == null ? null : Number(v));
const toDto = (r: {
  id: string;
  eaten_on: unknown;
  meal: string;
  name: string;
  kcal: number;
  protein_g: unknown;
  carbs_g: unknown;
  fat_g: unknown;
  food_id: string | null;
  grams: unknown;
}): FoodEntryDto => ({
  id: r.id,
  eatenOn: String(r.eaten_on),
  meal: r.meal as FoodEntryDto['meal'],
  name: r.name,
  kcal: r.kcal,
  proteinG: num(r.protein_g),
  carbsG: num(r.carbs_g),
  fatG: num(r.fat_g),
  foodId: r.food_id,
  grams: num(r.grams),
});
const COLS = [
  'id',
  'eaten_on',
  'meal',
  'name',
  'kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'food_id',
  'grams',
] as const;
const MAX_PER_DAY = 60;

async function day(tx: Tx, userId: string, date: string): Promise<FoodDayDto> {
  const entries = (
    await tx
      .selectFrom('food_log_entries')
      .select([...COLS])
      .where('user_id', '=', userId)
      .where('eaten_on', '=', date as never)
      .orderBy('created_at')
      .execute()
  ).map(toDto);
  const recentRows = await tx
    .selectFrom('food_log_entries')
    .select([...COLS])
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc')
    .limit(60)
    .execute();
  const seen = new Set<string>();
  const recent: FoodDayDto['recent'] = [];
  for (const r of recentRows.map(toDto)) {
    const k = r.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    recent.push({
      meal: r.meal,
      name: r.name,
      kcal: r.kcal,
      proteinG: r.proteinG,
      carbsG: r.carbsG,
      fatG: r.fatG,
      foodId: r.foodId,
      grams: r.grams,
    });
    if (recent.length >= 12) break;
  }
  const plan = await tx
    .selectFrom('nutrition_plans')
    .select('targets')
    // The calculator's plan is stored with the membership in the current gym.
    .where('member_id', 'in', (eb) =>
      eb.selectFrom('members').select('id').where('user_id', '=', userId),
    )
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
  const sum = (k: 'kcal' | 'proteinG' | 'carbsG' | 'fatG') =>
    Math.round(entries.reduce((a, e) => a + (e[k] ?? 0), 0) * 10) / 10;
  return {
    date,
    entries,
    totals: {
      kcal: sum('kcal'),
      proteinG: sum('proteinG'),
      carbsG: sum('carbsG'),
      fatG: sum('fatG'),
    },
    targets: plan ? nutritionTargetsDto.parse(plan.targets) : null,
    recent,
  };
}

/** Member food diary: entries per day, totals against the wizard targets. */
export function createFoodLogService(db: Kysely<DB>) {
  /** Personal data belongs to the account (F12-2): works with or without a gym membership. */
  const asUser = <T>(actor: Actor, fn: (tx: Tx, userId: string) => Promise<T>) =>
    withStaffTx(db, (tx) => fn(tx, actor.userId));
  return {
    day: (actor: Actor, date: string) => asUser(actor, (tx, m) => day(tx, m, date)),
    add: (actor: Actor, b: FoodEntryInput) =>
      asUser(actor, async (tx, userId) => {
        const existing = await tx
          .selectFrom('food_log_entries')
          .select('user_id')
          .where('id', '=', b.id)
          .executeTakeFirst();
        if (existing && existing.user_id !== userId)
          throw new AppError('CONFLICT', 'errors.conflict.duplicate');
        const count = await tx
          .selectFrom('food_log_entries')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('user_id', '=', userId)
          .where('eaten_on', '=', b.eatenOn as never)
          .executeTakeFirstOrThrow();
        if (!existing && Number(count.n) >= MAX_PER_DAY)
          throw new AppError('BUSINESS_RULE', 'errors.food_log.limit_reached');
        // F15-2: from the catalog the server works out the amounts (the client's numbers are
        // only a preview), so totals stay right whatever the app shows.
        const food = b.foodId ? await visibleFood(tx, userId, b.foodId) : null;
        const grams = food ? (b.grams ?? Number(food.serving_g)) : null;
        const v = {
          eaten_on: b.eatenOn,
          meal: b.meal,
          name: b.name,
          ...(food && grams
            ? portion(food, grams)
            : {
                kcal: b.kcal,
                protein_g: b.proteinG ?? null,
                carbs_g: b.carbsG ?? null,
                fat_g: b.fatG ?? null,
              }),
          food_id: food?.id ?? null,
          grams,
        };
        await tx
          .insertInto('food_log_entries')
          .values({ id: b.id, user_id: userId, ...v })
          .onConflict((oc) => oc.column('id').doUpdateSet(v))
          .execute();
        return day(tx, userId, b.eatenOn);
      }),
    /** Copy a day (or one meal) to another day, e.g. yesterday's breakfast to today. */
    copy: (actor: Actor, b: FoodCopyBody) =>
      asUser(actor, async (tx, userId) => {
        let q = tx
          .selectFrom('food_log_entries')
          .select(['meal', 'name', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'food_id', 'grams'])
          .where('user_id', '=', userId)
          .where('eaten_on', '=', b.from as never);
        if (b.meal) q = q.where('meal', '=', b.meal);
        const rows = await q.orderBy('created_at').execute();
        if (!rows.length) throw new AppError('BUSINESS_RULE', 'errors.food_log.nothing_to_copy');
        const count = await tx
          .selectFrom('food_log_entries')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('user_id', '=', userId)
          .where('eaten_on', '=', b.to as never)
          .executeTakeFirstOrThrow();
        if (Number(count.n) + rows.length > MAX_PER_DAY)
          throw new AppError('BUSINESS_RULE', 'errors.food_log.limit_reached');
        await tx
          .insertInto('food_log_entries')
          .values(rows.map((r) => ({ ...r, id: randomUUID(), user_id: userId, eaten_on: b.to })))
          .execute();
        return day(tx, userId, b.to);
      }),
    remove: (actor: Actor, id: string) =>
      asUser(actor, async (tx, userId) => {
        const row = await tx
          .deleteFrom('food_log_entries')
          .where('id', '=', id)
          .where('user_id', '=', userId)
          .returning('eaten_on')
          .executeTakeFirst();
        if (!row) throw new AppError('NOT_FOUND', 'errors.food_log.not_found');
        return day(tx, userId, String(row.eaten_on));
      }),
  };
}
