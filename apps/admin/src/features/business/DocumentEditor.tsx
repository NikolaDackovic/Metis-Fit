import type { CafeCategoryDto, DocumentDto, DocumentKind, PartnerDto } from '@grit/validation';
import {
  DOCUMENT_UNITS,
  EXPENSE_CATEGORIES,
  lineAmounts,
  PURCHASE_PAYMENT_METHODS,
  VAT_RATES,
} from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileUp, Plus, Printer, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ReasonDialog } from '@/components/ui/ReasonDialog';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { parseMoneyInput, useFormat } from '@/lib/format';
import { downloadTemplate, readLinesFile } from './import-lines';
import { PartnerModal, usePartners } from './PartnersTab';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Belgrade' });
const errKey = (e: unknown) => (e instanceof ApiError ? e.message : 'errors.internal');
type Method = (typeof PURCHASE_PAYMENT_METHODS)[number];
type Unit = (typeof DOCUMENT_UNITS)[number];
type Category = (typeof EXPENSE_CATEGORIES)[number];

type Line = {
  key: number;
  cafeItemId: string | null;
  category: Category;
  name: string;
  unit: Unit;
  qty: string;
  price: string;
  discount: string;
  vat: string;
};
let nextKey = 1;
const blank = (kind: DocumentKind): Line => ({
  key: nextKey++,
  cafeItemId: null,
  category: kind === 'incoming_invoice' ? 'goods' : 'other',
  name: '',
  unit: 'kom',
  qty: '',
  price: '',
  discount: '',
  vat: '20',
});
const num = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return s.trim() === '' ? null : Number.isFinite(n) ? n : NaN;
};

function useCafeItems() {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['cafe', 'admin-menu', i18n.language],
    queryFn: () => api.get<CafeCategoryDto[]>('/admin/cafe/menu', { locale: i18n.language }),
    select: (cats) => cats.flatMap((c) => c.items),
  });
}

/** New document (editable grid) or an existing one (read-only, with pay / void). */
export function DocumentEditor({
  kind,
  doc,
  onSaved,
  onClose,
}: {
  kind: DocumentKind;
  doc?: DocumentDto;
  onSaved: (d: DocumentDto) => void;
  onClose: () => void;
}) {
  return doc ? (
    <DocumentView doc={doc} onClose={onClose} />
  ) : (
    <DocumentForm kind={kind} onSaved={onSaved} onClose={onClose} />
  );
}

function Totals({
  t,
  money,
  s,
}: {
  t: (k: string) => string;
  money: (n: number) => string;
  s: { gross: number; discount: number; net: number; vat: number; total: number };
}) {
  const row = (label: string, v: number, strong = false) => (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 px-3 py-1.5',
        strong && 'border-t border-border-subtle py-2.5 text-base',
      )}
    >
      <span className={strong ? 'font-semibold' : 'text-text-secondary'}>{label}</span>
      <span className={cn('tabular', strong ? 'font-bold text-accent-400' : 'font-semibold')}>
        {money(v)}
      </span>
    </div>
  );
  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface2 text-sm">
      {row(t('admin.business.doc.total_gross'), s.gross)}
      {row(t('admin.business.doc.total_discount'), s.discount)}
      {row(t('admin.business.doc.total_net'), s.net)}
      {row(t('admin.business.doc.total_vat'), s.vat)}
      {row(t('admin.business.doc.total'), s.total, true)}
    </div>
  );
}

function DocumentForm({
  kind: initialKind,
  onSaved,
  onClose,
}: {
  kind: DocumentKind;
  onSaved: (d: DocumentDto) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const partners = usePartners();
  const items = useCafeItems();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DocumentKind>(initialKind);
  const [partnerId, setPartnerId] = useState('');
  const [partnerQuery, setPartnerQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addPartner, setAddPartner] = useState(false);
  const [number, setNumber] = useState('');
  const [turnoverOn, setTurnoverOn] = useState(today());
  const [dueOn, setDueOn] = useState('');
  const [note, setNote] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [paidNow, setPaidNow] = useState(false);
  const [method, setMethod] = useState<Method>('bank_transfer');
  const [lines, setLines] = useState<Line[]>([blank(initialKind)]);
  const [importMsg, setImportMsg] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eligible = (partners.data ?? []).filter(
    (p) => p.isActive && (kind === 'incoming_invoice' ? p.isSupplier : p.isCustomer),
  );
  const partner = partners.data?.find((p) => p.id === partnerId) ?? null;
  const matches = eligible
    .filter((p) => {
      const q = partnerQuery.trim().toLowerCase();
      return (
        !q || p.name.toLowerCase().includes(q) || (p.taxId ?? '').includes(q.replace(/\s/g, ''))
      );
    })
    .slice(0, 8);

  const parsed = lines.map((l) => {
    const qty = num(l.qty);
    const price = parseMoneyInput(l.price);
    const discount = num(l.discount) ?? 0;
    const vat = num(l.vat) ?? 0;
    const ok =
      l.name.trim() !== '' &&
      qty !== null &&
      !Number.isNaN(qty) &&
      qty > 0 &&
      price !== null &&
      !Number.isNaN(discount) &&
      discount >= 0 &&
      discount <= 100 &&
      !Number.isNaN(vat) &&
      (!l.cafeItemId || Number.isInteger(qty));
    const empty = !l.name.trim() && !l.qty.trim() && !l.price.trim();
    const a = ok
      ? lineAmounts({ qty: qty!, unitPrice: price!, discountPct: discount, vatRate: vat })
      : null;
    return { l, qty, price, discount, vat, ok, empty, a };
  });
  const filled = parsed.filter((p) => !p.empty);
  const sum = filled.reduce(
    (s, p) =>
      p.a
        ? {
            gross: s.gross + p.a.gross,
            discount: s.discount + p.a.discount,
            net: s.net + p.a.net,
            vat: s.vat + p.a.vat,
            total: s.total + p.a.total,
          }
        : s,
    { gross: 0, discount: 0, net: 0, vat: 0, total: 0 },
  );
  const valid =
    partnerId &&
    number.trim() &&
    filled.length > 0 &&
    filled.every((p) => p.ok) &&
    (!dueOn || dueOn >= turnoverOn);

  const setLine = (key: number, patch: Partial<Line>) =>
    setLines((ls) => {
      const next = ls.map((l) => (l.key === key ? { ...l, ...patch } : l));
      // Typing into the last row opens a new empty one (like a spreadsheet).
      const last = next[next.length - 1]!;
      return last.name || last.qty || last.price ? [...next, blank(kind)] : next;
    });

  async function onImport(file: File) {
    const r = await readLinesFile(file);
    const msgs = r.errors.map(
      (e) => (e.row ? `${t('admin.business.import.row')} ${e.row}: ` : '') + t(e.key),
    );
    if (r.lines.length) {
      const byName = new Map((items.data ?? []).map((i) => [i.name.toLowerCase(), i]));
      setLines((ls) => [
        ...ls.filter((l) => l.name || l.qty || l.price),
        ...r.lines.map((x) => {
          const item = byName.get(x.name.toLowerCase());
          return {
            ...blank(kind),
            cafeItemId: item && x.unit === 'kom' && Number.isInteger(x.qty) ? item.id : null,
            name: x.name,
            unit: x.unit,
            qty: String(x.qty).replace('.', ','),
            price: x.price == null ? '' : String(x.price).replace('.', ','),
            discount: x.discountPct == null ? '' : String(x.discountPct),
            vat: x.vatRate == null ? '20' : String(x.vatRate),
          };
        }),
        blank(kind),
      ]);
      msgs.unshift(t('admin.business.import.done', { count: r.lines.length }));
    }
    setImportMsg(msgs);
  }

  const save = useMutation({
    mutationFn: () =>
      api.post<DocumentDto>('/admin/documents', {
        kind,
        partnerId,
        number: number.trim(),
        turnoverOn,
        dueOn: dueOn || null,
        note,
        internalNote,
        paid: paidNow ? { paidOn: turnoverOn, method } : null,
        lines: filled.map((p) => ({
          cafeItemId: p.l.cafeItemId,
          category: p.l.cafeItemId ? 'goods' : p.l.category,
          name: p.l.name.trim(),
          unit: p.l.unit,
          qty: p.qty,
          unitPrice: p.price,
          discountPct: p.discount,
          vatRate: p.vat,
        })),
      }),
    onSuccess: (d) => {
      toast.success(t('admin.purchases.saved'));
      for (const k of ['business', 'finance', 'cafe']) void qc.invalidateQueries({ queryKey: [k] });
      onSaved(d);
    },
    onError: (e) => setError(errKey(e)),
  });

  const label = 'text-xs font-semibold uppercase tracking-wide text-text-secondary';
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_minmax(260px,320px)]">
        <div className="grid content-start gap-3">
          <label className="grid gap-1">
            <span className={label}>{t('admin.business.doc.kind')}</span>
            <Select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as DocumentKind);
                setPartnerId('');
                setPartnerQuery('');
              }}
            >
              <option value="incoming_invoice">{t('admin.business.kinds.incoming_invoice')}</option>
              <option value="outgoing_invoice">{t('admin.business.kinds.outgoing_invoice')}</option>
            </Select>
          </label>
          <div className="grid gap-1">
            <span className={label}>{t('admin.business.doc.partner')}</span>
            <div className="relative flex gap-2">
              <Input
                aria-label={t('admin.business.doc.partner')}
                placeholder={t('admin.business.doc.partner_search')}
                value={
                  partner && !pickerOpen
                    ? `${partner.name}${partner.taxId ? ` · ${partner.taxId}` : ''}`
                    : partnerQuery
                }
                onFocus={() => setPickerOpen(true)}
                onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                onChange={(e) => {
                  setPartnerQuery(e.target.value);
                  setPartnerId('');
                  setPickerOpen(true);
                }}
              />
              <IconButton
                label={t('admin.business.partner.new')}
                className="shrink-0 border border-border-subtle"
                onClick={() => setAddPartner(true)}
              >
                <Plus className="size-4" />
              </IconButton>
              {pickerOpen && (
                <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-border-strong bg-bg-surface shadow-lg">
                  {matches.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-text-secondary">
                      {t('admin.business.doc.no_partner', {
                        role: t(
                          kind === 'incoming_invoice'
                            ? 'admin.business.partner.supplier'
                            : 'admin.business.partner.customer',
                        ).toLowerCase(),
                      })}
                    </li>
                  ) : (
                    matches.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm hover:bg-bg-surface2"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setPartnerId(p.id);
                            setPartnerQuery('');
                            setPickerOpen(false);
                          }}
                        >
                          <span className="min-w-0 truncate font-semibold">{p.name}</span>
                          <span className="tabular shrink-0 text-xs text-text-secondary">
                            {p.taxId ?? ''} {p.city ?? ''}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </div>
          <label className="grid gap-1">
            <span className={label}>{t('admin.business.doc.number')}</span>
            <Input
              value={number}
              placeholder={t('admin.business.doc.number_hint')}
              onChange={(e) => setNumber(e.target.value)}
            />
          </label>
        </div>
        <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <label className="grid gap-1">
            <span className={label}>{t('admin.business.doc.turnover_on')}</span>
            <Input type="date" value={turnoverOn} onChange={(e) => setTurnoverOn(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className={label}>{t('admin.business.doc.due_on')}</span>
            <Input
              type="date"
              value={dueOn}
              min={turnoverOn}
              onChange={(e) => setDueOn(e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            <span className={label}>{t('admin.fields.note')}</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className={label}>{t('admin.business.doc.internal_note')}</span>
            <Input
              value={internalNote}
              placeholder={t('admin.business.doc.internal_note_hint')}
              onChange={(e) => setInternalNote(e.target.value)}
            />
          </label>
        </div>
        <Totals t={t} money={(n) => f.money2(n)} s={sum} />
      </div>

      <div className="overflow-x-auto rounded-md border border-border-subtle">
        <table className="w-full min-w-[900px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead className="bg-bg-surface2 text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="w-8 px-2 py-2 text-start">#</th>
              <th className="px-2 py-2 text-start">{t('admin.business.line.name')}</th>
              <th className="w-24 px-2 py-2 text-start">{t('admin.business.line.unit')}</th>
              <th className="w-20 px-2 py-2 text-end">{t('admin.business.line.qty')}</th>
              <th className="w-28 px-2 py-2 text-end">{t('admin.business.line.price')}</th>
              <th className="w-16 px-2 py-2 text-end">{t('admin.business.line.discount')}</th>
              <th className="w-20 px-2 py-2 text-end">{t('admin.business.line.vat')}</th>
              <th className="w-28 px-2 py-2 text-end">{t('admin.business.line.total')}</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {parsed.map(({ l, ok, empty, a }, i) => {
              const item = items.data?.find((x) => x.id === l.cafeItemId);
              const bad = !empty && !ok;
              return (
                <tr key={l.key} className={cn(bad && 'bg-status-danger/5')}>
                  <td className="px-2 py-1.5 text-text-secondary">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <Input
                        list="business-items"
                        aria-label={t('admin.business.line.name')}
                        placeholder={t('admin.business.line.name_hint')}
                        value={l.name}
                        onChange={(e) => {
                          const v = e.target.value;
                          const match = items.data?.find((x) => x.name === v);
                          setLine(l.key, {
                            name: v,
                            cafeItemId: match?.id ?? null,
                            ...(match ? { unit: 'kom' } : {}),
                          });
                        }}
                        className="h-9 min-w-0 flex-1"
                      />
                      <div className="flex w-32 shrink-0 items-center">
                        {item ? (
                          <Badge tone="accent">
                            {t('admin.business.line.stock_now', { qty: item.stockQty ?? 0 })}
                          </Badge>
                        ) : (
                          !empty && (
                            <Select
                              aria-label={t('admin.purchases.line.category')}
                              value={l.category}
                              onChange={(e) =>
                                setLine(l.key, { category: e.target.value as Category })
                              }
                              className="h-9 text-xs"
                            >
                              {EXPENSE_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {t(`admin.purchases.categories.${c}`)}
                                </option>
                              ))}
                            </Select>
                          )
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <Select
                      aria-label={t('admin.business.line.unit')}
                      value={l.unit}
                      disabled={Boolean(item)}
                      onChange={(e) => setLine(l.key, { unit: e.target.value as Unit })}
                      className="h-9"
                    >
                      {DOCUMENT_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {t(`admin.business.units.${u}`)}
                        </option>
                      ))}
                    </Select>
                  </td>
                  {(['qty', 'price', 'discount'] as const).map((k) => (
                    <td key={k} className="px-2 py-1.5 align-top">
                      <Input
                        aria-label={t(`admin.business.line.${k}`)}
                        inputMode="decimal"
                        value={l[k]}
                        onChange={(e) => setLine(l.key, { [k]: e.target.value })}
                        className="tabular h-9 text-end"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <Select
                      aria-label={t('admin.business.line.vat')}
                      value={l.vat}
                      onChange={(e) => setLine(l.key, { vat: e.target.value })}
                      className="tabular h-9 text-end"
                    >
                      {VAT_RATES.map((r) => (
                        <option key={r} value={String(r)}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="tabular px-2 py-1.5 text-end font-semibold whitespace-nowrap">
                    {a ? f.money2(a.total) : '-'}
                  </td>
                  <td className="px-1 py-1.5">
                    {!empty && (
                      <IconButton
                        label={t('common.delete')}
                        onClick={() =>
                          setLines((ls) => {
                            const next = ls.filter((x) => x.key !== l.key);
                            return next.length ? next : [blank(kind)];
                          })
                        }
                      >
                        <X className="size-4 text-status-danger" />
                      </IconButton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <datalist id="business-items">
          {(items.data ?? []).map((x) => (
            <option key={x.id} value={x.name} />
          ))}
        </datalist>
      </div>
      <p className="text-xs text-text-secondary">
        {t(
          kind === 'incoming_invoice'
            ? 'admin.business.doc.stock_in_hint'
            : 'admin.business.doc.stock_out_hint',
        )}
      </p>
      {importMsg && (
        <div className="rounded-sm border border-border-subtle bg-bg-surface2 px-3 py-2 text-sm">
          {importMsg.map((m, i) => (
            <p
              key={i}
              className={
                i === 0 && !m.includes(':') ? 'text-status-success' : 'text-status-warning'
              }
            >
              {m}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImport(file);
            e.target.value = '';
          }}
        />
        <Button
          variant="secondary"
          icon={<FileUp className="size-4" />}
          onClick={() => fileRef.current?.click()}
        >
          {t('admin.business.import.button')}
        </Button>
        <Button variant="ghost" icon={<Download className="size-4" />} onClick={downloadTemplate}>
          {t('admin.business.import.template')}
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-accent-500)]"
            checked={paidNow}
            onChange={(e) => setPaidNow(e.target.checked)}
          />
          {t('admin.purchases.paid_now')}
        </label>
        {paidNow && (
          <Select
            aria-label={t('admin.fields.method')}
            value={method}
            onChange={(e) => setMethod(e.target.value as Method)}
            className="w-auto!"
          >
            {PURCHASE_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`admin.payments.methods.${m}`)}
              </option>
            ))}
          </Select>
        )}
        <div className="flex-1" />
        {error && (
          <p role="alert" className="text-sm text-status-danger">
            {t(error)}
          </p>
        )}
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
        <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      </div>
      {addPartner && (
        <PartnerModal
          partner={null}
          initial={{
            name: /^\d{9}$/.test(partnerQuery.trim()) ? '' : partnerQuery.trim(),
            taxId: /^\d{9}$/.test(partnerQuery.trim()) ? partnerQuery.trim() : null,
            isSupplier: kind === 'incoming_invoice',
            isCustomer: kind === 'outgoing_invoice',
          }}
          onClose={() => setAddPartner(false)}
          onSaved={(p: PartnerDto) => {
            setPartnerId(p.id);
            setPartnerQuery('');
          }}
        />
      )}
    </div>
  );
}

function DocumentView({ doc, onClose }: { doc: DocumentDto; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const live = useQuery({
    queryKey: ['business', 'document', doc.id],
    queryFn: () => api.get<DocumentDto>(`/admin/documents/${doc.id}`),
    initialData: doc,
  });
  const d = live.data;
  const invalidate = () => {
    for (const k of ['business', 'finance', 'cafe']) void qc.invalidateQueries({ queryKey: [k] });
  };
  const voidM = useMutation({
    mutationFn: (reason: string) => api.post(`/admin/documents/${d.id}/void`, { reason }),
    onSuccess: () => {
      toast.success(t('admin.purchases.voided'));
      invalidate();
      setVoiding(false);
    },
  });
  const sums = useMemo(
    () => ({
      gross: d.netAmount + d.discountAmount,
      discount: d.discountAmount,
      net: d.netAmount,
      vat: d.vatAmount,
      total: d.totalAmount,
    }),
    [d],
  );
  const info = (label: string, value: string | null) => (
    <div className="flex min-w-0 justify-between gap-3 border-b border-border-subtle py-1.5 text-sm last:border-0">
      <span className="text-text-secondary">{label}</span>
      <span className="min-w-0 truncate text-end font-semibold">{value || '-'}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-4 print:text-black">
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_minmax(260px,320px)]">
        <div>
          {info(t('admin.business.doc.kind'), t(`admin.business.kinds.${d.kind}`))}
          {info(
            t('admin.business.doc.partner'),
            `${d.partnerName}${d.partnerTaxId ? ` · PIB ${d.partnerTaxId}` : ''}`,
          )}
          {info(t('admin.business.doc.number'), d.number)}
          {info(t('admin.business.doc.internal_no'), String(d.internalNo).padStart(5, '0'))}
        </div>
        <div>
          {info(t('admin.business.doc.turnover_on'), f.date(d.turnoverOn))}
          {info(t('admin.business.doc.due_on'), d.dueOn ? f.date(d.dueOn) : null)}
          {info(
            t('admin.fields.status'),
            d.status === 'paid'
              ? `${t('admin.purchases.status.paid')} ${d.paidOn ? f.date(d.paidOn) : ''}`
              : t(`admin.purchases.status.${d.overdue ? 'overdue' : d.status}`),
          )}
          {info(
            t('admin.fields.note'),
            d.voidReason ? `${t('admin.purchases.void_reason')}: ${d.voidReason}` : d.note,
          )}
        </div>
        <Totals t={t} money={(n) => f.money2(n, d.currency)} s={sums} />
      </div>
      <div className="overflow-x-auto rounded-md border border-border-subtle">
        <table className="w-full min-w-[820px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead className="bg-bg-surface2 text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="px-2 py-2 text-start">#</th>
              <th className="px-2 py-2 text-start">{t('admin.business.line.name')}</th>
              <th className="px-2 py-2 text-start">{t('admin.business.line.unit')}</th>
              <th className="px-2 py-2 text-end">{t('admin.business.line.qty')}</th>
              <th className="px-2 py-2 text-end">{t('admin.business.line.price')}</th>
              <th className="px-2 py-2 text-end">{t('admin.business.line.discount')}</th>
              <th className="px-2 py-2 text-end">{t('admin.business.line.vat')}</th>
              <th className="px-2 py-2 text-end">{t('admin.business.line.total')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {d.lines.map((l, i) => (
              <tr key={i}>
                <td className="px-2 py-2 text-text-secondary">{i + 1}</td>
                <td className="px-2 py-2">
                  {l.name}
                  {!l.cafeItemId && (
                    <span className="ms-2 text-xs text-text-secondary">
                      {t(`admin.purchases.categories.${l.category}`)}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2">{t(`admin.business.units.${l.unit}`)}</td>
                <td className="tabular px-2 py-2 text-end">{l.qty.toLocaleString('sr-RS')}</td>
                <td className="tabular px-2 py-2 text-end">{f.money2(l.unitPrice, d.currency)}</td>
                <td className="tabular px-2 py-2 text-end">{l.discountPct || '-'}</td>
                <td className="tabular px-2 py-2 text-end">{l.vatRate}</td>
                <td className="tabular px-2 py-2 text-end font-semibold">
                  {f.money2(l.totalAmount, d.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle pt-4 print:hidden">
        <Button
          variant="ghost"
          icon={<Printer className="size-4" />}
          onClick={() => window.print()}
        >
          {t('admin.earnings.print')}
        </Button>
        {d.status !== 'void' && (
          <Button variant="ghost" onClick={() => setVoiding(true)}>
            {t('admin.purchases.void')}
          </Button>
        )}
        {d.status === 'unpaid' && (
          <Button variant="secondary" onClick={() => setPaying(true)}>
            {t(
              d.kind === 'incoming_invoice' ? 'admin.purchases.pay' : 'admin.business.doc.collect',
            )}
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
      {paying && <PayModal doc={d} onClose={() => setPaying(false)} onDone={invalidate} />}
      <ReasonDialog
        open={voiding}
        title={t('admin.purchases.void')}
        consequence={t('admin.purchases.void_consequence')}
        confirmLabel={t('admin.purchases.void')}
        onCancel={() => setVoiding(false)}
        onConfirm={(reason) => voidM.mutate(reason)}
        loading={voidM.isPending}
        error={voidM.error ? errKey(voidM.error) : null}
      />
    </div>
  );
}

function PayModal({
  doc,
  onClose,
  onDone,
}: {
  doc: DocumentDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState<Method>('bank_transfer');
  const pay = useMutation({
    mutationFn: () => api.post(`/admin/documents/${doc.id}/pay`, { paidOn, method }),
    onSuccess: () => {
      toast.success(t('admin.purchases.paid_ok'));
      onDone();
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t(
        doc.kind === 'incoming_invoice' ? 'admin.purchases.pay' : 'admin.business.doc.collect',
      )}
      description={`${doc.partnerName} · ${doc.number} · ${f.money2(doc.totalAmount, doc.currency)}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={pay.isPending} onClick={() => pay.mutate()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          {t('admin.purchases.paid_on')}
          <Input
            type="date"
            value={paidOn}
            max={today()}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {t('admin.fields.method')}
          <Select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
            {PURCHASE_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`admin.payments.methods.${m}`)}
              </option>
            ))}
          </Select>
        </label>
        {pay.error && (
          <p role="alert" className="text-sm text-status-danger sm:col-span-2">
            {t(errKey(pay.error))}
          </p>
        )}
      </div>
    </Modal>
  );
}
