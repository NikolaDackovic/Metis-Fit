import type { FinanceDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Printer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Input } from '@/components/ui/Field';
import { Card, CardHeader, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useCan } from '@/lib/me';

const thisMonth = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Belgrade' }).slice(0, 7);

/**
 * Monthly business overview: money in (membership payments, services, café) against money
 * out (incoming invoices by category and trainer shares). An overview for the owner, not
 * bookkeeping: the accountant's books and the fiscal records stay the official numbers.
 */
export function FinancePage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const [month, setMonth] = useState(thisMonth());
  const q = useQuery({
    queryKey: ['finance', month],
    queryFn: () => api.get<FinanceDto>('/admin/finance', { month }),
  });

  const controls = (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Input
        type="month"
        aria-label={t('admin.earnings.month')}
        value={month}
        max={thisMonth()}
        onChange={(e) => e.target.value && setMonth(e.target.value)}
        className="w-44!"
      />
      <Button
        variant="secondary"
        icon={<Printer className="size-4" />}
        onClick={() => window.print()}
      >
        {t('admin.earnings.print')}
      </Button>
    </div>
  );

  return (
    <>
      {embedded ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">{t('admin.finance.subtitle')}</p>
          {controls}
        </div>
      ) : (
        <PageHeader
          title={t('admin.finance.title')}
          subtitle={t('admin.finance.subtitle')}
          actions={controls}
        />
      )}
      {q.isPending ? (
        <Skeleton className="h-64" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <Overview d={q.data} />
      )}
      {q.data && q.data.unpaidInvoices.count > 0 && (
        <Card className="mt-4">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <AlertTriangle
              className={cn(
                'size-4 shrink-0',
                q.data.unpaidInvoices.overdue ? 'text-status-danger' : 'text-status-warning',
              )}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              {t('admin.finance.unpaid', {
                count: q.data.unpaidInvoices.count,
                amount: f.money(q.data.unpaidInvoices.amount, q.data.currency),
              })}
              {q.data.unpaidInvoices.overdue > 0 &&
                ` · ${t('admin.finance.overdue', { count: q.data.unpaidInvoices.overdue })}`}
            </span>
            {can('purchases.manage') && (
              <Link to="/business" className="font-semibold text-accent-400 hover:underline">
                {t('admin.finance.open_invoices')}
              </Link>
            )}
          </div>
        </Card>
      )}
      <p className="mt-4 text-xs text-text-muted">{t('admin.finance.note')}</p>
    </>
  );
}

function Overview({ d }: { d: FinanceDto }) {
  const { t } = useTranslation();
  const f = useFormat();
  const money = (n: number) => f.money(n, d.currency);
  const income = [
    { label: t('admin.finance.income_memberships'), amount: d.income.memberships },
    { label: t('admin.finance.income_services'), amount: d.income.services },
    { label: t('admin.finance.income_cafe'), amount: d.income.cafe },
    { label: t('admin.finance.income_invoices'), amount: d.income.invoices },
  ];
  const costs = [
    ...d.costs.byCategory.map((c) => ({
      label: t(`admin.purchases.categories.${c.category}`),
      amount: c.amount,
    })),
    ...(d.costs.trainerShares
      ? [{ label: t('admin.finance.trainer_shares'), amount: d.costs.trainerShares }]
      : []),
  ];
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t('admin.finance.income')} value={money(d.income.total)} />
        <Stat label={t('admin.finance.costs')} value={money(d.costs.total)} />
        <Stat
          label={t('admin.finance.result')}
          value={money(d.result)}
          tone={d.result < 0 ? 'danger' : 'success'}
        />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Breakdown
          title={t('admin.finance.income')}
          rows={income}
          total={d.income.total}
          money={money}
        />
        <Breakdown
          title={t('admin.finance.costs')}
          rows={costs}
          total={d.costs.total}
          money={money}
          empty={t('admin.finance.no_costs')}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('admin.finance.vat_input')} value={money(d.vat.input)} small />
        <Stat label={t('admin.finance.vat_output')} value={money(d.vat.output)} small />
        <Stat
          label={t(d.vat.balance >= 0 ? 'admin.finance.vat_payable' : 'admin.finance.vat_refund')}
          value={money(Math.abs(d.vat.balance))}
          small
        />
        <Stat
          label={t('admin.finance.receivables', { count: d.receivables.count })}
          value={money(d.receivables.amount)}
          small
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  small = false,
}: {
  label: string;
  value: string;
  tone?: 'danger' | 'success';
  small?: boolean;
}) {
  return (
    <Card>
      <div className="px-4 py-4">
        <p className="truncate text-xs font-semibold tracking-wide text-text-secondary uppercase">
          {label}
        </p>
        <p
          className={cn(
            'tabular mt-1 truncate font-bold',
            small ? 'text-lg' : 'text-lg sm:text-xl xl:text-2xl',
            tone === 'danger' && 'text-status-danger',
            tone === 'success' && 'text-status-success',
          )}
        >
          {value}
        </p>
      </div>
    </Card>
  );
}

function Breakdown({
  title,
  rows,
  total,
  money,
  empty,
}: {
  title: string;
  rows: Array<{ label: string; amount: number }>;
  total: number;
  money: (n: number) => string;
  empty?: string;
}) {
  return (
    <Card>
      <CardHeader title={title} />
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-text-secondary">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3 px-4 py-4">
          {rows.map((r) => (
            <li key={r.label} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">{r.label}</span>
                <span className="tabular shrink-0 font-semibold">{money(r.amount)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-surface2" aria-hidden>
                <div
                  className="h-full rounded-full bg-accent-500"
                  style={{ width: `${total > 0 ? Math.round((r.amount / total) * 100) : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
