import type { LoyaltyRewardBody, LoyaltyRewardDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { ChallengesCard } from './ChallengesCard';
import { ReferralCard } from './ReferralCard';

const LOCALES = ['sr', 'en', 'ru'] as const;

/** Loyalty program: rewards members can get for their points, and how points are earned. */
export function LoyaltyPage() {
  const { t, i18n } = useTranslation();
  const q = useQuery({
    queryKey: ['loyalty-rewards', i18n.language],
    queryFn: () => api.get<LoyaltyRewardDto[]>('/admin/loyalty/rewards', { locale: i18n.language }),
  });
  const [editing, setEditing] = useState<LoyaltyRewardDto | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title={t('admin.loyalty.page_title')}
        subtitle={t('admin.loyalty.page_subtitle')}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            {t('admin.loyalty.new_reward')}
          </Button>
        }
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title={t('admin.loyalty.rewards')} />
            {q.isPending ? (
              <Skeleton className="m-4 h-40" />
            ) : q.isError ? (
              <ErrorState error={q.error} onRetry={() => void q.refetch()} />
            ) : !q.data.length ? (
              <EmptyState icon={Gift} title={t('admin.loyalty.no_rewards')} />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {q.data.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(r)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-start text-sm hover:bg-bg-surface2"
                    >
                      <Gift className="size-4 shrink-0 text-accent-400" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{r.name}</span>
                        {r.description && (
                          <span className="block truncate text-xs text-text-secondary">
                            {r.description}
                          </span>
                        )}
                      </span>
                      {!r.isActive && <Badge tone="neutral">{t('admin.loyalty.inactive')}</Badge>}
                      <span className="font-semibold tabular-nums">{r.costPoints}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <ChallengesCard />
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title={t('admin.loyalty.rules_title')} />
            <div className="flex flex-col gap-2 px-4 py-3 text-sm text-text-secondary">
              <p>{t('admin.loyalty.rules_visit')}</p>
              <p>{t('admin.loyalty.rules_payment')}</p>
              <p>{t('admin.loyalty.rules_tiers')}</p>
              <p>{t('admin.loyalty.rules_settings')}</p>
            </div>
          </Card>
          <ReferralCard />
        </div>
      </div>
      {editing && (
        <RewardModal
          reward={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function RewardModal({ reward, onClose }: { reward?: LoyaltyRewardDto; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [cost, setCost] = useState(String(reward?.costPoints ?? ''));
  const [active, setActive] = useState(reward?.isActive ?? true);
  const [sort, setSort] = useState(String(reward?.sortOrder ?? 0));
  const [tr, setTr] = useState<Record<string, { name: string; description: string }>>(
    Object.fromEntries(
      LOCALES.map((l) => [
        l,
        {
          name: reward?.translations?.[l]?.name ?? '',
          description: reward?.translations?.[l]?.description ?? '',
        },
      ]),
    ),
  );
  const body: LoyaltyRewardBody = {
    costPoints: Number(cost),
    isActive: active,
    sortOrder: Number(sort) || 0,
    translations: Object.fromEntries(
      LOCALES.filter((l) => tr[l]?.name.trim()).map((l) => [
        l,
        { name: tr[l]!.name.trim(), description: tr[l]!.description.trim() || null },
      ]),
    ),
  };
  const save = useMutation({
    mutationFn: () =>
      reward
        ? api.put(`/admin/loyalty/rewards/${reward.id}?locale=${i18n.language}`, body)
        : api.post(`/admin/loyalty/rewards?locale=${i18n.language}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['loyalty-rewards'] });
      toast.success(t('admin.loyalty.saved'));
      onClose();
    },
  });
  const valid =
    Number.isInteger(body.costPoints) && body.costPoints > 0 && Boolean(tr.sr?.name.trim());

  return (
    <Modal
      open
      onClose={onClose}
      title={reward ? reward.name : t('admin.loyalty.new_reward')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('admin.loyalty.cost')} required>
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('admin.loyalty.sort')}>
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              />
            )}
          </Field>
        </div>
        {LOCALES.map((l) => (
          <div key={l} className="grid gap-2 sm:grid-cols-2">
            <Field
              label={`${t('admin.loyalty.reward_name')} (${l.toUpperCase()})`}
              required={l === 'sr'}
            >
              {(p) => (
                <Input
                  {...p}
                  value={tr[l]!.name}
                  maxLength={80}
                  onChange={(e) => setTr({ ...tr, [l]: { ...tr[l]!, name: e.target.value } })}
                />
              )}
            </Field>
            <Field label={`${t('admin.loyalty.reward_description')} (${l.toUpperCase()})`}>
              {(p) => (
                <Input
                  {...p}
                  value={tr[l]!.description}
                  maxLength={300}
                  onChange={(e) =>
                    setTr({ ...tr, [l]: { ...tr[l]!, description: e.target.value } })
                  }
                />
              )}
            </Field>
          </div>
        ))}
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-accent-500)]"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          {t('admin.loyalty.active')}
        </label>
        {save.error && (
          <p role="alert" className="text-sm text-status-danger">
            {t(save.error instanceof ApiError ? save.error.message : 'errors.internal')}
          </p>
        )}
      </div>
    </Modal>
  );
}
