import type { ExerciseDetailDto, ExerciseDto, MuscleGroupDto } from '@grit/validation';
import { EXERCISE_CATEGORIES, EXERCISE_TRACKING } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  TableSkeleton,
} from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useEquipmentList } from '../facility/EquipmentPage';

const LOCALES = ['sr', 'en', 'ru'] as const;
type Loc = (typeof LOCALES)[number];

function useMuscles() {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['muscle-groups', i18n.language],
    queryFn: () => api.get<MuscleGroupDto[]>('/public/muscle-groups', { locale: i18n.language }),
    staleTime: 60 * 60_000,
  });
}

export function ExercisesPage() {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const list = useQuery({
    queryKey: ['admin-exercises', i18n.language],
    queryFn: () => api.get<ExerciseDto[]>('/admin/exercises'),
  });
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (list.data ?? []).filter(
      (e) =>
        (!category || e.category === category) &&
        (!term || e.name.toLowerCase().includes(term) || e.key.includes(term)),
    );
  }, [list.data, q, category]);

  return (
    <>
      <PageHeader
        title={t('admin.exercises.title')}
        subtitle={t('admin.exercises.subtitle')}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            {t('admin.exercises.new')}
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border-subtle p-4">
          <div className="relative min-w-56 flex-1">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('admin.exercises.search')}
              aria-label={t('admin.exercises.search')}
              className="h-10 ps-9"
            />
          </div>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label={t('admin.exercises.category')}
            className="h-10 w-auto"
          >
            <option value="">{t('admin.members.all')}</option>
            {EXERCISE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`app.exercises.categories.${c}`)}
              </option>
            ))}
          </Select>
        </div>
        {list.isPending ? (
          <TableSkeleton />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={BookOpen} title={t('admin.exercises.empty')} />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {filtered.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setEditing(e.id)}
                  className={cn(
                    'flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-start hover:bg-bg-surface2',
                    !e.isActive && 'opacity-50',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.name}</span>
                    <span className="block truncate text-xs text-text-secondary">
                      {e.muscles.map((m) => m.name).join(', ')}
                    </span>
                  </span>
                  <Badge>{t(`app.exercises.categories.${e.category}`)}</Badge>
                  {!e.isActive && <Badge>{t('admin.exercises.inactive')}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && (
        <ExerciseModal id={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function ExerciseModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ['admin-exercise', id],
    queryFn: () => api.get<ExerciseDetailDto>(`/admin/exercises/${id}`),
    enabled: id !== null,
  });
  if (id && detail.isPending) {
    return (
      <Modal open onClose={onClose} title="…">
        <Skeleton className="h-64" />
      </Modal>
    );
  }
  return <ExerciseForm existing={detail.data ?? null} onClose={onClose} />;
}

function ExerciseForm({
  existing,
  onClose,
}: {
  existing: ExerciseDetailDto | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const muscles = useMuscles();
  const equipment = useEquipmentList();
  const [lang, setLang] = useState<Loc>(
    (LOCALES as readonly string[]).includes(i18n.language) ? (i18n.language as Loc) : 'sr',
  );
  const [key, setKey] = useState(existing?.key ?? '');
  const [category, setCategory] = useState(existing?.category ?? 'strength');
  const [tracking, setTracking] = useState(existing?.tracking ?? 'weight_reps');
  const [video, setVideo] = useState(existing?.videoUrl ?? '');
  const [active, setActive] = useState(existing?.isActive ?? true);
  const [selected, setSelected] = useState<string[]>(existing?.muscles.map((m) => m.key) ?? []);
  const [machines, setMachines] = useState<string[]>(existing?.equipmentIds ?? []);
  const [tr, setTr] = useState(
    () =>
      Object.fromEntries(
        LOCALES.map((l) => [
          l,
          {
            name: existing?.translations?.[l]?.name ?? '',
            instructions: existing?.translations?.[l]?.instructions ?? '',
          },
        ]),
      ) as Record<Loc, { name: string; instructions: string }>,
  );
  const save = useMutation({
    mutationFn: () => {
      const body = {
        category,
        tracking,
        videoUrl: video || null,
        isActive: active,
        muscles: selected,
        // Trainers cannot list equipment: never overwrite links they could not see.
        ...(equipment.isSuccess && { equipmentIds: machines }),
        translations: Object.fromEntries(
          LOCALES.filter((l) => tr[l].name.trim()).map((l) => [
            l,
            { name: tr[l].name, instructions: tr[l].instructions || null },
          ]),
        ),
      };
      return existing
        ? api.patch(`/admin/exercises/${existing.id}`, body)
        : api.post('/admin/exercises', { ...body, key });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-exercises'] });
      void qc.invalidateQueries({ queryKey: ['admin-exercise'] });
      toast.success(t('admin.exercises.saved'));
      onClose();
    },
  });
  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={existing ? existing.name : t('admin.exercises.new')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            disabled={!tr.sr.name.trim() || selected.length === 0 || (!existing && !key)}
            onClick={() => save.mutate()}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <div role="tablist" className="mb-3 flex gap-1">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={lang === l}
                onClick={() => setLang(l)}
                className={cn(
                  'h-8 rounded-sm border px-3 text-xs font-semibold',
                  lang === l
                    ? 'border-accent-500 bg-accent-tint'
                    : 'border-border-subtle text-text-secondary',
                )}
              >
                {l.toUpperCase()}
                {l === 'sr' && ' *'}
              </button>
            ))}
          </div>
          <div className="grid gap-4">
            <Field label={t('admin.exercises.name')} required={lang === 'sr'}>
              {(p) => (
                <Input
                  {...p}
                  value={tr[lang].name}
                  onChange={(e) => setTr({ ...tr, [lang]: { ...tr[lang], name: e.target.value } })}
                />
              )}
            </Field>
            <Field label={t('admin.exercises.instructions')}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={4}
                  value={tr[lang].instructions}
                  onChange={(e) =>
                    setTr({ ...tr, [lang]: { ...tr[lang], instructions: e.target.value } })
                  }
                />
              )}
            </Field>
          </div>
        </div>
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
        <Field label={t('admin.exercises.category')}>
          {(p) => (
            <Select
              {...p}
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
            >
              {EXERCISE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`app.exercises.categories.${c}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.exercises.tracking')} hint={t('admin.exercises.tracking_hint')}>
          {(p) => (
            <Select
              {...p}
              value={tracking}
              onChange={(e) => setTracking(e.target.value as typeof tracking)}
            >
              {EXERCISE_TRACKING.map((c) => (
                <option key={c} value={c}>
                  {t(`admin.exercises.trackings.${c}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.equipment.video')}>
          {(p) => (
            <Input
              {...p}
              value={video}
              placeholder="https://"
              onChange={(e) => setVideo(e.target.value)}
            />
          )}
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-xs font-semibold tracking-wide text-text-secondary uppercase">
            {t('admin.exercises.muscles')} *
          </legend>
          <p className="mb-2 text-xs text-text-secondary">{t('admin.exercises.muscles_hint')}</p>
          <div className="flex flex-wrap gap-1.5">
            {muscles.data?.map((m) => {
              const idx = selected.indexOf(m.key);
              return (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={idx >= 0}
                  onClick={() => setSelected(toggle(selected, m.key))}
                  className={cn(
                    'h-8 rounded-full border px-3 text-xs font-semibold',
                    idx === 0
                      ? 'border-accent-500 bg-accent-500 text-on-accent'
                      : idx > 0
                        ? 'border-accent-500 bg-accent-tint'
                        : 'border-border-subtle text-text-secondary',
                  )}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-xs font-semibold tracking-wide text-text-secondary uppercase">
            {t('admin.exercises.machines')}
          </legend>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {(equipment.data ?? []).length === 0 && (
              <p className="text-xs text-text-secondary">{t('admin.exercises.no_machines')}</p>
            )}
            {equipment.data?.map((e) => (
              <button
                key={e.id}
                type="button"
                aria-pressed={machines.includes(e.id)}
                onClick={() => setMachines(toggle(machines, e.id))}
                className={cn(
                  'h-8 rounded-sm border px-3 text-xs font-semibold',
                  machines.includes(e.id)
                    ? 'border-accent-500 bg-accent-tint'
                    : 'border-border-subtle text-text-secondary',
                )}
              >
                {e.name}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="size-4 accent-accent-500"
          />
          {t('admin.exercises.active')}
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
