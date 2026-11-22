import type { MealPlanContent } from '@grit/validation';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';

type Meal = MealPlanContent['meals'][number];
type Option = Meal['options'][number];

export const emptyMealPlan = (): MealPlanContent => ({
  summary: '',
  meals: [
    { name: '', time: '08:00', options: [{ title: '', ingredients: [], kcal: 0, proteinG: 0 }] },
    { name: '', time: '13:00', options: [{ title: '', ingredients: [], kcal: 0, proteinG: 0 }] },
  ],
  tips: [],
});

/** Editor for one meal plan (club example or a member's plan): meals, options, ingredients, tips. */
export function MealPlanEditor({
  value,
  onChange,
}: {
  value: MealPlanContent;
  onChange: (v: MealPlanContent) => void;
}) {
  const { t } = useTranslation();
  const setMeal = (i: number, patch: Partial<Meal>) =>
    onChange({ ...value, meals: value.meals.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const setOption = (mi: number, oi: number, patch: Partial<Option>) =>
    setMeal(mi, {
      options: value.meals[mi]!.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)),
    });
  const totals = value.meals.reduce(
    (a, m) => {
      const o = m.options[0];
      return { kcal: a.kcal + (o?.kcal ?? 0), protein: a.protein + (o?.proteinG ?? 0) };
    },
    { kcal: 0, protein: 0 },
  );

  return (
    <div className="flex flex-col gap-4">
      <Field label={t('admin.nutrition.summary')}>
        {(p) => (
          <Textarea
            {...p}
            rows={2}
            maxLength={600}
            value={value.summary}
            onChange={(e) => onChange({ ...value, summary: e.target.value })}
          />
        )}
      </Field>
      <p className="tabular text-xs text-text-secondary">
        {t('admin.nutrition.totals', { kcal: totals.kcal, protein: totals.protein })}
      </p>
      {value.meals.map((m, mi) => (
        <div key={mi} className="rounded-sm border border-border-subtle p-3">
          <div className="mb-3 grid grid-cols-[1fr_7rem_auto] items-end gap-2">
            <Field label={t('admin.nutrition.meal')}>
              {(p) => (
                <Input
                  {...p}
                  value={m.name}
                  maxLength={60}
                  onChange={(e) => setMeal(mi, { name: e.target.value })}
                />
              )}
            </Field>
            <Field label={t('admin.nutrition.time')}>
              {(p) => (
                <Input
                  {...p}
                  value={m.time}
                  maxLength={20}
                  onChange={(e) => setMeal(mi, { time: e.target.value })}
                />
              )}
            </Field>
            <IconButton
              label={t('admin.nutrition.remove_meal')}
              disabled={value.meals.length <= 2}
              onClick={() => onChange({ ...value, meals: value.meals.filter((_, j) => j !== mi) })}
            >
              <Trash2 className="size-4" />
            </IconButton>
          </div>
          <div className="flex flex-col gap-2">
            {m.options.map((o, oi) => (
              <div
                key={oi}
                className="grid gap-2 rounded-sm bg-bg-surface2 p-2 sm:grid-cols-[1fr_5rem_5rem_auto]"
              >
                <Input
                  aria-label={t('admin.nutrition.option_title')}
                  placeholder={t('admin.nutrition.option_title')}
                  value={o.title}
                  maxLength={100}
                  onChange={(e) => setOption(mi, oi, { title: e.target.value })}
                  className="h-9"
                />
                <Input
                  aria-label="kcal"
                  placeholder="kcal"
                  type="number"
                  min={0}
                  value={o.kcal || ''}
                  onChange={(e) => setOption(mi, oi, { kcal: Number(e.target.value) || 0 })}
                  className="h-9"
                />
                <Input
                  aria-label={t('admin.nutrition.protein')}
                  placeholder={t('admin.nutrition.protein')}
                  type="number"
                  min={0}
                  value={o.proteinG || ''}
                  onChange={(e) => setOption(mi, oi, { proteinG: Number(e.target.value) || 0 })}
                  className="h-9"
                />
                <IconButton
                  label={t('admin.nutrition.remove_option')}
                  disabled={m.options.length <= 1}
                  onClick={() => setMeal(mi, { options: m.options.filter((_, j) => j !== oi) })}
                >
                  <Trash2 className="size-4" />
                </IconButton>
                <Textarea
                  aria-label={t('admin.nutrition.ingredients')}
                  placeholder={t('admin.nutrition.ingredients_hint')}
                  rows={2}
                  value={o.ingredients.join('\n')}
                  onChange={(e) =>
                    setOption(mi, oi, {
                      ingredients: e.target.value
                        .split('\n')
                        .map((x) => x.slice(0, 80))
                        .slice(0, 12),
                    })
                  }
                  className="sm:col-span-4"
                />
              </div>
            ))}
          </div>
          {m.options.length < 3 && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              icon={<Plus className="size-4" />}
              onClick={() =>
                setMeal(mi, {
                  options: [...m.options, { title: '', ingredients: [], kcal: 0, proteinG: 0 }],
                })
              }
            >
              {t('admin.nutrition.add_option')}
            </Button>
          )}
        </div>
      ))}
      {value.meals.length < 6 && (
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus className="size-4" />}
          onClick={() =>
            onChange({
              ...value,
              meals: [
                ...value.meals,
                {
                  name: '',
                  time: '',
                  options: [{ title: '', ingredients: [], kcal: 0, proteinG: 0 }],
                },
              ],
            })
          }
        >
          {t('admin.nutrition.add_meal')}
        </Button>
      )}
      <Field label={t('admin.nutrition.tips')} hint={t('admin.nutrition.tips_hint')}>
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            value={value.tips.join('\n')}
            onChange={(e) =>
              onChange({
                ...value,
                tips: e.target.value
                  .split('\n')
                  .map((x) => x.slice(0, 200))
                  .slice(0, 6),
              })
            }
          />
        )}
      </Field>
    </div>
  );
}

/** Drops empty lines before saving (the textareas keep them while typing). */
export function cleanMealPlan(v: MealPlanContent): MealPlanContent {
  return {
    summary: v.summary.trim(),
    meals: v.meals.map((m) => ({
      ...m,
      options: m.options.map((o) => ({
        ...o,
        ingredients: o.ingredients.map((x) => x.trim()).filter(Boolean),
      })),
    })),
    tips: v.tips.map((x) => x.trim()).filter(Boolean),
  };
}
