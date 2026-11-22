import type { MealPlanContent, NutritionTemplateDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Card, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Table';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { cleanMealPlan, emptyMealPlan, MealPlanEditor } from './MealPlanEditor';

type Goal = NutritionTemplateDto['goal'];
const LOCALES = ['sr', 'en', 'ru'] as const;

/** The club's example meal plans per goal, shown to members who have no plan from a trainer. */
export function NutritionPage() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['nutrition-templates'],
    queryFn: () => api.get<NutritionTemplateDto[]>('/admin/nutrition-templates'),
  });
  const [goal, setGoal] = useState<Goal>('lose');
  const [lang, setLang] = useState<(typeof LOCALES)[number]>(
    (LOCALES as readonly string[]).includes(i18n.language) ? (i18n.language as 'sr') : 'sr',
  );
  const [draft, setDraft] = useState<Record<string, MealPlanContent>>({});
  const current = q.data?.find((x) => x.goal === goal);
  useEffect(() => {
    if (current) setDraft({ ...current.translations });
  }, [current]);
  const save = useMutation({
    mutationFn: () =>
      api.put(`/admin/nutrition-templates/${goal}`, {
        translations: Object.fromEntries(
          Object.entries(draft).map(([l, v]) => [l, cleanMealPlan(v)]),
        ),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nutrition-templates'] });
      toast.success(t('admin.nutrition.saved'));
    },
  });

  return (
    <>
      <PageHeader
        title={t('admin.nutrition.title')}
        subtitle={t('admin.nutrition.subtitle')}
        actions={
          <Button loading={save.isPending} disabled={!draft.sr} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        }
      />
      {q.isPending ? (
        <Skeleton className="h-96" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <Card className="p-4">
          <Tabs<Goal>
            value={goal}
            onChange={setGoal}
            tabs={(['lose', 'maintain', 'gain'] as const).map((g) => ({
              value: g,
              label: t(`app.nutrition.goals.${g}`),
            }))}
          />
          <div className="my-4 flex flex-wrap items-center gap-2">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                className={cn(
                  'h-8 rounded-sm border px-3 text-xs font-semibold',
                  lang === l
                    ? 'border-accent-500 bg-accent-tint'
                    : 'border-border-subtle text-text-secondary',
                )}
              >
                {l.toUpperCase()}
              </button>
            ))}
            {current && (
              <span className="ms-auto text-xs text-text-secondary">
                {t('admin.nutrition.updated', { date: f.dateTime(current.updatedAt) })}
              </span>
            )}
          </div>
          {draft[lang] ? (
            <MealPlanEditor
              value={draft[lang]!}
              onChange={(v) => setDraft({ ...draft, [lang]: v })}
            />
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-text-secondary">{t('admin.nutrition.no_translation')}</p>
              <Button
                variant="secondary"
                onClick={() =>
                  setDraft({
                    ...draft,
                    [lang]: draft.sr ? structuredClone(draft.sr) : emptyMealPlan(),
                  })
                }
              >
                {t('admin.nutrition.copy_from_sr')}
              </Button>
            </div>
          )}
          {save.error && (
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {t(save.error instanceof ApiError ? save.error.message : 'errors.internal')}
            </p>
          )}
        </Card>
      )}
    </>
  );
}
