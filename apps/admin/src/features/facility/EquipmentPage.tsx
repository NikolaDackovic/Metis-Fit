import type { EquipmentAdminDto, EquipmentStatus } from '@grit/validation';
import { EQUIPMENT_STATUSES } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Dumbbell, MapPin, Pencil, Plus, Search, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Table';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';

export const statusTone: Record<EquipmentStatus, 'success' | 'warning' | 'danger'> = {
  available: 'success',
  maintenance: 'warning',
  out_of_service: 'danger',
};

export function useCategories() {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['equipment-categories', i18n.language],
    queryFn: () =>
      api.get<Array<{ key: string; name: string }>>('/public/equipment-categories', {
        locale: i18n.language,
      }),
    staleTime: 10 * 60_000,
  });
}

export function useEquipmentList(filters: { q?: string; category?: string; status?: string } = {}) {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['equipment', filters, i18n.language],
    queryFn: () =>
      api.get<EquipmentAdminDto[]>('/admin/equipment', { ...filters, locale: i18n.language }),
  });
}

export function EquipmentPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<EquipmentAdminDto | 'new' | null>(null);
  const categories = useCategories();
  const list = useEquipmentList({
    q: q || undefined,
    category: category || undefined,
    status: status || undefined,
  });

  return (
    <>
      <PageHeader
        title={t('admin.equipment.title')}
        subtitle={t('admin.equipment.subtitle')}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            {t('admin.equipment.new')}
          </Button>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-border-subtle p-4 md:flex-row md:items-center">
          <div className="relative md:flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('admin.equipment.search')}
              aria-label={t('common.search')}
              className="ps-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 md:flex">
            <Select
              aria-label={t('admin.equipment.category')}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">{t('admin.equipment.all_categories')}</option>
              {categories.data?.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label={t('admin.fields.status')}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">{t('admin.members.all')}</option>
              {EQUIPMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`equipment.status.${s}`)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {list.isPending ? (
          <TableSkeleton />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title={
              q || category || status ? t('admin.equipment.no_results') : t('admin.equipment.empty')
            }
            description={q || category || status ? undefined : t('admin.equipment.empty_hint')}
          />
        ) : (
          <ul className="grid gap-px bg-border-subtle sm:grid-cols-2 xl:grid-cols-3">
            {list.data.map((e) => (
              <li key={e.id} className="flex flex-col gap-3 bg-bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{e.name}</p>
                    <p className="truncate text-xs text-text-secondary">
                      {e.categoryName}
                      {e.manufacturer ? ` · ${e.manufacturer}${e.model ? ` ${e.model}` : ''}` : ''}
                    </p>
                  </div>
                  <IconButton label={t('common.edit')} onClick={() => setEditing(e)}>
                    <Pencil className="size-4" />
                  </IconButton>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone[e.status]}>{t(`equipment.status.${e.status}`)}</Badge>
                  {e.openRequests > 0 && (
                    <Badge tone="warning" icon={<Wrench className="size-3" />}>
                      {t('admin.equipment.open_requests', { count: e.openRequests })}
                    </Badge>
                  )}
                </div>
                <p
                  className={cn(
                    'flex items-center gap-1.5 text-xs',
                    e.location ? 'text-text-secondary' : 'text-text-muted',
                  )}
                >
                  <MapPin className="size-3.5" aria-hidden />
                  {e.location
                    ? `${e.location.floorName} · ${e.location.roomName}`
                    : t('admin.equipment.not_on_map')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && (
        <EquipmentModal
          item={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

type Lang = 'sr' | 'en' | 'ru';
type Texts = { name: string; description: string; usageInstructions: string; safetyNotes: string };
const emptyTexts: Texts = { name: '', description: '', usageInstructions: '', safetyNotes: '' };

function EquipmentModal({ item, onClose }: { item?: EquipmentAdminDto; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const categories = useCategories();
  const [lang, setLang] = useState<Lang>('sr');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    categoryKey: item?.categoryKey ?? 'strength_machines',
    status: item?.status ?? ('available' as EquipmentStatus),
    manufacturer: item?.manufacturer ?? '',
    model: item?.model ?? '',
    serialNumber: item?.serialNumber ?? '',
    assetTag: item?.assetTag ?? '',
    purchasedOn: item?.purchasedOn ?? '',
    videoUrl: item?.videoUrl ?? '',
  });
  const [texts, setTexts] = useState<Record<Lang, Texts>>(() => {
    const from = (l: Lang): Texts => {
      const tr = item?.translations[l];
      return tr
        ? {
            name: tr.name,
            description: tr.description ?? '',
            usageInstructions: tr.usageInstructions ?? '',
            safetyNotes: tr.safetyNotes ?? '',
          }
        : emptyTexts;
    };
    return { sr: from('sr'), en: from('en'), ru: from('ru') };
  });

  const setText = (k: keyof Texts, v: string) =>
    setTexts((s) => ({ ...s, [lang]: { ...s[lang], [k]: v } }));

  const save = useMutation({
    mutationFn: () => {
      const translations = Object.fromEntries(
        (['sr', 'en', 'ru'] as Lang[])
          .filter((l) => l === 'sr' || texts[l].name.trim())
          .map((l) => [l, texts[l]]),
      );
      const body = { ...form, translations };
      return item
        ? api.patch(`/admin/equipment/${item.id}`, body)
        : api.post('/admin/equipment', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['equipment'] });
      toast.success(t('admin.equipment.saved'));
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        const field = e.fieldErrors();
        setError(Object.values(field)[0] ?? e.message);
      } else setError('errors.internal');
    },
  });

  const archive = useMutation({
    mutationFn: () => api.post(`/admin/equipment/${item!.id}/archive`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['equipment'] });
      toast.success(t('admin.equipment.archived'));
      onClose();
    },
  });

  const f = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((s) => ({ ...s, [k]: e.target.value })),
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t(item ? 'admin.equipment.edit' : 'admin.equipment.new')}
      footer={
        <>
          {item && (
            <Button
              variant="danger"
              icon={<Archive className="size-4" />}
              className="me-auto"
              loading={archive.isPending}
              onClick={() => archive.mutate()}
            >
              {t('admin.equipment.archive')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            disabled={!texts.sr.name.trim()}
            onClick={() => save.mutate()}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('admin.equipment.category')} required>
          {(p) => (
            <Select {...p} {...f('categoryKey')}>
              {categories.data?.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.fields.status')}>
          {(p) => (
            <Select {...p} {...f('status')}>
              {EQUIPMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`equipment.status.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.equipment.manufacturer')}>
          {(p) => <Input {...p} {...f('manufacturer')} />}
        </Field>
        <Field label={t('admin.equipment.model')}>{(p) => <Input {...p} {...f('model')} />}</Field>
        <Field label={t('admin.equipment.serial')} hint={t('admin.equipment.internal_hint')}>
          {(p) => <Input {...p} {...f('serialNumber')} />}
        </Field>
        <Field label={t('admin.equipment.asset_tag')}>
          {(p) => <Input {...p} {...f('assetTag')} />}
        </Field>
        <Field label={t('admin.equipment.purchased_on')}>
          {(p) => <Input {...p} type="date" {...f('purchasedOn')} />}
        </Field>
        <Field label={t('admin.equipment.video')} hint="https://…">
          {(p) => <Input {...p} type="url" {...f('videoUrl')} />}
        </Field>

        <div className="sm:col-span-2">
          <Tabs
            tabs={[
              { value: 'sr', label: 'Srpski' },
              { value: 'en', label: 'English' },
              { value: 'ru', label: 'Русский' },
            ]}
            value={lang}
            onChange={setLang}
          />
        </div>
        <Field label={t('admin.fields.name')} required={lang === 'sr'} className="sm:col-span-2">
          {(p) => (
            <Input
              {...p}
              value={texts[lang].name}
              onChange={(e) => setText('name', e.target.value)}
            />
          )}
        </Field>
        <Field label={t('admin.equipment.description')} className="sm:col-span-2">
          {(p) => (
            <Textarea
              {...p}
              className="min-h-16"
              value={texts[lang].description}
              onChange={(e) => setText('description', e.target.value)}
            />
          )}
        </Field>
        <Field label={t('admin.equipment.usage')} className="sm:col-span-2">
          {(p) => (
            <Textarea
              {...p}
              value={texts[lang].usageInstructions}
              onChange={(e) => setText('usageInstructions', e.target.value)}
            />
          )}
        </Field>
        <Field label={t('admin.equipment.safety')} className="sm:col-span-2">
          {(p) => (
            <Textarea
              {...p}
              className="min-h-16"
              value={texts[lang].safetyNotes}
              onChange={(e) => setText('safetyNotes', e.target.value)}
            />
          )}
        </Field>
        {error && (
          <p role="alert" className="text-sm text-status-danger sm:col-span-2">
            {t(error, { defaultValue: t('errors.validation.failed') })}
          </p>
        )}
      </div>
    </Modal>
  );
}
