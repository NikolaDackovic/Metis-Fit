import type { AlertsDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import {
  Cake,
  CircleDollarSign,
  Clock,
  Moon,
  PauseCircle,
  Phone,
  Smartphone,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useCan } from '@/lib/me';
import { ActivateMembershipModal } from '../members/ActivateMembershipModal';
import { usePauseDecision } from '../members/PausesModal';

type Row = { memberId: string; name: string; memberNumber: string; phone: string | null };

export function useAlerts() {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['alerts', i18n.language],
    queryFn: () => api.get<AlertsDto>('/admin/alerts', { locale: i18n.language }),
    refetchInterval: 5 * 60_000,
  });
}

/** Number shown next to "Upozorenja" in the menu: things someone should act on. */
export const alertCount = (a: AlertsDto | undefined) =>
  a
    ? a.requests.length +
      a.pauseRequests.length +
      a.expiring.length +
      a.debts.length +
      a.inactive.length +
      a.birthdays.filter((b) => b.inDays === 0).length
    : 0;

/** Alert center: what the front desk and the owner should act on today. */
export function AlertsPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const q = useAlerts();
  const can = useCan();
  const [activate, setActivate] = useState<AlertsDto['requests'][number] | null>(null);
  const decide = usePauseDecision();

  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const a = q.data;
  return (
    <>
      <PageHeader title={t('admin.alerts.title')} subtitle={t('admin.alerts.subtitle')} />
      {!a ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Section
            icon={Smartphone}
            title={t('admin.alerts.requests')}
            hint={t('admin.alerts.requests_hint')}
            empty={t('admin.alerts.requests_empty')}
            rows={a.requests}
            render={(r) => (
              <>
                <span className="truncate text-text-secondary">
                  {r.planName} · {f.money(r.amount, r.currency)}
                </span>
                {can('memberships.create') && (
                  <Button size="sm" onClick={() => setActivate(r)}>
                    {t('admin.memberships.activate')}
                  </Button>
                )}
              </>
            )}
          />
          <Section
            icon={PauseCircle}
            title={t('admin.alerts.pause_requests')}
            hint={t('admin.alerts.pause_requests_hint')}
            empty={t('admin.alerts.pause_requests_empty')}
            rows={a.pauseRequests}
            rowKey={(r) => r.pauseId}
            render={(r) => (
              <>
                <span className="tabular truncate text-text-secondary">
                  {f.date(r.startsOn)} - {f.date(r.endsOn)}
                </span>
                {can('memberships.pause') && (
                  <>
                    <Button
                      size="sm"
                      loading={decide.isPending && decide.variables?.id === r.pauseId}
                      onClick={() => decide.mutate({ id: r.pauseId, action: 'approve' })}
                    >
                      {t('admin.pauses.approve')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => decide.mutate({ id: r.pauseId, action: 'reject' })}
                    >
                      {t('admin.pauses.reject')}
                    </Button>
                  </>
                )}
              </>
            )}
          />
          <Section
            icon={Clock}
            title={t('admin.alerts.expiring', { days: a.settings.expiringDays })}
            empty={t('admin.alerts.expiring_empty')}
            rows={a.expiring}
            render={(r) => (
              <>
                <span className="truncate text-text-secondary">{r.planName}</span>
                <Badge tone={r.daysLeft <= 1 ? 'danger' : 'warning'}>
                  {r.daysLeft === 0
                    ? t('admin.alerts.today')
                    : t('admin.alerts.days_left', { days: r.daysLeft })}
                </Badge>
              </>
            )}
          />
          <Section
            icon={CircleDollarSign}
            title={t('admin.alerts.debts')}
            empty={t('admin.alerts.debts_empty')}
            rows={a.debts}
            render={(r) => (
              <>
                <span className="truncate text-text-secondary">{r.planName}</span>
                <span className="font-semibold tabular-nums text-status-danger">
                  {f.money(r.amount, r.currency)}
                </span>
              </>
            )}
          />
          <Section
            icon={Moon}
            title={t('admin.alerts.inactive', { days: a.settings.inactiveDays })}
            hint={t('admin.alerts.inactive_hint')}
            empty={t('admin.alerts.inactive_empty')}
            rows={a.inactive}
            render={(r) => (
              <span className="text-text-secondary">
                {r.daysSince == null
                  ? t('admin.alerts.never')
                  : t('admin.alerts.days_since', { days: r.daysSince })}
              </span>
            )}
          />
          <Section
            icon={Cake}
            title={t('admin.alerts.birthdays')}
            empty={t('admin.alerts.birthdays_empty')}
            rows={a.birthdays}
            render={(r) => (
              <>
                <span className="text-text-secondary">
                  {r.inDays === 0 ? t('admin.alerts.today') : f.date(r.date)}
                  {r.age ? ` · ${t('admin.alerts.turns', { age: r.age })}` : ''}
                </span>
                {r.inDays === 0 && <Badge tone="accent">🎂</Badge>}
              </>
            )}
          />
          <Section
            icon={UserPlus}
            title={t('admin.alerts.signups')}
            empty={t('admin.alerts.signups_empty')}
            rows={a.signups}
            render={(r) => (
              <>
                <span className="text-text-secondary">{f.dateTime(r.createdAt)}</span>
                {!r.hasMembership && (
                  <Badge tone="warning">{t('admin.alerts.no_membership')}</Badge>
                )}
              </>
            )}
          />
        </div>
      )}
      {activate && (
        <ActivateMembershipModal
          membership={{
            id: activate.membershipId,
            planName: activate.planName,
            priceAmount: activate.amount,
            currency: activate.currency,
          }}
          onClose={() => setActivate(null)}
        />
      )}
    </>
  );
}

function Section<T extends Row>({
  icon: Icon,
  title,
  hint,
  empty,
  rows,
  render,
  rowKey = (r) => r.memberId,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  empty: string;
  rows: T[];
  render: (r: T) => ReactNode;
  rowKey?: (r: T) => string;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <Icon className="size-4 shrink-0 text-accent-400" aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
        {rows.length > 0 && <Badge tone="neutral">{rows.length}</Badge>}
      </div>
      {hint && rows.length > 0 && <p className="px-4 pt-3 text-xs text-text-secondary">{hint}</p>}
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-text-secondary">{empty}</p>
      ) : (
        <ul className="max-h-96 divide-y divide-border-subtle overflow-y-auto">
          {rows.map((r) => (
            <li key={rowKey(r)} className="flex min-w-0 items-center gap-3 px-4 py-2.5 text-sm">
              <Link
                to={`/members/${r.memberId}`}
                className="min-w-28 flex-1 truncate font-semibold hover:text-accent-400"
              >
                {r.name}
                <span className="ms-2 text-xs font-normal text-text-muted">{r.memberNumber}</span>
              </Link>
              <div className="flex min-w-0 shrink items-center justify-end gap-2">{render(r)}</div>
              {r.phone && (
                <a
                  href={`tel:${r.phone}`}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-bg-surface2 hover:text-text-primary"
                  aria-label={`${t('admin.alerts.call')} ${r.name}`}
                  title={r.phone}
                >
                  <Phone className="size-4" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
