import type { PaymentDto } from '@grit/validation';
import { PAYMENT_METHODS } from '@grit/validation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, Input, Select } from '@/components/ui/Field';
import {
  Card,
  EmptyState,
  ErrorState,
  FiscalNotice,
  PageHeader,
  TableSkeleton,
} from '@/components/ui/States';
import { Pagination } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { addDays, clubToday, useFormat } from '@/lib/format';
import { PaymentList } from './PaymentList';

export function PaymentsPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const [from, setFrom] = useState(addDays(clubToday(), -29));
  const [to, setTo] = useState(clubToday());
  const [method, setMethod] = useState('');
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ['payments', { from, to, method, page }],
    queryFn: () =>
      api.page<PaymentDto[]>('/admin/payments', {
        from,
        to,
        method: method || undefined,
        page,
        pageSize: 50,
      }),
    placeholderData: keepPreviousData,
  });

  const total = q.data?.items
    .filter((p) => p.status === 'recorded')
    .reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <PageHeader title={t('admin.payments.title')} subtitle={t('admin.payments.subtitle')} />
      <div className="mb-4">
        <FiscalNotice />
      </div>
      <Card>
        <div className="grid grid-cols-2 gap-3 border-b border-border-subtle p-4 md:flex md:flex-wrap md:items-end md:gap-4">
          <Field label={t('admin.fields.from')}>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={from}
                max={to}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            )}
          </Field>
          <Field label={t('admin.fields.to')}>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={to}
                min={from}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            )}
          </Field>
          <Field label={t('admin.fields.method')}>
            {(p) => (
              <Select
                {...p}
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t('admin.members.all')}</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`admin.payments.methods.${m}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {total !== undefined && q.data && q.data.meta.total <= q.data.meta.pageSize && (
            <p className="col-span-2 text-sm text-text-secondary md:ms-auto">
              {t('admin.payments.period_total')}{' '}
              <span className="tabular text-lg font-bold text-text-primary">{f.money(total)}</span>
            </p>
          )}
        </div>
        {q.isPending ? (
          <TableSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState icon={CreditCard} title={t('admin.payments.empty_period')} />
        ) : (
          <>
            <PaymentList items={q.data.items} showMember />
            <Pagination
              page={q.data.meta.page}
              pageSize={q.data.meta.pageSize}
              total={q.data.meta.total}
              onPage={setPage}
            />
          </>
        )}
      </Card>
    </>
  );
}
