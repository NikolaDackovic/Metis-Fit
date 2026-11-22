import type { FoodDto } from '@grit/validation';

/** F15-2 helpers shared by the diary, search and scan screens. */

/** Local calendar day as YYYY-MM-DD (the diary is per local day, not UTC). */
export function localDay(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function shiftDay(day: string, by: number) {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y!, m! - 1, d! + by));
}

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Meal = (typeof MEALS)[number];
export const isMeal = (v: unknown): v is Meal => MEALS.includes(v as Meal);
export function mealNow(): Meal {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
}

/** Catalog names are Serbian with an English name; other languages read the English one. */
export const foodName = (f: Pick<FoodDto, 'name' | 'nameEn'>, lang: string) =>
  lang === 'sr' || !f.nameEn ? f.name : f.nameEn;

const r1 = (v: number) => Math.round(v * 10) / 10;
/** What an amount of a food gives (same rounding as the server). */
export function amountOf(f: FoodDto, grams: number) {
  const k = grams / 100;
  return {
    kcal: Math.round(f.kcal100 * k),
    proteinG: r1(f.protein100 * k),
    carbsG: r1(f.carbs100 * k),
    fatG: r1(f.fat100 * k),
  };
}

/** Parses "1,5" or "1.5"; null when empty or not a number. */
export const toNum = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(n) ? null : n;
};
