import {
  CAFE_PAYMENT_METHODS,
  type CafeCategoryDto,
  type CafeOrderDto,
  type CafeTableDto,
} from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coffee, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ReasonDialog } from '@/components/ui/ReasonDialog';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Table';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';

type Method = (typeof CAFE_PAYMENT_METHODS)[number];
const NEXT: Record<string, 'preparing' | 'ready' | 'served' | null> = {
  new: 'preparing',
  preparing: 'ready',
  ready: 'served',
  served: null,
  cancelled: null,
};
const COLUMNS = ['new', 'preparing', 'ready'] as const;

/** Bar board: orders from table QR codes, the app and the bar, moved forward and charged here. */
export function CafeOrdersPage() {
  const { t } = useTranslation();
  const [view, setView] = useState<'open' | 'today'>('open');
  const [creating, setCreating] = useState(false);
  const q = useQuery({
    queryKey: ['cafe-orders', view],
    queryFn: () => api.get<CafeOrderDto[]>('/admin/cafe/orders', { view }),
    refetchInterval: 8_000,
  });

  return (
    <>
      <PageHeader
        title={t('admin.cafe.orders_title')}
        subtitle={t('admin.cafe.orders_subtitle')}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            {t('admin.cafe.new_order')}
          </Button>
        }
      />
      <Tabs
        tabs={[
          { value: 'open', label: t('admin.cafe.view_open') },
          { value: 'today', label: t('admin.cafe.view_today') },
        ]}
        value={view}
        onChange={setView}
      />
      <div className="mt-4">
        {q.isPending ? (
          <Skeleton className="h-64" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data.length ? (
          <Card>
            <EmptyState icon={Coffee} title={t('admin.cafe.no_orders')} />
          </Card>
        ) : view === 'open' ? (
          <div className="grid items-start gap-4 lg:grid-cols-3">
            {COLUMNS.map((col) => (
              <section key={col} className="flex min-w-0 flex-col gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-text-secondary">
                  {t(`admin.cafe.status.${col}`)}
                  <Badge tone="neutral">{q.data.filter((o) => o.status === col).length}</Badge>
                </h2>
                {q.data
                  .filter((o) => o.status === col)
                  .reverse()
                  .map((o) => (
                    <OrderCard key={o.id} order={o} />
                  ))}
              </section>
            ))}
          </div>
        ) : (
          <TodayList orders={q.data} />
        )}
      </div>
      {creating && <BarOrderModal onClose={() => setCreating(false)} />}
    </>
  );
}

function useOrderAction<T>(fn: (v: T) => Promise<CafeOrderDto>) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cafe-orders'] }),
    onError: (e) => toast.error(t(e instanceof ApiError ? e.message : 'errors.internal')),
  });
}

function OrderCard({ order: o }: { order: CafeOrderDto }) {
  const { t } = useTranslation();
  const f = useFormat();
  const [method, setMethod] = useState<Method>('cash');
  const [cancelling, setCancelling] = useState(false);
  const next = NEXT[o.status];
  const advance = useOrderAction((status: 'preparing' | 'ready' | 'served') =>
    api.post<CafeOrderDto>(`/admin/cafe/orders/${o.id}/status`, { status }),
  );
  const pay = useOrderAction(() =>
    api.post<CafeOrderDto>(`/admin/cafe/orders/${o.id}/pay`, { method }),
  );
  const cancel = useOrderAction((reason: string) =>
    api.post<CafeOrderDto>(`/admin/cafe/orders/${o.id}/cancel`, { reason }),
  );
  return (
    <Card className={o.status === 'ready' ? 'border-status-success/60' : undefined}>
      <div className="flex flex-col gap-2 p-3 text-sm">
        <div className="flex items-start gap-2">
          <span className="text-2xl font-bold tabular-nums">#{o.number}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {o.memberName ?? o.guestName ?? t('admin.cafe.guest')}
              {o.memberName && (
                <span className="ms-1.5 align-middle text-[10px] font-semibold tracking-wide text-accent-400 uppercase">
                  {t('admin.cafe.member')}
                </span>
              )}
            </p>
            <p className="truncate text-xs text-text-secondary">
              {o.tableLabel ??
                (o.source === 'app' ? t('admin.cafe.pickup') : t('admin.cafe.at_bar'))}
              {' · '}
              {t(`admin.cafe.source.${o.source}`)} · {f.time(o.createdAt)}
            </p>
          </div>
          {o.paymentStatus === 'paid' ? (
            <Badge tone="success">{t('admin.cafe.paid')}</Badge>
          ) : (
            <Badge tone="warning">{t('admin.cafe.unpaid')}</Badge>
          )}
        </div>
        <ul className="flex flex-col gap-0.5">
          {o.items.map((i, idx) => (
            <li key={idx} className="flex justify-between gap-2">
              <span>
                <b className="tabular-nums">{i.qty}×</b> {i.name}
              </span>
              <span className="tabular-nums text-text-secondary">{f.money(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        {o.note && <p className="rounded-xs bg-bg-surface2 px-2 py-1 text-xs">{o.note}</p>}
        <p className="flex justify-between border-t border-border-subtle pt-2 font-semibold">
          <span>{t('admin.cafe.total')}</span>
          <span className="tabular-nums">{f.money(o.totalAmount, o.currency)}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {next && (
            <Button size="sm" loading={advance.isPending} onClick={() => advance.mutate(next)}>
              {t(`admin.cafe.to.${next}`)}
            </Button>
          )}
          {o.paymentStatus === 'unpaid' && (
            <>
              <Select
                aria-label={t('admin.cafe.method')}
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
                className="h-8 w-28 text-xs"
              >
                {CAFE_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`admin.cafe.methods.${m}`)}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="secondary"
                loading={pay.isPending}
                onClick={() => pay.mutate(undefined)}
              >
                {t('admin.cafe.charge')}
              </Button>
              <IconButton label={t('admin.cafe.cancel')} onClick={() => setCancelling(true)}>
                <X className="size-4" />
              </IconButton>
            </>
          )}
        </div>
        <FiscalLine order={o} />
      </div>
      {cancelling && (
        <ReasonDialog
          open
          title={t('admin.cafe.cancel_title', { number: o.number })}
          consequence={t('admin.cafe.cancel_consequence')}
          confirmLabel={t('admin.cafe.cancel')}
          onCancel={() => setCancelling(false)}
          onConfirm={(reason) => {
            cancel.mutate(reason);
            setCancelling(false);
          }}
        />
      )}
    </Card>
  );
}

function FiscalLine({ order: o }: { order: CafeOrderDto }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const retry = useMutation({
    mutationFn: () => api.post(`/admin/cafe/orders/${o.id}/fiscal-retry`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cafe-orders'] }),
  });
  if (o.fiscalStatus === 'none') return null;
  return (
    <p className="flex items-center gap-2 text-xs text-text-secondary">
      <Badge
        tone={
          o.fiscalStatus === 'sent' ? 'success' : o.fiscalStatus === 'failed' ? 'danger' : 'info'
        }
      >
        {t(`admin.cafe.fiscal.${o.fiscalStatus}`)}
      </Badge>
      {o.fiscalError && <span className="truncate">{o.fiscalError}</span>}
      {o.fiscalStatus === 'failed' && (
        <IconButton label={t('admin.cafe.fiscal_retry')} onClick={() => retry.mutate()}>
          <RotateCcw className="size-3.5" />
        </IconButton>
      )}
    </p>
  );
}

function TodayList({ orders }: { orders: CafeOrderDto[] }) {
  const { t } = useTranslation();
  const f = useFormat();
  const paid = orders.filter((o) => o.paymentStatus === 'paid');
  const byMethod = CAFE_PAYMENT_METHODS.map((m) => ({
    m,
    sum: paid.filter((o) => o.paymentMethod === m).reduce((s, o) => s + o.totalAmount, 0),
  })).filter((x) => x.sum > 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Card className="px-4 py-3">
          <p className="text-xs text-text-secondary">{t('admin.cafe.revenue_today')}</p>
          <p className="text-2xl font-bold tabular-nums">
            {f.money(paid.reduce((s, o) => s + o.totalAmount, 0))}
          </p>
        </Card>
        {byMethod.map((x) => (
          <Card key={x.m} className="px-4 py-3">
            <p className="text-xs text-text-secondary">{t(`admin.cafe.methods.${x.m}`)}</p>
            <p className="text-lg font-semibold tabular-nums">{f.money(x.sum)}</p>
          </Card>
        ))}
      </div>
      <Card>
        <ul className="divide-y divide-border-subtle text-sm">
          {orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="w-12 font-bold tabular-nums">#{o.number}</span>
              <span className="w-14 text-text-secondary">{f.time(o.createdAt)}</span>
              <span className="min-w-0 flex-1 truncate">
                {o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
              </span>
              <Badge tone={o.status === 'cancelled' ? 'neutral' : 'info'}>
                {t(`admin.cafe.status.${o.status}`)}
              </Badge>
              <span className="w-24 text-end font-semibold tabular-nums">
                {f.money(o.totalAmount)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/** Order taken at the bar, usually charged at once. */
function BarOrderModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const menu = useQuery({
    queryKey: ['cafe-admin-menu', i18n.language],
    queryFn: () => api.get<CafeCategoryDto[]>('/admin/cafe/menu', { locale: i18n.language }),
  });
  const tables = useQuery({
    queryKey: ['cafe-tables'],
    queryFn: () => api.get<CafeTableDto[]>('/admin/cafe/tables'),
  });
  const [cart, setCart] = useState<Record<string, number>>({});
  const [tableId, setTableId] = useState('');
  const [payNow, setPayNow] = useState<Method | ''>('cash');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const items = (menu.data ?? []).flatMap((c) => c.items).filter((i) => i.isAvailable);
  const shown = items.filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()));
  const total = items.reduce((s, i) => s + (cart[i.id] ?? 0) * i.priceAmount, 0);
  const set = (id: string, qty: number) =>
    setCart((c) => {
      const n = { ...c };
      if (qty <= 0) delete n[id];
      else n[id] = Math.min(50, qty);
      return n;
    });
  const save = useMutation({
    mutationFn: () =>
      api.post<CafeOrderDto>(`/admin/cafe/orders?locale=${i18n.language}`, {
        items: Object.entries(cart).map(([itemId, qty]) => ({ itemId, qty })),
        tableId: tableId || null,
        payNow: payNow || null,
        note,
      }),
    onSuccess: (o) => {
      void qc.invalidateQueries({ queryKey: ['cafe-orders'] });
      void qc.invalidateQueries({ queryKey: ['cafe-admin-menu'] });
      toast.success(t('admin.cafe.order_created', { number: o.number }));
      onClose();
    },
  });

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={t('admin.cafe.new_order')}
      footer={
        <>
          <span className="me-auto text-lg font-bold tabular-nums">{f.money(total)}</span>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!total && !Object.keys(cart).length}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {payNow ? t('admin.cafe.create_and_charge') : t('admin.cafe.create')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          aria-label={t('common.search')}
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ul className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
          {shown.map((i) => {
            const qty = cart[i.id] ?? 0;
            const out = !i.inStock;
            return (
              <li
                key={i.id}
                className={`flex items-center gap-2 rounded-sm border px-3 py-2 text-sm ${qty ? 'border-accent-500 bg-accent-tint' : 'border-border-subtle'} ${out ? 'opacity-50' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{i.name}</span>
                  <span className="text-xs text-text-secondary">
                    {f.money(i.priceAmount)}
                    {i.trackStock ? ` · ${t('admin.cafe.in_stock', { n: i.stockQty })}` : ''}
                  </span>
                </span>
                {qty > 0 && (
                  <IconButton label={t('admin.cafe.less')} onClick={() => set(i.id, qty - 1)}>
                    <Minus className="size-4" />
                  </IconButton>
                )}
                {qty > 0 && <b className="w-5 text-center tabular-nums">{qty}</b>}
                <IconButton
                  label={t('admin.cafe.more')}
                  disabled={out || (i.trackStock && qty >= (i.stockQty ?? 0))}
                  onClick={() => set(i.id, qty + 1)}
                >
                  <Plus className="size-4" />
                </IconButton>
              </li>
            );
          })}
        </ul>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('admin.cafe.table')}>
            {(p) => (
              <Select {...p} value={tableId} onChange={(e) => setTableId(e.target.value)}>
                <option value="">{t('admin.cafe.at_bar')}</option>
                {(tables.data ?? [])
                  .filter((x) => x.isActive)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label={t('admin.cafe.method')}>
            {(p) => (
              <Select
                {...p}
                value={payNow}
                onChange={(e) => setPayNow(e.target.value as Method | '')}
              >
                <option value="">{t('admin.cafe.pay_later')}</option>
                {CAFE_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`admin.cafe.methods.${m}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('admin.cafe.note')}>
            {(p) => (
              <Input
                {...p}
                value={note}
                maxLength={300}
                onChange={(e) => setNote(e.target.value)}
              />
            )}
          </Field>
        </div>
        {save.error && (
          <p role="alert" className="text-sm text-status-danger">
            {t(save.error instanceof ApiError ? save.error.message : 'errors.internal')}
          </p>
        )}
      </div>
    </Modal>
  );
}
