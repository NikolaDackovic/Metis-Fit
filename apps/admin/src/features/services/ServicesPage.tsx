import { PLATFORM_NAME } from '@grit/design-tokens';
import {
  SERVICE_PAYMENT_METHODS,
  type ServiceBody,
  type ServiceDto,
  type ServiceSaleDto,
  type TrainerAdminDto,
  type TrainerRateDto,
} from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Pencil, Plus, Printer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MemberPicker, type PickedMember } from '@/components/MemberPicker';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ReasonDialog } from '@/components/ui/ReasonDialog';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '@/components/ui/States';
import { Tabs } from '@/components/ui/Table';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { usePublicClub } from '@/lib/club';
import { parseMoneyInput, useFormat } from '@/lib/format';
import { useCan } from '@/lib/me';
import { printReceipt } from '@/lib/receipt';

type Tab = 'sell' | 'catalog' | 'rates';
type Method = (typeof SERVICE_PAYMENT_METHODS)[number];
const LOCALES = ['sr', 'en', 'ru', 'ar'] as const;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Belgrade' });

function useServices() {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['services', i18n.language],
    queryFn: () => api.get<ServiceDto[]>('/admin/services', { locale: i18n.language }),
  });
}
function useTrainers() {
  return useQuery({
    queryKey: ['trainers-admin'],
    queryFn: () => api.get<TrainerAdminDto[]>('/admin/trainers'),
  });
}

/** Single services: sell at the front desk, the price list, and trainer shares. */
export function ServicesPage() {
  const { t } = useTranslation();
  const can = useCan();
  const [tab, setTab] = useState<Tab>('sell');
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: 'sell', label: t('admin.services.tab_sell') },
    ...(can('services.manage')
      ? [
          { value: 'catalog' as const, label: t('admin.services.tab_catalog') },
          { value: 'rates' as const, label: t('admin.services.tab_rates') },
        ]
      : []),
  ];
  return (
    <>
      <PageHeader title={t('admin.services.title')} subtitle={t('admin.services.subtitle')} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'sell' && <SellTab />}
        {tab === 'catalog' && <CatalogTab />}
        {tab === 'rates' && <RatesTab />}
      </div>
    </>
  );
}

function SellTab() {
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const qc = useQueryClient();
  const club = usePublicClub();
  const services = useServices();
  const trainers = useTrainers();
  const sellable = (services.data ?? []).filter((s) => s.isActive && s.isSellable);
  const [serviceId, setServiceId] = useState('');
  const [member, setMember] = useState<PickedMember | null>(null);
  const [trainerId, setTrainerId] = useState('');
  const [qty, setQty] = useState('1');
  const [method, setMethod] = useState<Method>('cash');
  const [voiding, setVoiding] = useState<ServiceSaleDto | null>(null);
  const day = today();
  const salesKey = ['service-sales', day];
  const sales = useQuery({
    queryKey: salesKey,
    queryFn: () => api.get<ServiceSaleDto[]>('/admin/service-sales', { from: day, to: day }),
  });
  const service = sellable.find((s) => s.id === serviceId);
  const n = Math.max(1, Number(qty) || 1);
  const receipt = (s: ServiceSaleDto) =>
    printReceipt({
      club: String(club.data?.info.name ?? PLATFORM_NAME),
      title: t('admin.receipt.title'),
      number: s.id.slice(0, 8).toUpperCase(),
      date: f.dateTime(s.soldAt),
      customer: s.memberName,
      lines: [{ name: s.name, qty: s.qty, amount: f.money(s.totalAmount, s.currency) }],
      total: f.money(s.totalAmount, s.currency),
      method: t(`admin.cafe.methods.${s.paymentMethod}`),
      cashier: s.soldByName,
      labels: {
        customer: t('admin.receipt.customer'),
        total: t('admin.receipt.total'),
        method: t('admin.receipt.method'),
        cashier: t('admin.receipt.cashier'),
        notFiscal: t('admin.receipt.not_fiscal'),
      },
    });
  const sell = useMutation({
    mutationFn: () =>
      api.post<ServiceSaleDto>('/admin/service-sales', {
        serviceId,
        memberId: member?.id ?? null,
        trainerId: trainerId || null,
        qty: n,
        paymentMethod: method,
      }),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: ['service-sales'] });
      toast.success(t('admin.services.sold'));
      setMember(null);
      setQty('1');
      if (window.confirm(t('admin.services.print_now'))) receipt(s);
    },
  });
  const voidSale = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/admin/service-sales/${id}/void`, { reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['service-sales'] });
      setVoiding(null);
    },
  });
  const live = (sales.data ?? []).filter((s) => !s.voidedAt);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card>
        <CardHeader title={t('admin.services.new_sale')} />
        <div className="flex flex-col gap-3 p-4">
          <Field label={t('admin.services.service')} required>
            {(p) => (
              <Select {...p} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                <option value="">{t('admin.services.choose')}</option>
                {sellable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} - {f.money(s.priceAmount, s.currency)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-semibold">{t('admin.services.member')}</p>
            <MemberPicker
              value={member}
              onChange={setMember}
              placeholder={t('admin.services.member_hint')}
            />
          </div>
          {service?.needsProvider && (
            <Field label={t('admin.services.provider')} required>
              {(p) => (
                <Select {...p} value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
                  <option value="">{t('admin.services.choose')}</option>
                  {(trainers.data ?? [])
                    .filter((x) => !x.archivedAt)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.firstName} {x.lastName}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('admin.services.qty')}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="numeric"
                  value={qty}
                  onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
                />
              )}
            </Field>
            <Field label={t('admin.cafe.method')}>
              {(p) => (
                <Select {...p} value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                  {SERVICE_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(`admin.cafe.methods.${m}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {service && (
            <p className="flex justify-between text-lg font-bold">
              <span>{t('admin.cafe.total')}</span>
              <span className="tabular-nums">
                {f.money(service.priceAmount * n, service.currency)}
              </span>
            </p>
          )}
          {sell.error && (
            <p role="alert" className="text-sm text-status-danger">
              {t(sell.error instanceof ApiError ? sell.error.message : 'errors.internal')}
            </p>
          )}
          <Button
            disabled={!service || (service.needsProvider && !trainerId)}
            loading={sell.isPending}
            onClick={() => sell.mutate()}
          >
            {t('admin.services.charge')}
          </Button>
          <p className="text-xs text-text-secondary">{t('admin.services.not_fiscal_hint')}</p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={t('admin.services.today', {
            total: f.money(live.reduce((a, s) => a + s.totalAmount, 0)),
          })}
        />
        {sales.isPending ? (
          <Skeleton className="m-4 h-32" />
        ) : !sales.data?.length ? (
          <p className="px-4 py-6 text-center text-sm text-text-secondary">
            {t('admin.services.no_sales')}
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle text-sm">
            {sales.data.map((s) => (
              <li
                key={s.id}
                className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${s.voidedAt ? 'opacity-50' : ''}`}
              >
                <span className="w-12 text-text-secondary">{f.time(s.soldAt)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {s.qty > 1 ? `${s.qty} × ` : ''}
                    {s.name}
                  </span>
                  <span className="block truncate text-xs text-text-secondary">
                    {s.memberName ?? t('admin.services.guest')}
                    {s.trainerName ? ` · ${s.trainerName}` : ''} ·{' '}
                    {t(`admin.cafe.methods.${s.paymentMethod}`)}
                  </span>
                </span>
                {s.voidedAt && <Badge tone="neutral">{t('admin.services.voided')}</Badge>}
                <span className="font-semibold tabular-nums">
                  {f.money(s.totalAmount, s.currency)}
                </span>
                <IconButton label={t('admin.receipt.print')} onClick={() => receipt(s)}>
                  <Printer className="size-4" />
                </IconButton>
                {can('services.manage') && !s.voidedAt && (
                  <IconButton label={t('admin.services.void')} onClick={() => setVoiding(s)}>
                    <Ban className="size-4" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {voiding && (
        <ReasonDialog
          open
          title={t('admin.services.void_title')}
          consequence={t('admin.services.void_consequence')}
          confirmLabel={t('admin.services.void')}
          loading={voidSale.isPending}
          onCancel={() => setVoiding(null)}
          onConfirm={(reason) => voidSale.mutate({ id: voiding.id, reason })}
        />
      )}
    </div>
  );
}

function CatalogTab() {
  const { t } = useTranslation();
  const f = useFormat();
  const q = useServices();
  const [editing, setEditing] = useState<ServiceDto | 'new' | null>(null);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <Card>
      <CardHeader
        title={t('admin.services.tab_catalog')}
        action={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            {t('admin.services.new_service')}
          </Button>
        }
      />
      {q.isPending ? (
        <Skeleton className="m-4 h-40" />
      ) : !q.data.length ? (
        <EmptyState icon={Plus} title={t('admin.services.empty')} />
      ) : (
        <ul className="divide-y divide-border-subtle text-sm">
          {q.data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{s.name}</span>
                <span className="block text-xs text-text-secondary">
                  {s.durationMin ? `${s.durationMin} min · ` : ''}
                  {t('admin.services.share_default', {
                    share:
                      s.defaultShareKind === 'percent'
                        ? `${s.defaultShareValue}%`
                        : f.money(s.defaultShareValue),
                  })}
                </span>
              </span>
              {!s.isSellable && <Badge tone="info">{t('admin.services.internal')}</Badge>}
              {!s.isActive && <Badge tone="neutral">{t('admin.cafe.hidden')}</Badge>}
              {s.isSellable && (
                <span className="font-semibold tabular-nums">
                  {f.money(s.priceAmount, s.currency)}
                </span>
              )}
              <IconButton label={t('common.edit')} onClick={() => setEditing(s)}>
                <Pencil className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <ServiceModal
          service={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function ServiceModal({ service, onClose }: { service?: ServiceDto; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [tr, setTr] = useState<Record<string, { name: string; description: string }>>(
    Object.fromEntries(
      LOCALES.map((l) => [
        l,
        {
          name: service?.translations?.[l]?.name ?? '',
          description: service?.translations?.[l]?.description ?? '',
        },
      ]),
    ),
  );
  const [price, setPrice] = useState(service ? String(service.priceAmount / 100) : '');
  const [duration, setDuration] = useState(service?.durationMin ? String(service.durationMin) : '');
  const [provider, setProvider] = useState(service?.needsProvider ?? false);
  const [shareKind, setShareKind] = useState<'percent' | 'fixed'>(
    service?.defaultShareKind ?? 'percent',
  );
  const [share, setShare] = useState(
    service
      ? String(
          service.defaultShareKind === 'fixed'
            ? service.defaultShareValue / 100
            : service.defaultShareValue,
        )
      : '0',
  );
  const [active, setActive] = useState(service?.isActive ?? true);
  const internal = service ? !service.isSellable : false;
  const priceMinor = internal ? 0 : parseMoneyInput(price);
  const shareValue = shareKind === 'fixed' ? parseMoneyInput(share) : Number(share);
  const body: ServiceBody = {
    translations: Object.fromEntries(
      LOCALES.filter((l) => tr[l]?.name.trim()).map((l) => [
        l,
        { name: tr[l]!.name.trim(), description: tr[l]!.description.trim() || null },
      ]),
    ) as ServiceBody['translations'],
    priceAmount: priceMinor ?? 0,
    durationMin: duration ? Number(duration) : null,
    needsProvider: provider,
    defaultShareKind: shareKind,
    defaultShareValue: shareValue ?? 0,
    isActive: active,
    sortOrder: service?.sortOrder ?? 0,
  };
  const save = useMutation({
    mutationFn: () =>
      service
        ? api.put(`/admin/services/${service.id}?locale=${i18n.language}`, body)
        : api.post(`/admin/services?locale=${i18n.language}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['services'] });
      onClose();
    },
  });
  const valid =
    Boolean(tr.sr?.name.trim()) &&
    priceMinor !== null &&
    shareValue !== null &&
    Number.isFinite(shareValue);
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={service ? service.name : t('admin.services.new_service')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {LOCALES.map((l) => (
          <div key={l} className="grid gap-2 sm:grid-cols-2">
            <Field label={`${t('admin.cafe.name')} (${l.toUpperCase()})`} required={l === 'sr'}>
              {(p) => (
                <Input
                  {...p}
                  dir={l === 'ar' ? 'rtl' : undefined}
                  value={tr[l]!.name}
                  maxLength={80}
                  onChange={(e) => setTr({ ...tr, [l]: { ...tr[l]!, name: e.target.value } })}
                />
              )}
            </Field>
            <Field label={`${t('admin.cafe.description')} (${l.toUpperCase()})`}>
              {(p) => (
                <Input
                  {...p}
                  dir={l === 'ar' ? 'rtl' : undefined}
                  value={tr[l]!.description}
                  maxLength={300}
                  onChange={(e) =>
                    setTr({ ...tr, [l]: { ...tr[l]!, description: e.target.value } })
                  }
                />
              )}
            </Field>
          </div>
        ))}
        <div className="grid gap-3 sm:grid-cols-4">
          {!internal && (
            <Field label={t('admin.fields.amount_rsd')} required>
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              )}
            </Field>
          )}
          <Field label={t('admin.services.duration')}>
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                value={duration}
                onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))}
              />
            )}
          </Field>
          <Field label={t('admin.services.share_kind')}>
            {(p) => (
              <Select
                {...p}
                value={shareKind}
                onChange={(e) => setShareKind(e.target.value as 'percent' | 'fixed')}
              >
                <option value="percent">%</option>
                <option value="fixed">RSD</option>
              </Select>
            )}
          </Field>
          <Field label={t('admin.services.share_value')}>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={share}
                onChange={(e) => setShare(e.target.value)}
              />
            )}
          </Field>
        </div>
        {internal && <p className="text-xs text-text-secondary">{t('admin.services.pt_hint')}</p>}
        <div className="flex flex-wrap gap-4 text-sm font-semibold">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-accent-500)]"
              checked={provider}
              onChange={(e) => setProvider(e.target.checked)}
            />
            {t('admin.services.needs_provider')}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-accent-500)]"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            {t('admin.cafe.available')}
          </label>
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

/** Matrix trainer × service: empty = the service default applies. */
function RatesTab() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const services = useServices();
  const trainers = useTrainers();
  const rates = useQuery({
    queryKey: ['trainer-rates'],
    queryFn: () => api.get<TrainerRateDto[]>('/admin/trainer-rates'),
  });
  const set = useMutation({
    mutationFn: (b: {
      trainerId: string;
      serviceId: string;
      shareKind: 'percent' | 'fixed' | null;
      shareValue: number;
    }) => api.put('/admin/trainer-rates', b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['trainer-rates'] });
      toast.success(t('admin.cafe.saved'));
    },
    onError: (e) => toast.error(t(e instanceof ApiError ? e.message : 'errors.internal')),
  });
  const provided = (services.data ?? []).filter((s) => s.needsProvider && s.isActive);
  const list = (trainers.data ?? []).filter((x) => !x.archivedAt);
  if (!services.data || !trainers.data || !rates.data) return <Skeleton className="h-64" />;
  return (
    <Card>
      <CardHeader title={t('admin.services.tab_rates')} />
      <p className="px-4 pt-3 text-xs text-text-secondary">{t('admin.services.rates_hint')}</p>
      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="text-start text-xs text-text-secondary">
              <th className="py-2 text-start">{t('admin.services.trainer')}</th>
              {provided.map((s) => (
                <th key={s.id} className="px-2 py-2 text-start">
                  {s.name}
                  <span className="block font-normal">
                    {t('admin.services.default')}:{' '}
                    {s.defaultShareKind === 'percent'
                      ? `${s.defaultShareValue}%`
                      : f.money(s.defaultShareValue)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {list.map((tr) => (
              <tr key={tr.id}>
                <td className="py-2 font-semibold">
                  {tr.firstName} {tr.lastName}
                </td>
                {provided.map((s) => {
                  const r = rates.data.find((x) => x.trainerId === tr.id && x.serviceId === s.id);
                  return (
                    <td key={s.id} className="px-2 py-2">
                      <RateCell
                        rate={r}
                        onSave={(kind, value) =>
                          set.mutate({
                            trainerId: tr.id,
                            serviceId: s.id,
                            shareKind: kind,
                            shareValue: value,
                          })
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RateCell({
  rate,
  onSave,
}: {
  rate: TrainerRateDto | undefined;
  onSave: (kind: 'percent' | 'fixed' | null, value: number) => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<'' | 'percent' | 'fixed'>(rate?.shareKind ?? '');
  const [value, setValue] = useState(
    rate ? String(rate.shareKind === 'fixed' ? rate.shareValue / 100 : rate.shareValue) : '',
  );
  const commit = (k = kind, v = value) => {
    if (!k) return onSave(null, 0);
    const n = k === 'fixed' ? parseMoneyInput(v) : Number(v);
    if (n === null || !Number.isFinite(n) || n < 0) return;
    onSave(k, n);
  };
  return (
    <div className="flex items-center gap-1">
      <Select
        aria-label={t('admin.services.share_kind')}
        value={kind}
        onChange={(e) => {
          const k = e.target.value as typeof kind;
          setKind(k);
          if (!k) commit('', '');
        }}
        className="h-8 w-20 text-xs"
      >
        <option value="">{t('admin.services.default')}</option>
        <option value="percent">%</option>
        <option value="fixed">RSD</option>
      </Select>
      {kind && (
        <Input
          aria-label={t('admin.services.share_value')}
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => commit()}
          className="h-8 w-20 text-xs"
        />
      )}
    </div>
  );
}
