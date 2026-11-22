import type {
  MealPlanContent,
  MemberNutritionPlanDto,
  NutritionTemplateDto,
} from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Salad } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useCan } from '@/lib/me';
import { useFormat } from '@/lib/format';
import { cleanMealPlan, emptyMealPlan, MealPlanEditor } from './MealPlanEditor';

/** A member's individual meal plan from their trainer (starts from a club example). */
export function MemberNutritionPanel({ memberId }: { memberId: string }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const qc = useQueryClient();
  const key = ['member-nutrition', memberId];
  const q = useQuery({
    queryKey: key,
    queryFn: () =>
      api.get<MemberNutritionPlanDto | null>(`/admin/members/${memberId}/nutrition-plan`),
  });
  const templates = useQuery({
    queryKey: ['nutrition-templates'],
    queryFn: () => api.get<NutritionTemplateDto[]>('/admin/nutrition-templates'),
    enabled: can('nutrition.manage'),
  });
  const [draft, setDraft] = useState<MealPlanContent | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api.put(`/admin/members/${memberId}/nutrition-plan`, { content: cleanMealPlan(draft!) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      toast.success(t('admin.nutrition.saved'));
      setDraft(null);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/admin/members/${memberId}/nutrition-plan`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });
  const fromTemplate = (goal: NutritionTemplateDto['goal']) => {
    const tpl = templates.data?.find((x) => x.goal === goal);
    const content = tpl?.translations[i18n.language] ?? tpl?.translations.sr;
    setDraft(content ? structuredClone(content) : emptyMealPlan());
  };

  return (
    <Card>
      <CardHeader
        title={t('admin.nutrition.member_title')}
        action={
          q.data ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                loading={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {t('admin.nutrition.remove_plan')}
              </Button>
              <Button size="sm" onClick={() => setDraft(structuredClone(q.data!.content))}>
                {t('common.edit')}
              </Button>
            </div>
          ) : undefined
        }
      />
      {q.isPending ? (
        <Skeleton className="m-4 h-20" />
      ) : q.data ? (
        <div className="px-4 py-3 text-sm">
          <p className="text-text-secondary">{q.data.content.summary}</p>
          <p className="mt-1 text-xs text-text-secondary">
            {q.data.content.meals.map((m) => m.name).join(' · ')} ·{' '}
            {t('admin.nutrition.updated', { date: f.dateTime(q.data.updatedAt) })}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 px-4 pb-5">
          <EmptyState
            icon={Salad}
            title={t('admin.nutrition.member_empty')}
            description={t('admin.nutrition.member_empty_hint')}
          />
          <div className="flex flex-wrap justify-center gap-2">
            {(['lose', 'maintain', 'gain'] as const).map((g) => (
              <Button key={g} size="sm" variant="secondary" onClick={() => fromTemplate(g)}>
                {t('admin.nutrition.start_from', { goal: t(`app.nutrition.goals.${g}`) })}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setDraft(emptyMealPlan())}>
              {t('admin.nutrition.start_empty')}
            </Button>
          </div>
        </div>
      )}
      {draft && (
        <Modal
          open
          size="lg"
          onClose={() => setDraft(null)}
          title={t('admin.nutrition.member_title')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                {t('common.cancel')}
              </Button>
              <Button loading={save.isPending} onClick={() => save.mutate()}>
                {t('common.save')}
              </Button>
            </>
          }
        >
          <MealPlanEditor value={draft} onChange={setDraft} />
          {save.error && (
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {t(save.error instanceof ApiError ? save.error.message : 'errors.internal')}
            </p>
          )}
        </Modal>
      )}
    </Card>
  );
}
