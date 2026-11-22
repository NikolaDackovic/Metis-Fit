import type { ClientProgressDto, TrainerClientDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Lock, ShieldCheck, Trophy, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  TableSkeleton,
} from '@/components/ui/States';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { MemberNutritionPanel } from '../nutrition/MemberNutritionPanel';
import { WorkoutPlansPanel } from './WorkoutPlansPanel';

/**
 * Trainer view: own clients; progress only for clients who consented (enforced by the API,
 * every view is audited).
 */
export function ClientsPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const [open, setOpen] = useState<TrainerClientDto | null>(null);
  const q = useQuery({
    queryKey: ['my-clients'],
    queryFn: () => api.get<TrainerClientDto[]>('/admin/my-clients'),
  });
  if (open) return <ClientProgress client={open} onBack={() => setOpen(null)} />;
  return (
    <>
      <PageHeader title={t('admin.clients.title')} subtitle={t('admin.clients.subtitle')} />
      <Card>
        {q.isPending ? (
          <TableSkeleton rows={4} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t('admin.clients.empty')}
            description={t('admin.clients.empty_hint')}
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {q.data.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setOpen(c)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-start enabled:hover:bg-bg-surface2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {c.firstName} {c.lastName}
                    </span>
                    <span className="tabular block text-xs text-text-secondary">
                      {c.memberNumber} · {t('admin.clients.since', { date: f.date(c.since) })}
                    </span>
                  </span>
                  {c.sharesProgress ? (
                    <Badge tone="success">
                      <ShieldCheck className="size-3" aria-hidden /> {t('admin.clients.shares')}
                    </Badge>
                  ) : (
                    <Badge>
                      <Lock className="size-3" aria-hidden /> {t('admin.clients.private')}
                    </Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function ClientProgress({ client, onBack }: { client: TrainerClientDto; onBack: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const q = useQuery({
    queryKey: ['client-progress', client.memberId],
    queryFn: () => api.get<ClientProgressDto>(`/admin/members/${client.memberId}/progress`),
    // Progress is shown only with the member's consent; the plan editor works either way.
    enabled: client.sharesProgress,
  });
  const d = q.data;
  return (
    <>
      <Button
        variant="ghost"
        icon={<ArrowLeft className="size-4" />}
        onClick={onBack}
        className="mb-3"
      >
        {t('admin.clients.title')}
      </Button>
      <PageHeader
        title={`${client.firstName} ${client.lastName}`}
        subtitle={t('admin.clients.audit_note')}
      />
      <div className="mb-4">
        <WorkoutPlansPanel memberId={client.memberId} />
      </div>
      <div className="mb-4">
        <MemberNutritionPanel memberId={client.memberId} />
      </div>
      {!client.sharesProgress ? (
        <Card>
          <EmptyState
            icon={Lock}
            title={t('admin.clients.private_title')}
            description={t('admin.clients.private_text')}
          />
        </Card>
      ) : q.isPending ? (
        <Skeleton className="h-96" />
      ) : q.isError || !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid grid-cols-3 gap-3 lg:col-span-2">
            {[
              [t('app.progress.total'), d.progress.totalWorkouts],
              [t('app.progress.last30'), d.progress.last30Days],
              [
                t('app.progress.streak'),
                t('app.progress.weeks', { count: d.progress.streakWeeks }),
              ],
            ].map(([label, value]) => (
              <Card key={String(label)} className="px-4 py-3">
                <p className="text-[11px] font-semibold tracking-wider text-text-secondary uppercase">
                  {label}
                </p>
                <p className="tabular mt-1 text-2xl font-bold">{value}</p>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader title={t('app.progress.records')} />
            <ul className="divide-y divide-border-subtle">
              {d.progress.records.length === 0 && (
                <li className="px-4 py-3 text-sm text-text-secondary">
                  {t('app.progress.no_records')}
                </li>
              )}
              {d.progress.records.map((r) => (
                <li key={r.exerciseId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Trophy className="size-4 text-accent-400" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="tabular font-semibold">
                    {r.bestWeightKg != null
                      ? `${r.bestWeightKg} kg`
                      : r.bestReps != null
                        ? `× ${r.bestReps}`
                        : '-'}
                  </span>
                  {r.estimated1rmKg != null && (
                    <span className="tabular text-xs text-text-secondary">
                      1RM ≈ {r.estimated1rmKg}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title={t('admin.clients.recent')} />
            <ul className="divide-y divide-border-subtle">
              {d.recentWorkouts.length === 0 && (
                <li className="px-4 py-3 text-sm text-text-secondary">{t('app.log.empty')}</li>
              )}
              {d.recentWorkouts.map((w) => (
                <li key={w.id} className="px-4 py-2.5 text-sm">
                  <p className="tabular font-semibold">{f.dateTime(w.startedAt)}</p>
                  <p className="truncate text-xs text-text-secondary">
                    {w.exercises.map((e) => `${e.name} (${e.sets})`).join(', ')}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title={t('app.progress.goals')} />
            <ul className="divide-y divide-border-subtle">
              {d.goals.length === 0 && <li className="px-4 py-3 text-sm text-text-secondary">-</li>}
              {d.goals.map((g) => (
                <li key={g.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {g.kind === 'custom'
                      ? g.title
                      : t(`app.progress.goal_kinds.${g.kind}`, { exercise: g.exerciseName ?? '' })}
                  </span>
                  <span className="tabular">
                    {g.currentValue ?? '-'} / {g.targetValue ?? '-'}
                  </span>
                  <Badge tone={g.status === 'achieved' ? 'success' : 'neutral'}>
                    {t(`admin.clients.goal_status.${g.status}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title={t('app.progress.measurements')} />
            <ul className="divide-y divide-border-subtle">
              {d.measurements.length === 0 && (
                <li className="px-4 py-3 text-sm text-text-secondary">
                  {t('app.progress.no_measurements')}
                </li>
              )}
              {d.measurements.map((m) => (
                <li key={m.id} className="tabular flex gap-4 px-4 py-2.5 text-sm">
                  <span className="w-24 text-text-secondary">{f.date(m.measuredOn)}</span>
                  {m.weightKg != null && <span>{m.weightKg} kg</span>}
                  {m.bodyFatPct != null && <span>{m.bodyFatPct}%</span>}
                  {m.waistCm != null && (
                    <span>
                      {t('app.progress.m.waistCm')} {m.waistCm} cm
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
