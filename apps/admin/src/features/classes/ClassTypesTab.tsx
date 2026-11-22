import type { ClassTypeDto } from '@grit/validation';
import { ZONE_KEYS } from '@grit/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Shapes } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, EmptyState, ErrorState, TableSkeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useClassTypes } from './classes-utils';

const LOCALES = ['sr', 'en', 'ru'] as const;

export function ClassTypesTab() {
  const { t } = useTranslation();
  const q = useClassTypes();
  const [editing, setEditing] = useState<ClassTypeDto | 'new' | null>(null);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-4">
        <p className="max-w-xl text-sm text-text-secondary">{t('admin.classes.types_intro')}</p>
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
          {t('admin.classes.new_type')}
        </Button>
      </div>
      {q.isPending ? (
        <TableSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState icon={Shapes} title={t('admin.classes.types_empty')} />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {q.data.map((ty) => (
            <li key={ty.id}>
              <button
                type="button"
                onClick={() => setEditing(ty)}
                className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-bg-surface2"
              >
                <span className="size-3 shrink-0 rounded-full" style={{ background: ty.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{ty.name}</span>
                  <span className="block truncate text-xs text-text-secondary">
                    {t(`admin.zones.${ty.zone}`)} ·{' '}
                    {t('admin.classes.minutes', { count: ty.defaultDurationMin })} ·{' '}
                    {t('admin.classes.capacity_n', { count: ty.defaultCapacity })}
                  </span>
                </span>
                {!ty.isActive && <Badge>{t('admin.classes.inactive')}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <TypeModal existing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </Card>
  );
}

function TypeModal({ existing, onClose }: { existing: ClassTypeDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [key, setKey] = useState(existing?.key ?? '');
  const [zone, setZone] = useState(existing?.zone ?? 'crossfit');
  const [color, setColor] = useState(existing?.color ?? '#E54E26');
  const [duration, setDuration] = useState(String(existing?.defaultDurationMin ?? 60));
  const [capacity, setCapacity] = useState(String(existing?.defaultCapacity ?? 12));
  const [active, setActive] = useState(existing?.isActive ?? true);
  const [tr, setTr] = useState(() =>
    Object.fromEntries(
      LOCALES.map((l) => [
        l,
        {
          name: existing?.translations?.[l]?.name ?? '',
          description: existing?.translations?.[l]?.description ?? '',
        },
      ]),
    ),
  );
  const translations = Object.fromEntries(
    LOCALES.filter((l) => tr[l]!.name.trim()).map((l) => [
      l,
      { name: tr[l]!.name, description: tr[l]!.description || null },
    ]),
  );
  const save = useMutation({
    mutationFn: () => {
      const body = {
        zone,
        color,
        defaultDurationMin: Number(duration),
        defaultCapacity: Number(capacity),
        isActive: active,
        translations,
      };
      return existing
        ? api.patch(`/admin/class-types/${existing.id}`, body)
        : api.post('/admin/class-types', { ...body, key });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['class-types'] });
      void qc.invalidateQueries({ queryKey: ['classes'] });
      toast.success(t('admin.classes.saved'));
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? existing.name : t('admin.classes.new_type')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            disabled={!tr.sr!.name.trim() || (!existing && !key)}
            onClick={() => save.mutate()}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {LOCALES.map((l) => (
          <Field
            key={l}
            label={`${t('admin.classes.type_name')} (${l.toUpperCase()})`}
            required={l === 'sr'}
            className="sm:col-span-2"
          >
            {(p) => (
              <Input
                {...p}
                value={tr[l]!.name}
                onChange={(e) => setTr({ ...tr, [l]: { ...tr[l]!, name: e.target.value } })}
              />
            )}
          </Field>
        ))}
        <Field label={t('admin.classes.description')} className="sm:col-span-2">
          {(p) => (
            <Textarea
              {...p}
              value={tr.sr!.description}
              onChange={(e) => setTr({ ...tr, sr: { ...tr.sr!, description: e.target.value } })}
            />
          )}
        </Field>
        {!existing && (
          <Field label={t('admin.classes.key')} hint={t('admin.classes.key_hint')} required>
            {(p) => (
              <Input
                {...p}
                value={key}
                onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              />
            )}
          </Field>
        )}
        <Field label={t('admin.classes.zone')} hint={t('admin.classes.zone_hint')}>
          {(p) => (
            <Select {...p} value={zone} onChange={(e) => setZone(e.target.value)}>
              {ZONE_KEYS.filter((z) => z !== 'pool').map((z) => (
                <option key={z} value={z}>
                  {t(`admin.zones.${z}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.classes.color')}>
          {(p) => (
            <Input
              {...p}
              type="color"
              value={color}
              className="h-10 p-1"
              onChange={(e) => setColor(e.target.value.toUpperCase())}
            />
          )}
        </Field>
        <Field label={t('admin.classes.duration')}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={15}
              max={240}
              step={5}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('admin.classes.capacity')}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              max={200}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          )}
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="size-4 accent-accent-500"
          />
          {t('admin.classes.active_label')}
        </label>
        {save.error && (
          <p role="alert" className="text-sm text-status-danger sm:col-span-2">
            {t(save.error instanceof ApiError ? save.error.message : 'errors.internal')}
          </p>
        )}
      </div>
    </Modal>
  );
}
