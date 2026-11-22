import type { DocumentDto, DocumentKind, PartnerDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpenText,
  ClipboardList,
  FileText,
  Landmark,
  Plus,
  ReceiptText,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/States';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useCan } from '@/lib/me';
import { FinancePage } from '../purchases/FinancePage';
import { DocumentEditor } from './DocumentEditor';
import { PartnerCardTab } from './PartnerCardTab';
import { PartnersTab } from './PartnersTab';
import { StockCountTab } from './StockCountTab';

type Fixed = 'documents' | 'partners' | 'card' | 'count' | 'finance';
type DocTab = { id: string; kind: DocumentKind; doc?: DocumentDto; title: string };

/**
 * Poslovanje: one workspace with browser-like tabs. Fixed tabs for the lists, and every
 * opened or new document gets its own closable tab, so several can stay open at once.
 */
export function BusinessPage() {
  const { t } = useTranslation();
  const can = useCan();
  const [active, setActive] = useState<string>('documents');
  const [docs, setDocs] = useState<DocTab[]>([]);
  const [cardPartner, setCardPartner] = useState<PartnerDto | null>(null);

  const fixed: Array<{ id: Fixed; label: string; icon: LucideIcon; show: boolean }> = [
    { id: 'documents', label: t('admin.business.tabs.documents'), icon: ReceiptText, show: true },
    { id: 'partners', label: t('admin.business.tabs.partners'), icon: Users, show: true },
    { id: 'card', label: t('admin.business.tabs.card'), icon: BookOpenText, show: true },
    { id: 'count', label: t('admin.business.tabs.count'), icon: ClipboardList, show: true },
    {
      id: 'finance',
      label: t('admin.business.tabs.finance'),
      icon: Landmark,
      show: can('finance.read'),
    },
  ];
  const openNew = (kind: DocumentKind) => {
    const id = `new-${Date.now()}`;
    setDocs((d) => [...d, { id, kind, title: t(`admin.business.new.${kind}`) }]);
    setActive(id);
  };
  const openDoc = (doc: DocumentDto) => {
    const id = `doc-${doc.id}`;
    setDocs((d) =>
      d.some((x) => x.id === id)
        ? d
        : [
            ...d,
            {
              id,
              kind: doc.kind,
              doc,
              title: `${t(`admin.business.short.${doc.kind}`)} ${doc.number}`,
            },
          ],
    );
    setActive(id);
  };
  const close = (id: string) => {
    setDocs((d) => d.filter((x) => x.id !== id));
    if (active === id) setActive('documents');
  };
  const current = docs.find((d) => d.id === active);

  return (
    <>
      <PageHeader title={t('admin.business.title')} subtitle={t('admin.business.subtitle')} />
      <div className="min-w-0">
        <div
          role="tablist"
          className="no-scrollbar flex items-end gap-1 overflow-x-auto overflow-y-hidden border-b border-border-strong px-1"
        >
          {fixed
            .filter((f) => f.show)
            .map((f) => (
              <TabButton
                key={f.id}
                active={active === f.id}
                icon={f.icon}
                label={f.label}
                onClick={() => setActive(f.id)}
              />
            ))}
          {docs.map((d) => (
            <TabButton
              key={d.id}
              active={active === d.id}
              icon={FileText}
              label={d.title}
              onClick={() => setActive(d.id)}
              onClose={() => close(d.id)}
            />
          ))}
        </div>
        <section className="rounded-b-md border border-t-0 border-border-strong bg-bg-surface p-3 sm:p-5">
          {active === 'documents' && <DocumentsList onOpen={openDoc} onNew={openNew} />}
          {active === 'partners' && (
            <PartnersTab
              onOpenCard={(p) => {
                setCardPartner(p);
                setActive('card');
              }}
            />
          )}
          {active === 'card' && (
            <PartnerCardTab
              partner={cardPartner}
              onPartner={setCardPartner}
              onOpenDocument={openDoc}
            />
          )}
          {active === 'count' && <StockCountTab />}
          {active === 'finance' && <FinancePage embedded />}
          {current && (
            <DocumentEditor
              key={current.id}
              kind={current.kind}
              doc={current.doc}
              onClose={() => close(current.id)}
              onSaved={(doc) => {
                // The new-document tab turns into the saved document.
                setDocs((d) =>
                  d.map((x) =>
                    x.id === current.id
                      ? {
                          id: `doc-${doc.id}`,
                          kind: doc.kind,
                          doc,
                          title: `${t(`admin.business.short.${doc.kind}`)} ${doc.number}`,
                        }
                      : x,
                  ),
                );
                setActive(`doc-${doc.id}`);
              }}
            />
          )}
        </section>
      </div>
    </>
  );
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
  onClose,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'group -mb-px flex h-10 max-w-56 shrink-0 items-center rounded-t-md border border-b-0 text-sm font-semibold transition-colors',
        active
          ? 'border-border-strong bg-bg-surface text-text-primary'
          : 'border-transparent text-text-secondary hover:bg-bg-surface2 hover:text-text-primary',
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={onClick}
        className="flex h-full min-w-0 items-center gap-2 ps-3 pe-3"
      >
        <Icon className={cn('size-4 shrink-0', active && 'text-accent-400')} aria-hidden />
        <span className="truncate">{label}</span>
      </button>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={`${t('common.close')}: ${label}`}
          className="me-1.5 inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-bg-surface2 hover:text-text-primary"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

type KindFilter = 'all' | DocumentKind;
type StatusFilter = 'all' | 'unpaid' | 'paid' | 'void';

function DocumentsList({
  onOpen,
  onNew,
}: {
  onOpen: (d: DocumentDto) => void;
  onNew: (k: DocumentKind) => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const [kind, setKind] = useState<KindFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [month, setMonth] = useState('');
  const [search, setSearch] = useState('');
  const q = useQuery({
    queryKey: ['business', 'documents', kind, status, month],
    queryFn: () =>
      api.get<DocumentDto[]>('/admin/documents', { kind, status, ...(month ? { month } : {}) }),
  });
  const rows = (q.data ?? []).filter((d) => {
    const s = search.trim().toLowerCase();
    return (
      !s ||
      d.number.toLowerCase().includes(s) ||
      d.partnerName.toLowerCase().includes(s) ||
      (d.partnerTaxId ?? '').includes(s)
    );
  });
  const badge = (d: DocumentDto) =>
    d.status === 'paid' ? (
      <Badge tone="success">{t('admin.purchases.status.paid')}</Badge>
    ) : d.status === 'void' ? (
      <Badge tone="neutral">{t('admin.purchases.status.void')}</Badge>
    ) : d.overdue ? (
      <Badge tone="danger">{t('admin.purchases.status.overdue')}</Badge>
    ) : (
      <Badge tone="warning">{t('admin.purchases.status.unpaid')}</Badge>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<Plus className="size-4" />} onClick={() => onNew('incoming_invoice')}>
          {t('admin.business.new.incoming_invoice')}
        </Button>
        <Button
          variant="secondary"
          icon={<Plus className="size-4" />}
          onClick={() => onNew('outgoing_invoice')}
        >
          {t('admin.business.new.outgoing_invoice')}
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          aria-label={t('common.search')}
          placeholder={t('admin.business.doc.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label={t('admin.business.doc.kind')}
          value={kind}
          onChange={(e) => setKind(e.target.value as KindFilter)}
        >
          <option value="all">{t('admin.business.kinds.all')}</option>
          <option value="incoming_invoice">{t('admin.business.kinds.incoming_invoice')}</option>
          <option value="outgoing_invoice">{t('admin.business.kinds.outgoing_invoice')}</option>
        </Select>
        <Select
          aria-label={t('admin.fields.status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          {(['all', 'unpaid', 'paid', 'void'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`admin.purchases.status.${s}`)}
            </option>
          ))}
        </Select>
        <Input
          type="month"
          aria-label={t('admin.earnings.month')}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>
      {q.isPending ? (
        <TableSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ReceiptText} title={t('admin.purchases.empty')} />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border-subtle">
          <table className="w-full min-w-[820px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
            <thead className="bg-bg-surface2 text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-3 py-2 text-start">{t('admin.business.doc.internal_no')}</th>
                <th className="px-2 py-2 text-start">{t('admin.business.doc.kind')}</th>
                <th className="px-2 py-2 text-start">{t('admin.business.doc.partner')}</th>
                <th className="px-2 py-2 text-start">{t('admin.business.doc.number')}</th>
                <th className="px-2 py-2 text-start">{t('admin.business.doc.turnover_on')}</th>
                <th className="px-2 py-2 text-start">{t('admin.business.doc.due_on')}</th>
                <th className="px-2 py-2 text-end">{t('admin.business.doc.total_vat')}</th>
                <th className="px-2 py-2 text-end">{t('admin.business.doc.total')}</th>
                <th className="px-3 py-2 text-start">{t('admin.fields.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((d) => (
                <tr
                  key={d.id}
                  className={cn(
                    'cursor-pointer hover:bg-bg-surface2',
                    d.status === 'void' && 'opacity-60',
                  )}
                  onClick={() => onOpen(d)}
                >
                  <td className="tabular px-3 py-2.5 text-text-secondary">
                    {String(d.internalNo).padStart(5, '0')}
                  </td>
                  <td className="px-2 py-2.5">{t(`admin.business.short.${d.kind}`)}</td>
                  <td className="max-w-56 truncate px-2 py-2.5 font-semibold">{d.partnerName}</td>
                  <td className="px-2 py-2.5">{d.number}</td>
                  <td className="tabular px-2 py-2.5">{f.date(d.turnoverOn)}</td>
                  <td className="tabular px-2 py-2.5">{d.dueOn ? f.date(d.dueOn) : '-'}</td>
                  <td className="tabular px-2 py-2.5 text-end">
                    {f.money2(d.vatAmount, d.currency)}
                  </td>
                  <td className="tabular px-2 py-2.5 text-end font-semibold">
                    {f.money2(d.totalAmount, d.currency)}
                  </td>
                  <td className="px-3 py-2.5">{badge(d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
