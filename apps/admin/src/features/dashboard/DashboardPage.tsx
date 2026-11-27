import type { DashboardDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CalendarClock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { color } from '@grit/design-tokens';
import { cn } from '@/components/ui/cn';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '@/components/ui/States';
import { api } from '@/lib/api';
import { addDays, clubToday, useFormat } from '@/lib/format';

type RangeKey = '7d' | '30d' | '90d';
const RANGES: Record<RangeKey, number> = { '7d': 6, '30d': 29, '90d': 89 };

export function DashboardPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const [range, setRange] = useState<RangeKey>('30d');
  const to = clubToday();
  const from = addDays(to, -RANGES[range]);

  const q = useQuery({
    queryKey: ['dashboard', from, to],
    queryFn: () => api.get<DashboardDto>('/admin/reports/dashboard', { from, to }),
  });

  return (
    <>
      <PageHeader
        title={t('admin.dashboard.title')}
        subtitle={t('admin.dashboard.subtitle', { from: f.date(from), to: f.date(to) })}
        actions={
          <div
            role="group"
            aria-label={t('admin.dashboard.range')}
            className="flex rounded-sm border border-border-subtle"
          >
            {(Object.keys(RANGES) as RangeKey[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={range === k}
                onClick={() => setRange(k)}
                className={cn(
                  'h-9 px-3 text-sm font-semibold',
                  range === k
                    ? 'bg-bg-elevated text-text-primary'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                {t(`admin.dashboard.ranges.${k}`)}
              </button>
            ))}
          </div>
        }
      />

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label={t('admin.dashboard.active_members')} value={q.data?.activeMembers} />
            <Stat
              label={t('admin.dashboard.expiring_soon')}
              value={q.data?.expiringSoon}
              tone="warning"
            />
            <Stat label={t('admin.dashboard.expired_30')} value={q.data?.expiredLast30Days} />
            <Stat label={t('admin.dashboard.checkins_today')} value={q.data?.checkinsToday} />
            <Stat
              label={t('admin.dashboard.revenue')}
              value={q.data ? f.money(q.data.revenue.total) : undefined}
              hint={
                q.data ? t('admin.dashboard.new_members', { count: q.data.newMembers }) : undefined
              }
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <SeriesCard
              title={t('admin.dashboard.checkins_per_day')}
              data={q.data?.daily}
              dataKey="checkins"
              empty={t('admin.dashboard.no_checkins')}
              format={(v) => f.number(v)}
            />
            <SeriesCard
              title={t('admin.dashboard.revenue_per_day')}
              data={q.data?.daily}
              dataKey="revenue"
              empty={t('admin.dashboard.no_revenue')}
              format={(v) => f.money(v)}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title={t('admin.dashboard.expiring_list')} />
              {!q.data ? (
                <div className="p-4">
                  <Skeleton className="h-32" />
                </div>
              ) : q.data.expiringList.length === 0 ? (
                <EmptyState icon={CalendarClock} title={t('admin.dashboard.no_expiring')} />
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {q.data.expiringList.map((m) => (
                    <li key={m.memberId}>
                      <Link
                        to={`/members/${m.memberId}`}
                        className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-bg-surface2"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{m.memberName}</p>
                          <p className="truncate text-xs text-text-secondary">{m.planName}</p>
                        </div>
                        <p className="tabular shrink-0 text-sm text-status-warning">
                          {m.endDate
                            ? t('admin.dashboard.until', { date: f.date(m.endDate) })
                            : t('admin.memberships.visits_left', { count: m.visitsRemaining ?? 0 })}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title={t('admin.dashboard.revenue_by_method')} />
              {!q.data ? (
                <div className="p-4">
                  <Skeleton className="h-32" />
                </div>
              ) : q.data.revenue.byMethod.length === 0 ? (
                <EmptyState icon={BarChart3} title={t('admin.dashboard.no_revenue')} />
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {q.data.revenue.byMethod.map((m) => (
                    <li
                      key={m.method}
                      className="flex items-center justify-between px-5 py-3 text-sm"
                    >
                      <span>
                        {t(`admin.payments.methods.${m.method}`)}{' '}
                        <span className="text-text-secondary">· {m.count}</span>
                      </span>
                      <span className="tabular font-semibold">{f.money(m.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string | undefined;
  hint?: string;
  tone?: 'warning';
}) {
  return (
    <Card className="min-w-0 px-4 py-4 sm:px-5">
      <p className="text-[11px] font-semibold tracking-wider text-text-secondary uppercase">
        {label}
      </p>
      {value === undefined ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <p
          className={cn(
            // Money values are long ("3.000 RSD"): scale down instead of overflowing the card.
            'tabular mt-1 font-bold',
            String(value).length > 9
              ? 'text-lg whitespace-nowrap sm:text-xl xl:text-2xl'
              : String(value).length > 6
                ? 'text-xl whitespace-nowrap xl:text-2xl'
                : 'text-3xl',
            tone === 'warning' && Number(value) > 0 && 'text-status-warning',
          )}
        >
          {value}
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-text-secondary">{hint}</p>}
    </Card>
  );
}

function SeriesCard({
  title,
  data,
  dataKey,
  empty,
  format,
}: {
  title: string;
  data: DashboardDto['daily'] | undefined;
  dataKey: 'checkins' | 'revenue';
  empty: string;
  format: (v: number) => string;
}) {
  const f = useFormat();
  const hasData = data?.some((d) => d[dataKey] !== 0);
  return (
    <Card>
      <CardHeader title={title} />
      {!data ? (
        <div className="p-4">
          <Skeleton className="h-56" />
        </div>
      ) : !hasData ? (
        <EmptyState icon={BarChart3} title={empty} />
      ) : (
        <div className="h-64 p-4" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={color.border.subtle} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => f.date(d).replace(/\.?\d{4}\.?$/, '')}
                tick={{ fill: color.text.secondary, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={16}
              />
              <YAxis
                tickFormatter={(v: number) =>
                  dataKey === 'revenue' ? f.number(v / 100) : f.number(v)
                }
                tick={{ fill: color.text.secondary, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={56}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: color.bg.surface2 }}
                contentStyle={{
                  background: color.bg.elevated,
                  border: `1px solid ${color.border.subtle}`,
                  borderRadius: 4,
                  fontSize: 12,
                }}
                labelFormatter={(d) => f.date(String(d))}
                formatter={(v) => [format(Number(v)), title]}
              />
              <Bar
                dataKey={dataKey}
                fill={color.accent[500]}
                radius={[2, 2, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
