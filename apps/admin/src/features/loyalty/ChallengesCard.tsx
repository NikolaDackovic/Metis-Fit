import type { ChallengeBody, ChallengeDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trophy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';

const KEY = ['admin-challenges'];

/** F13-4: the gym's challenges ("12 visits this month") and the points for reaching them. */
export function ChallengesCard() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<ChallengeDto[]>('/admin/challenges'),
  });
  const [editing, setEditing] = useState<ChallengeDto | 'new' | null>(null);
  const name = (c: ChallengeDto) =>
    c.title || t(`app.challenges.name.${c.kind}_${c.period}`, { count: c.target });

  return (
    <Card>
      <CardHeader
        title={t('admin.challenges.title')}
        action={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            {t('admin.challenges.add')}
          </Button>
        }
      />
      {q.isPending ? (
        <Skeleton className="m-4 h-24" />
      ) : !q.data?.length ? (
        <EmptyState icon={Trophy} title={t('admin.challenges.empty')} />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {q.data.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setEditing(c)}
                className="flex w-full items-center gap-3 px-4 py-3 text-start text-sm hover:bg-bg-surface2"
              >
                <Trophy className="size-4 shrink-0 text-accent-400" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-semibold">{name(c)}</span>
                {!c.isActive && <Badge tone="neutral">{t('admin.loyalty.inactive')}</Badge>}
                <span className="font-semibold tabular-nums">+{c.rewardPoints}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="px-4 pb-3 text-xs text-text-secondary">{t('admin.challenges.hint')}</p>
      {editing && (
        <ChallengeModal
          challenge={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function ChallengeModal({ challenge, onClose }: { challenge?: ChallengeDto; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [v, setV] = useState<ChallengeBody>({
    kind: challenge?.kind ?? 'visits',
    period: challenge?.period ?? 'month',
    target: challenge?.target ?? 8,
    rewardPoints: challenge?.rewardPoints ?? 100,
    title: challenge?.title ?? '',
    isActive: challenge?.isActive ?? true,
    sortOrder: challenge?.sortOrder ?? 0,
  });
  const done = (msg: string) => {
    void qc.invalidateQueries({ queryKey: KEY });
    toast.success(t(msg));
    onClose();
  };
  const fail = (e: unknown) =>
    toast.error(t(e instanceof ApiError ? e.message : 'errors.internal'));
  const save = useMutation({
    mutationFn: () => {
      const body = { ...v, title: v.title?.trim() ? v.title.trim() : null };
      return challenge
        ? api.put(`/admin/challenges/${challenge.id}`, body)
        : api.post('/admin/challenges', body);
    },
    onSuccess: () => done('admin.challenges.saved'),
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/admin/challenges/${challenge!.id}`),
    onSuccess: () => done('admin.challenges.deleted'),
    onError: fail,
  });
  const okTarget = Number.isInteger(v.target) && v.target >= 1 && v.target <= 100;
  const okPoints =
    Number.isInteger(v.rewardPoints) && v.rewardPoints >= 0 && v.rewardPoints <= 100_000;

  return (
    <Modal
      open
      onClose={onClose}
      title={challenge ? t('admin.challenges.edit') : t('admin.challenges.add')}
      footer={
        <div className="flex w-full items-center gap-2">
          {challenge && (
            <Button variant="ghost" loading={remove.isPending} onClick={() => remove.mutate()}>
              {t('admin.challenges.delete')}
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            disabled={!okTarget || !okPoints}
            onClick={() => save.mutate()}
          >
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('admin.challenges.kind_label')}>
          {(p) => (
            <Select
              {...p}
              value={v.kind}
              onChange={(e) => setV({ ...v, kind: e.target.value as ChallengeBody['kind'] })}
            >
              {(['visits', 'classes', 'workouts'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`admin.challenges.kind.${k}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.challenges.period_label')}>
          {(p) => (
            <Select
              {...p}
              value={v.period}
              onChange={(e) => setV({ ...v, period: e.target.value as ChallengeBody['period'] })}
            >
              {(['week', 'month'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`admin.challenges.period.${k}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label={t('admin.challenges.target')}
          error={okTarget ? undefined : 'admin.challenges.target_invalid'}
        >
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              max={100}
              value={v.target}
              onChange={(e) => setV({ ...v, target: Number(e.target.value) })}
            />
          )}
        </Field>
        <Field
          label={t('admin.challenges.points')}
          error={okPoints ? undefined : 'admin.referral.points_invalid'}
        >
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              value={v.rewardPoints}
              onChange={(e) => setV({ ...v, rewardPoints: Number(e.target.value) })}
            />
          )}
        </Field>
        <Field
          label={t('admin.challenges.own_title')}
          hint={t('admin.challenges.own_title_hint', {
            name: t(`app.challenges.name.${v.kind}_${v.period}`, { count: v.target || 1 }),
          })}
          className="sm:col-span-2"
        >
          {(p) => (
            <Input
              {...p}
              value={v.title ?? ''}
              maxLength={80}
              onChange={(e) => setV({ ...v, title: e.target.value })}
            />
          )}
        </Field>
        <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-accent-500)]"
            checked={v.isActive}
            onChange={(e) => setV({ ...v, isActive: e.target.checked })}
          />
          {t('admin.challenges.active')}
        </label>
      </div>
    </Modal>
  );
}
