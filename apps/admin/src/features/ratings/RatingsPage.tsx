import type { RatingsSummaryDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { MessageSquareQuote, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '@/components/ui/States';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={value.toFixed(1)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`size-4 ${n <= Math.round(value) ? 'fill-accent-400 text-accent-400' : 'text-text-muted'}`}
          aria-hidden
        />
      ))}
    </span>
  );
}

/** F13-7: how members rate the classes and trainers, with their latest comments. */
export function RatingsPage() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const q = useQuery({
    queryKey: ['admin-ratings', i18n.language],
    queryFn: () => api.get<RatingsSummaryDto>('/admin/ratings', { locale: i18n.language }),
  });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;

  const Avg = ({
    rows,
  }: {
    rows: Array<{ key: string; name: string; avg: number; count: number }>;
  }) =>
    rows.length === 0 ? (
      <p className="px-4 py-6 text-center text-sm text-text-secondary">{t('admin.ratings.none')}</p>
    ) : (
      <ul className="divide-y divide-border-subtle">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
            <Stars value={r.avg} />
            <span className="w-10 text-end font-semibold tabular-nums">{r.avg.toFixed(1)}</span>
            <span className="w-16 text-end text-xs text-text-secondary">
              {t('admin.ratings.count', { count: r.count })}
            </span>
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <PageHeader
        title={t('admin.ratings.title')}
        subtitle={
          d && d.overall.count > 0
            ? t('admin.ratings.subtitle', { avg: d.overall.avg.toFixed(1), count: d.overall.count })
            : t('admin.ratings.subtitle_empty')
        }
      />
      {!d ? (
        <Skeleton className="h-96" />
      ) : d.overall.count === 0 ? (
        <Card>
          <EmptyState
            icon={Star}
            title={t('admin.ratings.none')}
            description={t('admin.ratings.how')}
          />
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader title={t('admin.ratings.by_trainer')} />
              <Avg rows={d.byTrainer.map((r) => ({ key: r.trainerId, ...r }))} />
            </Card>
            <Card>
              <CardHeader title={t('admin.ratings.by_class')} />
              <Avg rows={d.byClassType.map((r) => ({ key: r.classTypeId, ...r }))} />
            </Card>
          </div>
          <Card>
            <CardHeader title={t('admin.ratings.latest')} />
            <ul className="max-h-[70vh] divide-y divide-border-subtle overflow-y-auto">
              {d.latest.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Stars value={r.stars} />
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {r.title ?? t('admin.ratings.personal')}
                      {r.trainerName ? ` · ${r.trainerName}` : ''}
                    </span>
                    <span className="text-xs text-text-secondary">{f.date(r.createdAt)}</span>
                  </div>
                  {r.comment && (
                    <p className="flex gap-2 text-text-secondary">
                      <MessageSquareQuote
                        className="mt-0.5 size-4 shrink-0 text-accent-400"
                        aria-hidden
                      />
                      <span>{r.comment}</span>
                    </p>
                  )}
                  <span className="text-xs text-text-muted">{r.memberName}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
