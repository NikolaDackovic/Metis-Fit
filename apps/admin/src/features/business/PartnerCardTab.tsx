import type { DocumentDto, PartnerCardDto, PartnerDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { BookOpenText, Printer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { partnerRoles, usePartners } from './PartnersTab';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Belgrade' });
const yearStart = () => `${today().slice(0, 4)}-01-01`;

/**
 * Kartica komitenta: all documents with one partner in a period, what came in (bought),
 * what went out (sold), what is still open and the balance.
 */
export function PartnerCardTab({
  partner,
  onPartner,
  onOpenDocument,
}: {
  partner: PartnerDto | null;
  onPartner: (p: PartnerDto | null) => void;
  onOpenDocument: (d: DocumentDto) => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const partners = usePartners();
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const q = useQuery({
    queryKey: ['business', 'card', partner?.id, from, to],
    queryFn: () => api.get<PartnerCardDto>(`/admin/partners/${partner!.id}/card`, { from, to }),
    enabled: Boolean(partner) && from <= to,
  });
  const open = async (id: string) =>
    onOpenDocument(await api.get<DocumentDto>(`/admin/documents/${id}`));
  const money = (n: number) => f.money2(n);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
        <Select
          aria-label={t('admin.business.doc.partner')}
          value={partner?.id ?? ''}
          onChange={(e) => onPartner(partners.data?.find((p) => p.id === e.target.value) ?? null)}
        >
          <option value="">{t('admin.business.card.pick')}</option>
          {(partners.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.taxId ? ` · ${p.taxId}` : ''}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          aria-label={t('admin.business.card.from')}
          value={from}
          max={to}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          type="date"
          aria-label={t('admin.business.card.to')}
          value={to}
          min={from}
          onChange={(e) => setTo(e.target.value)}
        />
        <Button
          variant="secondary"
          icon={<Printer className="size-4" />}
          onClick={() => window.print()}
          disabled={!q.data}
        >
          {t('admin.earnings.print')}
        </Button>
      </div>

      {!partner ? (
        <EmptyState
          icon={BookOpenText}
          title={t('admin.business.card.pick')}
          description={t('admin.business.card.hint')}
        />
      ) : q.isPending ? (
        <TableSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="text-lg font-bold">{q.data.partner.name}</h2>
            <span className="text-sm text-text-secondary">
              {[
                q.data.partner.taxId && `PIB ${q.data.partner.taxId}`,
                q.data.partner.registryNo && `MB ${q.data.partner.registryNo}`,
                q.data.partner.city,
                partnerRoles(q.data.partner, t),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <Stat label={t('admin.business.card.incoming')} value={money(q.data.totals.incoming)} />
            <Stat label={t('admin.business.card.outgoing')} value={money(q.data.totals.outgoing)} />
            <Stat
              label={t('admin.business.card.incoming_unpaid')}
              value={money(q.data.totals.incomingUnpaid)}
            />
            <Stat
              label={t('admin.business.card.outgoing_unpaid')}
              value={money(q.data.totals.outgoingUnpaid)}
            />
            <Stat
              label={t('admin.business.card.balance')}
              value={money(q.data.totals.balance)}
              hint={t(
                q.data.totals.balance > 0
                  ? 'admin.business.card.they_owe'
                  : q.data.totals.balance < 0
                    ? 'admin.business.card.we_owe'
                    : 'admin.business.card.settled',
              )}
              tone={
                q.data.totals.balance < 0
                  ? 'warning'
                  : q.data.totals.balance > 0
                    ? 'accent'
                    : undefined
              }
            />
          </div>
          {q.data.rows.length === 0 ? (
            <EmptyState icon={BookOpenText} title={t('admin.business.card.empty')} />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border-subtle">
              <table className="w-full min-w-[760px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                <thead className="bg-bg-surface2 text-xs uppercase tracking-wide text-text-secondary">
                  <tr>
                    <th className="px-3 py-2 text-start">{t('admin.business.doc.turnover_on')}</th>
                    <th className="px-2 py-2 text-start">{t('admin.business.doc.kind')}</th>
                    <th className="px-2 py-2 text-start">{t('admin.business.doc.number')}</th>
                    <th className="px-2 py-2 text-start">{t('admin.business.doc.due_on')}</th>
                    <th className="px-2 py-2 text-end">{t('admin.business.card.col_in')}</th>
                    <th className="px-2 py-2 text-end">{t('admin.business.card.col_out')}</th>
                    <th className="px-3 py-2 text-start">{t('admin.fields.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {q.data.rows.map((r) => (
                    <tr
                      key={r.id}
                      className={cn(
                        'cursor-pointer hover:bg-bg-surface2',
                        r.status === 'void' && 'opacity-50 line-through',
                      )}
                      onClick={() => void open(r.id)}
                    >
                      <td className="tabular px-3 py-2">{f.date(r.turnoverOn)}</td>
                      <td className="px-2 py-2">{t(`admin.business.short.${r.kind}`)}</td>
                      <td className="px-2 py-2">{r.number}</td>
                      <td className="tabular px-2 py-2">{r.dueOn ? f.date(r.dueOn) : '-'}</td>
                      <td className="tabular px-2 py-2 text-end">
                        {r.kind === 'incoming_invoice' ? money(r.totalAmount) : ''}
                      </td>
                      <td className="tabular px-2 py-2 text-end">
                        {r.kind === 'outgoing_invoice' ? money(r.totalAmount) : ''}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          tone={
                            r.status === 'paid'
                              ? 'success'
                              : r.status === 'void'
                                ? 'neutral'
                                : 'warning'
                          }
                        >
                          {t(`admin.purchases.status.${r.status}`)}
                          {r.paidOn ? ` ${f.date(r.paidOn)}` : ''}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border-strong font-semibold">
                  <tr>
                    <td className="px-3 py-2" colSpan={4}>
                      {t('admin.business.doc.total')}
                    </td>
                    <td className="tabular px-2 py-2 text-end">{money(q.data.totals.incoming)}</td>
                    <td className="tabular px-2 py-2 text-end">{money(q.data.totals.outgoing)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'warning' | 'accent';
}) {
  return (
    <div className="min-w-0 rounded-md border border-border-subtle bg-bg-surface2 px-4 py-3">
      <p className="truncate text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <p
        className={cn(
          'tabular mt-1 truncate text-lg font-bold',
          tone === 'warning' && 'text-status-warning',
          tone === 'accent' && 'text-accent-400',
        )}
      >
        {value}
      </p>
      {hint && <p className="truncate text-xs text-text-secondary">{hint}</p>}
    </div>
  );
}
