import type { PlanDto, PromoBody, PromoDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, TicketPercent } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/States';
import { Table, Td, Th } from '@/components/ui/Table';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { parseMoneyInput, useFormat } from '@/lib/format';
import { planName } from '../plans/plan-utils';

type Form = {
  code: string;
  kind: 'percent' | 'fixed';
  value: string;
  planIds: string[];
  validFrom: string;
  validUntil: string;
  maxUses: string;
  maxUsesPerMember: string;
  isActive: boolean;
  isPublic: boolean;
  title: Record<string, string>;
  description: Record<string, string>;
};
const LOCALES = ['sr', 'en', 'ru'] as const;

const toForm = (p?: PromoDto): Form => ({
  code: p?.code ?? '',
  kind: p?.kind ?? 'percent',
  value: p ? String(p.kind === 'fixed' ? p.value / 100 : p.value) : '',
  planIds: p?.planIds ?? [],
  validFrom: p?.validFrom ?? '',
  validUntil: p?.validUntil ?? '',
  maxUses: p?.maxUses ? String(p.maxUses) : '',
  maxUsesPerMember: String(p?.maxUsesPerMember ?? 1),
  isActive: p?.isActive ?? true,
  isPublic: p?.isPublic ?? false,
  title: Object.fromEntries(LOCALES.map((l) => [l, p?.translations[l]?.title ?? ''])),
  description: Object.fromEntries(LOCALES.map((l) => [l, p?.translations[l]?.description ?? ''])),
});

function toBody(f: Form): PromoBody | null {
  const value = f.kind === 'fixed' ? parseMoneyInput(f.value) : Number(f.value);
  if (!value || !Number.isInteger(value)) return null;
  return {
    code: f.code.trim().toUpperCase(),
    kind: f.kind,
    value,
    planIds: f.planIds.length ? f.planIds : null,
    validFrom: f.validFrom || null,
    validUntil: f.validUntil || null,
    maxUses: f.maxUses ? Number(f.maxUses) : null,
    maxUsesPerMember: Number(f.maxUsesPerMember) || 1,
    isActive: f.isActive,
    isPublic: f.isPublic,
    translations: Object.fromEntries(
      LOCALES.filter((l) => f.title[l]?.trim()).map((l) => [
        l,
        { title: f.title[l]!.trim(), description: f.description[l]?.trim() || null },
      ]),
    ),
  };
}

/** Promo codes the front desk applies when selling a membership. */
export function PromosPage() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const q = useQuery({ queryKey: ['promos'], queryFn: () => api.get<PromoDto[]>('/admin/promos') });
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<PlanDto[]>('/admin/plans'),
  });
  const [editing, setEditing] = useState<PromoDto | 'new' | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const state = (p: PromoDto) =>
    !p.isActive
      ? { tone: 'neutral' as const, label: t('admin.promos.state.off') }
      : p.validUntil && p.validUntil < today
        ? { tone: 'neutral' as const, label: t('admin.promos.state.expired') }
        : p.maxUses != null && p.usesCount >= p.maxUses
          ? { tone: 'warning' as const, label: t('admin.promos.state.used_up') }
          : p.validFrom && p.validFrom > today
            ? { tone: 'info' as const, label: t('admin.promos.state.scheduled') }
            : { tone: 'success' as const, label: t('admin.promos.state.active') };

  return (
    <>
      <PageHeader
        title={t('admin.promos.title')}
        subtitle={t('admin.promos.subtitle')}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            {t('admin.promos.new')}
          </Button>
        }
      />
      <Card>
        {q.isPending ? (
          <TableSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data.length ? (
          <EmptyState
            icon={TicketPercent}
            title={t('admin.promos.empty')}
            description={t('admin.promos.empty_hint')}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('admin.promos.code')}</Th>
                <Th>{t('admin.promos.discount')}</Th>
                <Th className="hidden md:table-cell">{t('admin.promos.valid')}</Th>
                <Th>{t('admin.promos.uses')}</Th>
                <Th className="hidden md:table-cell">{t('admin.promos.total')}</Th>
                <Th>{t('admin.promos.status')}</Th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((p) => {
                const s = state(p);
                return (
                  <tr
                    key={p.id}
                    className="cursor-pointer hover:bg-bg-surface2"
                    onClick={() => setEditing(p)}
                  >
                    <Td>
                      <span className="font-mono font-semibold">{p.code}</span>
                      {p.isPublic && (
                        <span className="ms-2">
                          <Badge tone="accent">{t('admin.promos.public')}</Badge>
                        </span>
                      )}
                    </Td>
                    <Td>{p.kind === 'percent' ? `${p.value}%` : f.money(p.value)}</Td>
                    <Td className="hidden md:table-cell">
                      {p.validFrom || p.validUntil
                        ? `${p.validFrom ? f.date(p.validFrom) : '...'} - ${p.validUntil ? f.date(p.validUntil) : '...'}`
                        : t('admin.promos.always')}
                    </Td>
                    <Td>
                      {p.usesCount}
                      {p.maxUses ? ` / ${p.maxUses}` : ''}
                    </Td>
                    <Td className="hidden md:table-cell">{f.money(p.totalDiscount)}</Td>
                    <Td>
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && (
        <PromoModal
          promo={editing === 'new' ? undefined : editing}
          plans={plans.data ?? []}
          locale={i18n.language}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function PromoModal({
  promo,
  plans,
  locale,
  onClose,
}: {
  promo?: PromoDto;
  plans: PlanDto[];
  locale: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(toForm(promo));
  const [lang, setLang] = useState<(typeof LOCALES)[number]>('sr');
  const body = toBody(form);
  const save = useMutation({
    mutationFn: () =>
      promo ? api.put(`/admin/promos/${promo.id}`, body) : api.post('/admin/promos', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['promos'] });
      toast.success(t('admin.promos.saved'));
      onClose();
    },
  });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((x) => ({ ...x, [k]: v }));

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={promo ? promo.code : t('admin.promos.new')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!body || form.code.trim().length < 3}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('admin.promos.code')} hint={t('admin.promos.code_rules')} required>
          {(p) => (
            <Input
              {...p}
              value={form.code}
              maxLength={30}
              className="font-mono uppercase"
              onChange={(e) =>
                set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))
              }
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('admin.promos.kind')}>
            {(p) => (
              <Select
                {...p}
                value={form.kind}
                onChange={(e) => set('kind', e.target.value as Form['kind'])}
              >
                <option value="percent">%</option>
                <option value="fixed">RSD</option>
              </Select>
            )}
          </Field>
          <Field label={t('admin.promos.value')} required>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={form.value}
                onChange={(e) => set('value', e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label={t('admin.promos.valid_from')}>
          {(p) => (
            <Input
              {...p}
              type="date"
              value={form.validFrom}
              onChange={(e) => set('validFrom', e.target.value)}
            />
          )}
        </Field>
        <Field label={t('admin.promos.valid_until')}>
          {(p) => (
            <Input
              {...p}
              type="date"
              value={form.validUntil}
              onChange={(e) => set('validUntil', e.target.value)}
            />
          )}
        </Field>
        <Field label={t('admin.promos.max_uses')} hint={t('admin.promos.max_uses_hint')}>
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              value={form.maxUses}
              onChange={(e) => set('maxUses', e.target.value)}
            />
          )}
        </Field>
        <Field label={t('admin.promos.per_member')}>
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              value={form.maxUsesPerMember}
              onChange={(e) => set('maxUsesPerMember', e.target.value)}
            />
          )}
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-semibold">{t('admin.promos.plans')}</legend>
          <p className="mb-2 text-xs text-text-secondary">{t('admin.promos.plans_hint')}</p>
          <div className="flex flex-wrap gap-2">
            {plans.map((pl) => {
              const on = form.planIds.includes(pl.id);
              return (
                <label
                  key={pl.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-sm border px-2.5 py-1.5 text-sm ${on ? 'border-accent-500 bg-accent-tint' : 'border-border-subtle'}`}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-accent-500)]"
                    checked={on}
                    onChange={() =>
                      set(
                        'planIds',
                        on ? form.planIds.filter((x) => x !== pl.id) : [...form.planIds, pl.id],
                      )
                    }
                  />
                  {planName(pl, locale)}
                </label>
              );
            })}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-accent-500)]"
            checked={form.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
          />
          {t('admin.promos.active')}
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-accent-500)]"
            checked={form.isPublic}
            onChange={(e) => set('isPublic', e.target.checked)}
          />
          {t('admin.promos.public_label')}
        </label>
        {form.isPublic && (
          <div className="flex flex-col gap-3 rounded-sm border border-border-subtle p-3 sm:col-span-2">
            <div className="flex gap-1" role="tablist">
              {LOCALES.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={l === lang}
                  onClick={() => setLang(l)}
                  className={`rounded-sm px-3 py-1 text-xs font-semibold uppercase ${l === lang ? 'bg-accent-tint text-text-primary' : 'text-text-secondary'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <Field label={t('admin.promos.public_title')} required={lang === 'sr'}>
              {(p) => (
                <Input
                  {...p}
                  value={form.title[lang] ?? ''}
                  maxLength={120}
                  onChange={(e) => set('title', { ...form.title, [lang]: e.target.value })}
                />
              )}
            </Field>
            <Field label={t('admin.promos.public_description')}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={form.description[lang] ?? ''}
                  maxLength={500}
                  onChange={(e) =>
                    set('description', { ...form.description, [lang]: e.target.value })
                  }
                />
              )}
            </Field>
          </div>
        )}
        {save.error && (
          <p role="alert" className="text-sm text-status-danger sm:col-span-2">
            {t(save.error instanceof ApiError ? save.error.message : 'errors.internal')}
          </p>
        )}
      </div>
    </Modal>
  );
}
