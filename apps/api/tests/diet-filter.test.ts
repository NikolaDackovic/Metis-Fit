import { describe, expect, it } from 'vitest';
import type { MealPlanContent } from '@grit/validation';
import { filterMealPlan } from '../src/modules/nutrition/diet-filter';

const opt = (title: string, ingredients: string[]) => ({
  title,
  ingredients,
  kcal: 400,
  proteinG: 30,
});
const plan: MealPlanContent = {
  summary: 'Primer',
  meals: [
    {
      name: 'Doručak',
      time: '08:00',
      options: [
        opt('Omlet', ['3 jaja', 'hleb']),
        opt('Ovsena kaša', ['ovsene pahuljice', 'jogurt']),
      ],
    },
    {
      name: 'Ručak',
      time: '13:00',
      options: [
        opt('Losos sa povrćem', ['losos', 'brokoli']),
        opt('Piletina i pirinač', ['piletina', 'pirinač']),
      ],
    },
    {
      name: 'Večera',
      time: '19:00',
      options: [opt('Tuna salata', ['tunjevina', 'zelena salata'])],
    },
  ],
  tips: ['Pij vodu.'],
};

describe('example meal plan follows what the member does not eat (F13-8)', () => {
  it('"no fish" removes fish options and never leaves a meal empty', () => {
    const p = filterMealPlan(plan, ['no_fish'], 'sr');
    expect(p.meals[1]!.options.map((o) => o.title)).toEqual(['Piletina i pirinač']);
    // Dinner had only fish: it stays, with a tip to swap.
    expect(p.meals[2]!.options).toHaveLength(1);
    expect(p.tips.at(-1)).toMatch(/zameni/);
  });

  it('vegetarian removes meat and fish; vinegar is not cheese', () => {
    const p = filterMealPlan(plan, ['vegetarian'], 'sr');
    expect(p.meals[1]!.options).toHaveLength(2); // both clash: kept with a tip
    const v = filterMealPlan(
      {
        ...plan,
        meals: [
          { name: 'Salata', time: '12:00', options: [opt('Salata', ['sirće', 'paradajz'])] },
          plan.meals[0]!,
        ],
      },
      ['lactose_free'],
      'sr',
    );
    expect(v.meals[0]!.options).toHaveLength(1);
    expect(v.meals[1]!.options.map((o) => o.title)).toEqual(['Omlet']);
  });

  it('no restrictions: unchanged', () => {
    expect(filterMealPlan(plan, [], 'sr')).toBe(plan);
  });
});
