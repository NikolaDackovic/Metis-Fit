import type { LoyaltyDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Gift } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, CardHeader, ErrorState, Skeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useCan } from '@/lib/me';

const TIER_TONE = { bronze: 'neutral', silver: 'info', gold: 'accent' } as const;

/** Member profile → Loyalty: balance, tier, rewards to hand out, history, manual adjustment. */
export function MemberLoyaltyTab({ memberId }: { memberId: string }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const qc = useQueryClient();
  const key = ['member', memberId, 'loyalty', i18n.language];
  const q = useQuery({
    queryKey: key,
    queryFn: () =>
      api.get<LoyaltyDto>(`/admin/members/${memberId}/loyalty`, { locale: i18n.language }),
  });
  const set = (d: LoyaltyDto) => qc.setQueryData(key, d);
  const redeem = useMutation({
    mutationFn: (rewardId: string) =>
      api.post<LoyaltyDto>(`/admin/members/${memberId}/loyalty/redeem?locale=${i18n.language}`, {
        rewardId,
      }),
    onSuccess: (d) => {
      set(d);
      toast.success(t('admin.loyalty.redeemed'));
    },
    onError: (e) => toast.error(t(e instanceof ApiError ? e.message : 'errors.internal')),
  });
  const [adjusting, setAdjusting] = useState(false);

  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title={t('admin.loyalty.title')}
          action={
            can('loyalty.manage') ? (
              <Button size="sm" variant="secondary" onClick={() => setAdjusting(true)}>
                {t('admin.loyalty.adjust')}
              </Button>
            ) : undefined
          }
        />
        <div className="flex items-center gap-4 px-4 py-4">
          <Award className="size-8 shrink-0 text-accent-400" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-3xl font-bold tabular-nums">{d.balance}</p>
            <p className="text-sm text-text-secondary">{t('admin.loyalty.points')}</p>
          </div>
          <div className="text-end">
            <Badge tone={TIER_TONE[d.tier]}>{t(`app.loyalty.tier.${d.tier}`)}</Badge>
            <p className="mt-1 text-xs text-text-secondary">
              {t('admin.loyalty.earned_year', { points: d.earnedYear })}
            </p>
          </div>
        </div>
        {!d.enabled && (
          <p className="px-4 pb-3 text-sm text-status-warning">{t('admin.loyalty.disabled')}</p>
        )}
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {d.rewards.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Gift className="size-4 shrink-0 text-text-secondary" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="font-semibold tabular-nums">{r.costPoints}</span>
              {can('loyalty.redeem') && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={d.balance < r.costPoints || !d.enabled}
                  loading={redeem.isPending && redeem.variables === r.id}
                  onClick={() => {
                    if (
                      window.confirm(
                        t('admin.loyalty.redeem_confirm', { reward: r.name, points: r.costPoints }),
                      )
                    )
                      redeem.mutate(r.id);
                  }}
                >
                  {t('admin.loyalty.redeem')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title={t('admin.loyalty.history')} />
        {d.history.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-text-secondary">
            {t('admin.loyalty.no_history')}
          </p>
        ) : (
          <ul className="max-h-[28rem] divide-y divide-border-subtle overflow-y-auto">
            {d.history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{h.rewardName ?? t(`app.loyalty.reason.${h.reason}`)}</p>
                  <p className="truncate text-xs text-text-secondary">
                    {f.dateTime(h.createdAt)}
                    {h.note ? ` · ${h.note}` : ''}
                  </p>
                </div>
                <span
                  className={
                    h.points > 0
                      ? 'font-semibold tabular-nums text-status-success'
                      : 'font-semibold tabular-nums'
                  }
                >
                  {h.points > 0 ? `+${h.points}` : h.points}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {adjusting && (
        <AdjustModal memberId={memberId} onDone={set} onClose={() => setAdjusting(false)} />
      )}
    </div>
  );
}

function AdjustModal({
  memberId,
  onDone,
  onClose,
}: {
  memberId: string;
  onDone: (d: LoyaltyDto) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const n = Number(points);
  const save = useMutation({
    mutationFn: () =>
      api.post<LoyaltyDto>(`/admin/members/${memberId}/loyalty/adjust?locale=${i18n.language}`, {
        points: n,
        note: note.trim(),
      }),
    onSuccess: (d) => {
      onDone(d);
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.loyalty.adjust')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!Number.isInteger(n) || n === 0 || note.trim().length < 3}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label={t('admin.loyalty.adjust_points')}
          hint={t('admin.loyalty.adjust_hint')}
          required
        >
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('admin.loyalty.adjust_note')} required>
          {(p) => (
            <Input {...p} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          )}
        </Field>
        {save.error && (
          <p role="alert" className="text-sm text-status-danger">
            {t(save.error instanceof ApiError ? save.error.message : 'errors.internal')}
          </p>
        )}
      </div>
    </Modal>
  );
}
