import { createPlanBody, PLAN_KINDS, ZONE_KEYS, type PlanDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/States';
import { Table, Td, Th } from '@/components/ui/Table';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { parseMoneyInput, useFormat } from '@/lib/format';
import { useCan } from '@/lib/me';
import { planLimits, planName } from './plan-utils';

export function PlansPage() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const [editing, setEditing] = useState<PlanDto | 'new' | null>(null);
  const q = useQuery({ queryKey: ['plans'], queryFn: () => api.get<PlanDto[]>('/admin/plans') });

  return (
    <>
      <PageHeader
        title={t('admin.plans.title')}
        subtitle={t('admin.plans.subtitle')}
        actions={
          can('plans.manage') && (
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              {t('admin.plans.new')}
            </Button>
          )
        }
      />
      <Card>
        {q.isPending ? (
          <TableSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState
            icon={Package}
            title={t('admin.plans.empty')}
            description={t('admin.plans.empty_hint')}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('admin.fields.name')}</Th>
                <Th>{t('admin.plans.kind')}</Th>
                <Th className="text-end">{t('admin.fields.price')}</Th>
                <Th>{t('admin.plans.limits')}</Th>
                <Th>{t('admin.plans.zones')}</Th>
                <Th>{t('admin.fields.status')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {q.data.map((p) => (
                <tr key={p.id}>
                  <Td className="font-semibold">{planName(p, i18n.language)}</Td>
                  <Td className="text-text-secondary">{t(`admin.plans.kinds.${p.kind}`)}</Td>
                  <Td className="tabular text-end font-semibold">
                    {f.money(p.priceAmount, p.currency)}
                  </Td>
                  <Td className="text-text-secondary">{planLimits(p, t)}</Td>
                  <Td className="text-text-secondary">
                    {p.zones.map((z) => t(`admin.zones.${z}`)).join(', ') || '-'}
                  </Td>
                  <Td>
                    <Badge tone={p.isAvailable ? 'success' : 'neutral'}>
                      {t(p.isAvailable ? 'admin.plans.available' : 'admin.plans.hidden')}
                    </Badge>
                  </Td>
                  <Td className="text-end">
                    {can('plans.manage') && (
                      <IconButton label={t('common.edit')} onClick={() => setEditing(p)}>
                        <Pencil className="size-4" />
                      </IconButton>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && (
        <PlanFormModal
          plan={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

type FormValues = {
  kind: PlanDto['kind'];
  price: string;
  durationDays: string;
  visitLimit: string;
  maxPauses: string;
  maxPauseDays: string;
  isAvailable: boolean;
  sortOrder: string;
  zones: string[];
  nameSr: string;
  nameEn: string;
  nameRu: string;
  descriptionSr: string;
};

const toInt = (v: string) => (v.trim() === '' ? null : Number.parseInt(v, 10));

function PlanFormModal({ plan, onClose }: { plan?: PlanDto; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    defaultValues: {
      kind: plan?.kind ?? 'unlimited',
      price: plan ? String(plan.priceAmount / 100) : '',
      durationDays: plan?.durationDays?.toString() ?? '30',
      visitLimit: plan?.visitLimit?.toString() ?? '',
      maxPauses: String(plan?.maxPauses ?? 0),
      maxPauseDays: String(plan?.maxPauseDays ?? 0),
      isAvailable: plan?.isAvailable ?? false,
      sortOrder: String(plan?.sortOrder ?? 0),
      zones: plan?.zones ?? ['gym'],
      nameSr: plan?.translations.sr?.name ?? '',
      nameEn: plan?.translations.en?.name ?? '',
      nameRu: plan?.translations.ru?.name ?? '',
      descriptionSr: plan?.translations.sr?.description ?? '',
    },
  });

  // Build the API payload, then validate it with the same zod schema the API uses.
  const toPayload = (v: FormValues) => ({
    kind: v.kind,
    priceAmount: parseMoneyInput(v.price) ?? -1,
    durationDays: toInt(v.durationDays),
    visitLimit: toInt(v.visitLimit),
    maxPauses: toInt(v.maxPauses) ?? 0,
    maxPauseDays: toInt(v.maxPauseDays) ?? 0,
    isAvailable: v.isAvailable,
    sortOrder: toInt(v.sortOrder) ?? 0,
    zones: v.zones as z.input<typeof createPlanBody>['zones'],
    translations: {
      sr: { name: v.nameSr, description: v.descriptionSr },
      ...(v.nameEn.trim() && { en: { name: v.nameEn } }),
      ...(v.nameRu.trim() && { ru: { name: v.nameRu } }),
    },
  });

  const save = useMutation({
    mutationFn: (payload: z.output<typeof createPlanBody>) =>
      plan ? api.patch(`/admin/plans/${plan.id}`, payload) : api.post('/admin/plans', payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plans'] });
      toast.success(t('admin.plans.saved'));
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'errors.internal'),
  });

  const submit = form.handleSubmit((v) => {
    setError(null);
    const parsed = createPlanBody.safeParse(toPayload(v));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'errors.validation.failed');
      return;
    }
    save.mutate(parsed.data);
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t(plan ? 'admin.plans.edit' : 'admin.plans.new')}
      description={plan ? t('admin.plans.price_change_hint') : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="plan-form" loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="plan-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label={t('admin.plans.name_sr')} required>
          {(p) => <Input {...p} {...form.register('nameSr')} />}
        </Field>
        <Field label={t('admin.plans.name_en')}>
          {(p) => <Input {...p} {...form.register('nameEn')} />}
        </Field>
        <Field label={t('admin.plans.name_ru')} className="sm:col-span-2 sm:col-span-1">
          {(p) => <Input {...p} {...form.register('nameRu')} />}
        </Field>
        <Field label={t('admin.plans.kind')} required>
          {(p) => (
            <Select {...p} {...form.register('kind')}>
              {PLAN_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`admin.plans.kinds.${k}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.fields.price_rsd')} required>
          {(p) => <Input {...p} inputMode="decimal" {...form.register('price')} />}
        </Field>
        <Field label={t('admin.plans.duration')} hint={t('admin.plans.limit_hint')}>
          {(p) => <Input {...p} type="number" min={1} {...form.register('durationDays')} />}
        </Field>
        <Field label={t('admin.plans.visit_limit')} hint={t('admin.plans.visit_limit_hint')}>
          {(p) => <Input {...p} type="number" min={1} {...form.register('visitLimit')} />}
        </Field>
        <Field label={t('admin.plans.max_pauses')}>
          {(p) => <Input {...p} type="number" min={0} {...form.register('maxPauses')} />}
        </Field>
        <Field label={t('admin.plans.max_pause_days')}>
          {(p) => <Input {...p} type="number" min={0} {...form.register('maxPauseDays')} />}
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-xs font-semibold tracking-wide text-text-secondary uppercase">
            {t('admin.plans.zones')}
          </legend>
          <Controller
            control={form.control}
            name="zones"
            render={({ field }) => (
              <div className="flex flex-wrap gap-4">
                {ZONE_KEYS.map((z) => (
                  <label key={z} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-accent-500)]"
                      checked={field.value.includes(z)}
                      onChange={(e) =>
                        field.onChange(
                          e.target.checked
                            ? [...field.value, z]
                            : field.value.filter((x) => x !== z),
                        )
                      }
                    />
                    {t(`admin.zones.${z}`)}
                  </label>
                ))}
              </div>
            )}
          />
        </fieldset>
        <Field label={t('admin.plans.description_sr')} className="sm:col-span-2">
          {(p) => <Textarea {...p} className="min-h-16" {...form.register('descriptionSr')} />}
        </Field>
        <label className="sm:col-span-2 flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-accent-500)]"
            {...form.register('isAvailable')}
          />
          {t('admin.plans.is_available')}
        </label>
        {error && (
          <p role="alert" className="sm:col-span-2 text-sm text-status-danger">
            {t(error, { defaultValue: t('errors.validation.failed') })}
          </p>
        )}
      </form>
    </Modal>
  );
}
