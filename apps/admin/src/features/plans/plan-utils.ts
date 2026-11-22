import type { PlanDto } from '@grit/validation';
import type { TFunction } from 'i18next';

/** Plan name in the UI language, falling back to Serbian. */
export function planName(plan: Pick<PlanDto, 'translations'>, lng: string): string {
  return plan.translations[lng]?.name ?? plan.translations.sr?.name ?? '-';
}

/** "30 dana · 12 dolazaka" - personal training counts sessions, not visits. */
export function planLimits(
  plan: Pick<PlanDto, 'kind' | 'durationDays' | 'visitLimit'>,
  t: TFunction,
): string {
  const countKey =
    plan.kind === 'personal_training' ? 'admin.plans.sessions' : 'admin.plans.visits';
  return [
    plan.durationDays && t('admin.plans.duration_days', { count: plan.durationDays }),
    plan.visitLimit && t(countKey, { count: plan.visitLimit }),
  ]
    .filter(Boolean)
    .join(' · ');
}
