import type { PartnerDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenText, Plus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';

export function usePartners() {
  return useQuery({
    queryKey: ['business', 'partners'],
    queryFn: () => api.get<PartnerDto[]>('/admin/partners'),
  });
}

export const partnerRoles = (p: PartnerDto, t: (k: string) => string) =>
  [
    p.isSupplier && t('admin.business.partner.supplier'),
    p.isCustomer && t('admin.business.partner.customer'),
  ]
    .filter(Boolean)
    .join(' / ');

type Role = 'all' | 'supplier' | 'customer';
type Status = 'all' | 'active' | 'inactive';

/** Komitenti: suppliers and customers, with a filter in every column. */
export function PartnersTab({ onOpenCard }: { onOpenCard: (p: PartnerDto) => void }) {
  const { t } = useTranslation();
  const q = usePartners();
  const [editing, setEditing] = useState<PartnerDto | 'new' | null>(null);
  const [f, setF] = useState({ name: '', taxId: '', registryNo: '', city: '', contact: '' });
  const [role, setRole] = useState<Role>('all');
  const [status, setStatus] = useState<Status>('all');
  const has = (v: string | null, needle: string) =>
    !needle || (v ?? '').toLowerCase().includes(needle.toLowerCase());
  const rows = useMemo(
    () =>
      (q.data ?? []).filter(
        (p) =>
          has(p.name, f.name) &&
          has(p.taxId, f.taxId) &&
          has(p.registryNo, f.registryNo) &&
          has(p.city, f.city) &&
          has([p.contact, p.phone, p.email].filter(Boolean).join(' '), f.contact) &&
          (role === 'all' || (role === 'supplier' ? p.isSupplier : p.isCustomer)) &&
          (status === 'all' || (status === 'active') === p.isActive),
      ),
    [q.data, f, role, status],
  );
  const filter = (k: keyof typeof f, label: string) => (
    <Input
      aria-label={`${t('common.search')}: ${label}`}
      value={f[k]}
      onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))}
      className="h-8 min-w-24 text-xs"
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-text-secondary">{t('admin.business.partner.hint')}</p>
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
          {t('admin.business.partner.new')}
        </Button>
      </div>
      {q.isPending ? (
        <TableSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border-subtle">
          <table className="w-full min-w-[860px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
            <thead className="bg-bg-surface2 text-xs text-text-secondary">
              <tr>
                <th className="px-3 pt-2 text-start">
                  {filter('name', t('admin.business.partner.name'))}
                </th>
                <th className="px-2 pt-2 text-start">
                  {filter('taxId', t('admin.business.partner.tax_id'))}
                </th>
                <th className="px-2 pt-2 text-start">
                  {filter('registryNo', t('admin.business.partner.registry_no'))}
                </th>
                <th className="px-2 pt-2 text-start">
                  {filter('city', t('admin.business.partner.city'))}
                </th>
                <th className="px-2 pt-2 text-start">
                  <Select
                    aria-label={t('admin.business.partner.role')}
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="h-8 text-xs"
                  >
                    <option value="all">{t('admin.purchases.status.all')}</option>
                    <option value="supplier">{t('admin.business.partner.supplier')}</option>
                    <option value="customer">{t('admin.business.partner.customer')}</option>
                  </Select>
                </th>
                <th className="px-2 pt-2 text-start">
                  {filter('contact', t('admin.business.partner.contact'))}
                </th>
                <th className="px-3 pt-2 text-start">
                  <Select
                    aria-label={t('admin.fields.status')}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Status)}
                    className="h-8 text-xs"
                  >
                    <option value="all">{t('admin.purchases.status.all')}</option>
                    <option value="active">{t('admin.purchases.active')}</option>
                    <option value="inactive">{t('admin.purchases.inactive')}</option>
                  </Select>
                </th>
                <th />
              </tr>
              <tr className="uppercase tracking-wide">
                <th className="px-3 py-2 text-start font-semibold">
                  {t('admin.business.partner.name')}
                </th>
                <th className="px-2 py-2 text-start font-semibold">
                  {t('admin.business.partner.tax_id')}
                </th>
                <th className="px-2 py-2 text-start font-semibold">
                  {t('admin.business.partner.registry_no')}
                </th>
                <th className="px-2 py-2 text-start font-semibold">
                  {t('admin.business.partner.city')}
                </th>
                <th className="px-2 py-2 text-start font-semibold">
                  {t('admin.business.partner.role')}
                </th>
                <th className="px-2 py-2 text-start font-semibold">
                  {t('admin.business.partner.contact')}
                </th>
                <th className="px-3 py-2 text-start font-semibold">{t('admin.fields.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer hover:bg-bg-surface2"
                  onClick={() => setEditing(p)}
                >
                  <td className="px-3 py-2.5 font-semibold">{p.name}</td>
                  <td className="tabular px-2 py-2.5">{p.taxId ?? '-'}</td>
                  <td className="tabular px-2 py-2.5">{p.registryNo ?? '-'}</td>
                  <td className="px-2 py-2.5">{p.city ?? '-'}</td>
                  <td className="px-2 py-2.5">{partnerRoles(p, t)}</td>
                  <td className="max-w-48 truncate px-2 py-2.5">
                    {[p.contact, p.phone, p.email].filter(Boolean).join(' · ') || '-'}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={p.isActive ? 'success' : 'neutral'}>
                      {t(p.isActive ? 'admin.purchases.active' : 'admin.purchases.inactive')}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<BookOpenText className="size-3.5" />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCard(p);
                      }}
                    >
                      {t('admin.business.tabs.card')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <EmptyState icon={Users} title={t('admin.business.partner.empty')} />
          )}
        </div>
      )}
      {editing && (
        <PartnerModal
          partner={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export function PartnerModal({
  partner,
  initial,
  onClose,
  onSaved,
}: {
  partner: PartnerDto | null;
  initial?: Partial<PartnerDto>;
  onClose: () => void;
  onSaved?: (p: PartnerDto) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const base = partner ?? initial ?? {};
  const [v, setV] = useState({
    name: base.name ?? '',
    taxId: base.taxId ?? '',
    registryNo: base.registryNo ?? '',
    city: base.city ?? '',
    address: base.address ?? '',
    contact: base.contact ?? '',
    phone: base.phone ?? '',
    email: base.email ?? '',
    note: base.note ?? '',
    isSupplier: base.isSupplier ?? true,
    isCustomer: base.isCustomer ?? false,
    isActive: base.isActive ?? true,
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: () =>
      partner
        ? api.put<PartnerDto>(`/admin/partners/${partner.id}`, v)
        : api.post<PartnerDto>('/admin/partners', v),
    onSuccess: (p) => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['business'] });
      onSaved?.(p);
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const fieldErr = (path: string) => err?.details?.find((d) => d.path === path)?.message;
  const check = (k: 'isSupplier' | 'isCustomer' | 'isActive', label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-4 accent-[var(--color-accent-500)]"
        checked={v[k]}
        onChange={(e) => setV((x) => ({ ...x, [k]: e.target.checked }))}
      />
      {label}
    </label>
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={partner ? partner.name : t('admin.business.partner.new')}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!v.name.trim() || (!v.isSupplier && !v.isCustomer)}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('admin.business.partner.name')} required className="sm:col-span-2">
          {(p) => <Input {...p} value={v.name} onChange={set('name')} />}
        </Field>
        <Field label={t('admin.business.partner.tax_id')} error={fieldErr('taxId')}>
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              maxLength={11}
              value={v.taxId}
              onChange={set('taxId')}
            />
          )}
        </Field>
        <Field label={t('admin.business.partner.registry_no')} error={fieldErr('registryNo')}>
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              maxLength={10}
              value={v.registryNo}
              onChange={set('registryNo')}
            />
          )}
        </Field>
        <Field label={t('admin.business.partner.city')}>
          {(p) => <Input {...p} value={v.city} onChange={set('city')} />}
        </Field>
        <Field label={t('admin.business.partner.address')}>
          {(p) => <Input {...p} value={v.address} onChange={set('address')} />}
        </Field>
        <Field label={t('admin.business.partner.contact')}>
          {(p) => <Input {...p} value={v.contact} onChange={set('contact')} />}
        </Field>
        <Field label={t('admin.fields.phone')}>
          {(p) => <Input {...p} type="tel" value={v.phone} onChange={set('phone')} />}
        </Field>
        <Field label={t('admin.fields.email')} className="sm:col-span-2">
          {(p) => <Input {...p} type="email" value={v.email} onChange={set('email')} />}
        </Field>
        <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">
          {check('isSupplier', t('admin.business.partner.supplier'))}
          {check('isCustomer', t('admin.business.partner.customer'))}
          {check('isActive', t('admin.purchases.active'))}
        </div>
        {!v.isSupplier && !v.isCustomer && (
          <p className="text-sm text-status-warning sm:col-span-2">
            {t('validation.partner_role_required')}
          </p>
        )}
        <Field label={t('admin.fields.note')} className="sm:col-span-2">
          {(p) => <Textarea {...p} className="min-h-14" value={v.note} onChange={set('note')} />}
        </Field>
        {err && !err.details?.length && (
          <p role="alert" className="text-sm text-status-danger sm:col-span-2">
            {t(err.message)}
          </p>
        )}
      </div>
    </Modal>
  );
}
