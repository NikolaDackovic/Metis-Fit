import type {
  CafeCategoryBody,
  CafeCategoryDto,
  CafeItemBody,
  CafeItemDto,
} from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Coffee, PackagePlus, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { parseMoneyInput, useFormat } from '@/lib/format';
import { useCan } from '@/lib/me';
import { fitImage } from '../classes/resize-image';

const LOCALES = ['sr', 'en', 'ru', 'ar'] as const;

function useMenu() {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['cafe-admin-menu', i18n.language],
    queryFn: () => api.get<CafeCategoryDto[]>('/admin/cafe/menu', { locale: i18n.language }),
  });
}
function useMenuSave<T>(fn: (v: T, locale: string) => Promise<CafeCategoryDto[]>) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: T) => fn(v, i18n.language),
    onSuccess: (d) => {
      qc.setQueryData(['cafe-admin-menu', i18n.language], d);
      void qc.invalidateQueries({ queryKey: ['cafe-admin-menu'] });
      toast.success(t('admin.cafe.saved'));
    },
    onError: (e) => toast.error(t(e instanceof ApiError ? e.message : 'errors.internal')),
  });
}

/** Café menu: categories, items, prices, availability, photos and stock. */
export function CafeMenuPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const manage = can('cafe.manage');
  const q = useMenu();
  const [item, setItem] = useState<CafeItemDto | { categoryId: string } | null>(null);
  const [category, setCategory] = useState<CafeCategoryDto | 'new' | null>(null);
  const [stock, setStock] = useState<CafeItemDto | null>(null);
  const photo = useMenuSave(async ({ id, file }: { id: string; file: File }, locale) =>
    api.put<CafeCategoryDto[]>(`/admin/cafe/media/items/${id}?locale=${locale}`, {
      image: await fitImage(file, 900),
    }),
  );
  const pick = (id: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = () => input.files?.[0] && photo.mutate({ id, file: input.files[0] });
    input.click();
  };

  return (
    <>
      <PageHeader
        title={t('admin.cafe.menu_title')}
        subtitle={t('admin.cafe.menu_subtitle')}
        actions={
          manage ? (
            <Button icon={<Plus className="size-4" />} onClick={() => setCategory('new')}>
              {t('admin.cafe.new_category')}
            </Button>
          ) : undefined
        }
      />
      {q.isPending ? (
        <Skeleton className="h-96" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data.length ? (
        <Card>
          <EmptyState icon={Coffee} title={t('admin.cafe.empty_menu')} />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {q.data.map((c) => (
            <Card key={c.id}>
              <CardHeader
                title={c.name + (c.isActive ? '' : ` (${t('admin.cafe.hidden')})`)}
                action={
                  manage ? (
                    <div className="flex gap-2">
                      <IconButton label={t('common.edit')} onClick={() => setCategory(c)}>
                        <Pencil className="size-4" />
                      </IconButton>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Plus className="size-4" />}
                        onClick={() => setItem({ categoryId: c.id })}
                      >
                        {t('admin.cafe.new_item')}
                      </Button>
                    </div>
                  ) : undefined
                }
              />
              <ul className="divide-y divide-border-subtle">
                {c.items.map((i) => {
                  const low = i.trackStock && (i.stockQty ?? 0) <= i.lowStockAt;
                  return (
                    <li
                      key={i.id}
                      className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
                    >
                      {i.photoUrl ? (
                        <img src={i.photoUrl} alt="" className="size-10 rounded-xs object-cover" />
                      ) : (
                        <span className="flex size-10 items-center justify-center rounded-xs bg-bg-surface2">
                          <Coffee className="size-4 text-text-muted" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{i.name}</span>
                        {i.description && (
                          <span className="block truncate text-xs text-text-secondary">
                            {i.description}
                          </span>
                        )}
                      </span>
                      {!i.isAvailable && <Badge tone="neutral">{t('admin.cafe.hidden')}</Badge>}
                      {i.trackStock && (
                        <Badge
                          tone={(i.stockQty ?? 0) === 0 ? 'danger' : low ? 'warning' : 'neutral'}
                        >
                          {t('admin.cafe.in_stock', { n: i.stockQty })}
                        </Badge>
                      )}
                      <span className="w-24 text-end font-semibold tabular-nums">
                        {f.money(i.priceAmount, i.currency)}
                      </span>
                      <IconButton label={t('admin.cafe.stock')} onClick={() => setStock(i)}>
                        <PackagePlus className="size-4" />
                      </IconButton>
                      {manage && (
                        <>
                          <IconButton label={t('admin.cafe.photo')} onClick={() => pick(i.id)}>
                            <Camera className="size-4" />
                          </IconButton>
                          <IconButton label={t('common.edit')} onClick={() => setItem(i)}>
                            <Pencil className="size-4" />
                          </IconButton>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
      {item && q.data && (
        <ItemModal item={item} categories={q.data} onClose={() => setItem(null)} />
      )}
      {category && (
        <CategoryModal
          category={category === 'new' ? undefined : category}
          onClose={() => setCategory(null)}
        />
      )}
      {stock && <StockModal item={stock} onClose={() => setStock(null)} />}
    </>
  );
}

function LangFields({
  value,
  onChange,
  withDescription,
}: {
  value: Record<string, { name: string; description?: string }>;
  onChange: (v: Record<string, { name: string; description?: string }>) => void;
  withDescription?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      {LOCALES.map((l) => (
        <div key={l} className={`grid gap-2 ${withDescription ? 'sm:grid-cols-2' : ''}`}>
          <Field label={`${t('admin.cafe.name')} (${l.toUpperCase()})`} required={l === 'sr'}>
            {(p) => (
              <Input
                {...p}
                dir={l === 'ar' ? 'rtl' : undefined}
                value={value[l]?.name ?? ''}
                maxLength={80}
                onChange={(e) => onChange({ ...value, [l]: { ...value[l], name: e.target.value } })}
              />
            )}
          </Field>
          {withDescription && (
            <Field label={`${t('admin.cafe.description')} (${l.toUpperCase()})`}>
              {(p) => (
                <Input
                  {...p}
                  dir={l === 'ar' ? 'rtl' : undefined}
                  value={value[l]?.description ?? ''}
                  maxLength={300}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [l]: { name: value[l]?.name ?? '', description: e.target.value },
                    })
                  }
                />
              )}
            </Field>
          )}
        </div>
      ))}
    </div>
  );
}
const cleanTr = (v: Record<string, { name: string; description?: string }>, desc: boolean) =>
  Object.fromEntries(
    Object.entries(v)
      .filter(([, x]) => x.name?.trim())
      .map(([l, x]) => [
        l,
        desc
          ? { name: x.name.trim(), description: x.description?.trim() || null }
          : { name: x.name.trim() },
      ]),
  );

function ItemModal({
  item,
  categories,
  onClose,
}: {
  item: CafeItemDto | { categoryId: string };
  categories: CafeCategoryDto[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const existing = 'id' in item ? item : null;
  const [tr, setTr] = useState<Record<string, { name: string; description?: string }>>(
    Object.fromEntries(
      Object.entries(existing?.translations ?? {}).map(([l, x]) => [
        l,
        { name: x.name, description: x.description ?? '' },
      ]),
    ),
  );
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [price, setPrice] = useState(existing ? String(existing.priceAmount / 100) : '');
  const [available, setAvailable] = useState(existing?.isAvailable ?? true);
  const [track, setTrack] = useState(existing?.trackStock ?? false);
  const [lowAt, setLowAt] = useState(String(existing?.lowStockAt ?? 5));
  const [sku, setSku] = useState(existing?.sku ?? '');
  const priceMinor = parseMoneyInput(price);
  const save = useMenuSave((b: CafeItemBody, locale) =>
    existing
      ? api.put<CafeCategoryDto[]>(`/admin/cafe/items/${existing.id}?locale=${locale}`, b)
      : api.post<CafeCategoryDto[]>(`/admin/cafe/items?locale=${locale}`, b),
  );
  const valid = Boolean(tr.sr?.name?.trim()) && priceMinor !== null;
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={existing ? existing.name : t('admin.cafe.new_item')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!valid}
            loading={save.isPending}
            onClick={() =>
              save.mutate(
                {
                  categoryId,
                  translations: cleanTr(tr, true) as CafeItemBody['translations'],
                  priceAmount: priceMinor ?? 0,
                  isAvailable: available,
                  trackStock: track,
                  lowStockAt: Number(lowAt) || 0,
                  sku: sku || null,
                  sortOrder: existing?.sortOrder ?? 0,
                },
                { onSuccess: onClose },
              )
            }
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('admin.cafe.category')}>
            {(p) => (
              <Select {...p} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
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
          <Field label={t('admin.cafe.sku')} hint={t('admin.cafe.sku_hint')}>
            {(p) => (
              <Input {...p} value={sku} maxLength={60} onChange={(e) => setSku(e.target.value)} />
            )}
          </Field>
        </div>
        <LangFields value={tr} onChange={setTr} withDescription />
        <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-accent-500)]"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
            />
            {t('admin.cafe.available')}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-accent-500)]"
              checked={track}
              onChange={(e) => setTrack(e.target.checked)}
            />
            {t('admin.cafe.track_stock')}
          </label>
          {track && (
            <label className="flex items-center gap-2 font-normal">
              {t('admin.cafe.low_at')}
              <Input
                aria-label={t('admin.cafe.low_at')}
                inputMode="numeric"
                value={lowAt}
                onChange={(e) => setLowAt(e.target.value)}
                className="w-20"
              />
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}

function CategoryModal({ category, onClose }: { category?: CafeCategoryDto; onClose: () => void }) {
  const { t } = useTranslation();
  const [tr, setTr] = useState<Record<string, { name: string }>>(
    Object.fromEntries(
      Object.entries(category?.translations ?? {}).map(([l, x]) => [l, { name: x.name }]),
    ),
  );
  const [active, setActive] = useState(category?.isActive ?? true);
  const [sort, setSort] = useState(String(category?.sortOrder ?? 0));
  const save = useMenuSave((b: CafeCategoryBody, locale) =>
    category
      ? api.put<CafeCategoryDto[]>(`/admin/cafe/categories/${category.id}?locale=${locale}`, b)
      : api.post<CafeCategoryDto[]>(`/admin/cafe/categories?locale=${locale}`, b),
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={category ? category.name : t('admin.cafe.new_category')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!tr.sr?.name?.trim()}
            loading={save.isPending}
            onClick={() =>
              save.mutate(
                {
                  translations: cleanTr(tr, false) as CafeCategoryBody['translations'],
                  isActive: active,
                  sortOrder: Number(sort) || 0,
                },
                { onSuccess: onClose },
              )
            }
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <LangFields value={tr} onChange={setTr} />
        <div className="flex items-center gap-4">
          <Field label={t('admin.cafe.sort')} className="w-28">
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              />
            )}
          </Field>
          <label className="mt-5 flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-accent-500)]"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            {t('admin.cafe.visible')}
          </label>
        </div>
      </div>
    </Modal>
  );
}

function StockModal({ item, onClose }: { item: CafeItemDto; onClose: () => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<'restock' | 'adjust' | 'waste'>('restock');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const n = Number(qty);
  const save = useMenuSave((_: void, locale) =>
    api.post<CafeCategoryDto[]>(`/admin/cafe/items/${item.id}/stock?locale=${locale}`, {
      delta: reason === 'restock' ? n : reason === 'waste' ? -n : n - (item.stockQty ?? 0),
      reason,
      note,
    }),
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('admin.cafe.stock')}: ${item.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!Number.isInteger(n) || n < 0 || (reason !== 'adjust' && n === 0)}
            loading={save.isPending}
            onClick={() => save.mutate(undefined, { onSuccess: onClose })}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">
          {item.trackStock
            ? t('admin.cafe.in_stock', { n: item.stockQty })
            : t('admin.cafe.stock_off_hint')}
        </p>
        <Field label={t('admin.cafe.stock_reason')}>
          {(p) => (
            <Select
              {...p}
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
            >
              <option value="restock">{t('admin.cafe.reasons.restock')}</option>
              <option value="waste">{t('admin.cafe.reasons.waste')}</option>
              <option value="adjust">{t('admin.cafe.reasons.adjust')}</option>
            </Select>
          )}
        </Field>
        <Field
          label={reason === 'adjust' ? t('admin.cafe.stock_counted') : t('admin.cafe.stock_qty')}
          required
        >
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
            />
          )}
        </Field>
        <Field label={t('admin.cafe.note')}>
          {(p) => (
            <Input {...p} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          )}
        </Field>
        {save.error && (
          <p role="alert" className="text-sm text-status-danger">
            {t(save.error instanceof ApiError ? save.error.message : 'errors.internal')}
          </p>
        )}
      </div>
    </Modal>
  );
}
