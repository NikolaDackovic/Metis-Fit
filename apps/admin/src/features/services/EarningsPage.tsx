import type { EarningsDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Printer, Wallet } from 'lucide-react';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';

const thisMonth = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Belgrade' }).slice(0, 7);

/**
 * Monthly trainer earnings: PT sessions and services with the share frozen at the time of the
 * sale. `mine` = a trainer's own view (no other trainers' amounts).
 */
export function EarningsPage({ mine = false }: { mine?: boolean }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const [month, setMonth] = useState(thisMonth());
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['earnings', mine, month, i18n.language],
    queryFn: () =>
      api.get<EarningsDto>(mine ? '/admin/my-earnings' : '/admin/trainer-earnings', {
        month,
        locale: i18n.language,
      }),
  });

  return (
    <>
      <PageHeader
        title={mine ? t('admin.earnings.mine_title') : t('admin.earnings.title')}
        subtitle={t('admin.earnings.subtitle')}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Input
              type="month"
              aria-label={t('admin.earnings.month')}
              value={month}
              max={thisMonth()}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="w-40"
            />
            <Button
              variant="secondary"
              icon={<Printer className="size-4" />}
              onClick={() => window.print()}
            >
              {t('admin.earnings.print')}
            </Button>
          </div>
        }
      />
      {q.isPending ? (
        <Skeleton className="h-64" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data.trainers.length || q.data.total === 0 ? (
        <Card>
          <EmptyState icon={Wallet} title={t('admin.earnings.empty')} />
        </Card>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-xs text-text-secondary">
                <th className="px-4 py-2 text-start">{t('admin.services.trainer')}</th>
                <th className="px-2 py-2 text-end">{t('admin.earnings.pt')}</th>
                <th className="px-2 py-2 text-end">{t('admin.earnings.services')}</th>
                <th className="px-4 py-2 text-end">{t('admin.earnings.total')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {q.data.trainers.map((tr) => (
                <Fragment key={tr.trainerId}>
                  <tr
                    className="cursor-pointer hover:bg-bg-surface2"
                    onClick={() => setOpen(open === tr.trainerId ? null : tr.trainerId)}
                  >
                    <td className="px-4 py-2.5 font-semibold">
                      <span className="inline-flex items-center gap-1">
                        {open === tr.trainerId ? (
                          <ChevronUp className="size-4" />
                        ) : (
                          <ChevronDown className="size-4" />
                        )}
                        {tr.trainerName}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-end tabular-nums">
                      {tr.ptSessions} · {f.money(tr.ptShare)}
                    </td>
                    <td className="px-2 py-2.5 text-end tabular-nums">
                      {f.money(tr.servicesShare)}
                    </td>
                    <td className="px-4 py-2.5 text-end font-bold tabular-nums">
                      {f.money(tr.total)}
                    </td>
                  </tr>
                  {open === tr.trainerId &&
                    tr.services.map((s) => (
                      <tr
                        key={`${tr.trainerId}-${s.serviceId}`}
                        className="bg-bg-surface2/50 text-xs"
                      >
                        <td className="px-10 py-1.5">{s.name}</td>
                        <td className="px-2 py-1.5 text-end tabular-nums">{s.count}×</td>
                        <td className="px-2 py-1.5 text-end tabular-nums text-text-secondary">
                          {t('admin.earnings.revenue', { amount: f.money(s.revenue) })}
                        </td>
                        <td className="px-4 py-1.5 text-end tabular-nums">{f.money(s.share)}</td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
            {!mine && (
              <tfoot>
                <tr className="border-t border-border-subtle font-bold">
                  <td className="px-4 py-2.5" colSpan={3}>
                    {t('admin.earnings.total_all')}
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums">{f.money(q.data.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          <p className="px-4 py-3 text-xs text-text-secondary">{t('admin.earnings.note')}</p>
        </Card>
      )}
    </>
  );
}
