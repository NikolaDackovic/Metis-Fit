import {
  SUGGEST_FOCUSES,
  SUGGEST_LEVELS,
  SUGGEST_MINUTES,
  suggestWorkout,
  type ExerciseDto,
  type SuggestFocus,
  type SuggestLevel,
  type WorkoutPlanBody,
  type WorkoutPlanDto,
} from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ClipboardList, Copy, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, CardHeader, EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';

type Item = WorkoutPlanBody['days'][number]['items'][number];
type Day = { title: string; items: Item[] };

/** A member's workout plans, written by their trainer (or a manager). */
export function WorkoutPlansPanel({ memberId }: { memberId: string }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const [editing, setEditing] = useState<WorkoutPlanDto | 'new' | null>(null);
  const [asTemplate, setAsTemplate] = useState<WorkoutPlanDto | null>(null);
  const q = useQuery({
    queryKey: ['workout-plans', memberId, i18n.language],
    queryFn: () => api.get<WorkoutPlanDto[]>(`/admin/members/${memberId}/workout-plans`),
  });
  return (
    <Card>
      <CardHeader
        title={t('admin.plans_w.title')}
        action={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            {t('admin.plans_w.new')}
          </Button>
        }
      />
      {q.isPending ? (
        <Skeleton className="m-4 h-24" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t('admin.plans_w.empty')} />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {q.data.map((p) => (
            <li key={p.id} className="flex items-center gap-1 pe-2">
              <button
                type="button"
                onClick={() => setEditing(p)}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-start hover:bg-bg-surface2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.title}</span>
                  <span className="block truncate text-xs text-text-secondary">
                    {p.days.map((d) => d.title).join(' · ')} · {f.dateTime(p.updatedAt)}
                  </span>
                </span>
                <Badge tone={p.isActive ? 'success' : 'neutral'}>
                  {p.isActive ? t('admin.plans_w.active') : t('admin.plans_w.inactive')}
                </Badge>
              </button>
              <IconButton label={t('admin.templates.save_as')} onClick={() => setAsTemplate(p)}>
                <Copy className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {asTemplate && (
        <PlanEditor
          existing={{ title: asTemplate.title, notes: asTemplate.notes, days: asTemplate.days }}
          template={{ id: null, shared: false }}
          onClose={() => setAsTemplate(null)}
        />
      )}
      {editing && (
        <PlanEditor
          memberId={memberId}
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

type Editable = Pick<WorkoutPlanDto, 'title' | 'notes' | 'days'> & {
  id?: string;
  isActive?: boolean;
};

/** Plan editor; with `template` it edits an F17-2 program template instead of a member's plan. */
export function PlanEditor({
  memberId,
  existing,
  onClose,
  template,
}: {
  memberId?: string;
  existing: Editable | null;
  onClose: () => void;
  template?: { id: string | null; shared: boolean };
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const lib = useQuery({
    queryKey: ['public-exercises', i18n.language],
    queryFn: () => api.get<ExerciseDto[]>('/public/exercises', { locale: i18n.language }),
    staleTime: 10 * 60_000,
  });
  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [active, setActive] = useState(existing?.isActive ?? true);
  const [shared, setShared] = useState(template?.shared ?? false);
  const [days, setDays] = useState<Day[]>(
    existing?.days.map((d) => ({
      title: d.title,
      items: d.items.map((i) => ({
        exerciseId: i.exerciseId,
        sets: i.sets,
        reps: i.reps,
        weightNote: i.weightNote,
        restS: i.restS,
        note: i.note,
      })),
    })) ?? [{ title: t('admin.plans_w.day_n', { n: 1 }), items: [] }],
  );
  const [dayIdx, setDayIdx] = useState(0);
  const day = days[dayIdx]!;
  const setDay = (patch: Partial<Day>) =>
    setDays(days.map((d, i) => (i === dayIdx ? { ...d, ...patch } : d)));
  const setItem = (i: number, patch: Partial<Item>) =>
    setDay({ items: day.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const move = (i: number, dir: -1 | 1) => {
    const items = [...day.items];
    const [x] = items.splice(i, 1);
    items.splice(i + dir, 0, x!);
    setDay({ items });
  };

  const save = useMutation({
    mutationFn: () => {
      if (template) {
        const body = { title, notes: notes || null, shared, days };
        return template.id
          ? api.put(`/admin/workout-templates/${template.id}`, body)
          : api.post('/admin/workout-templates', body);
      }
      const body = { title, notes: notes || null, isActive: active, days };
      return existing?.id
        ? api.put(`/admin/workout-plans/${existing.id}`, body)
        : api.post(`/admin/members/${memberId}/workout-plans`, body);
    },
    onSuccess: () => {
      if (template) void qc.invalidateQueries({ queryKey: ['workout-templates'] });
      else void qc.invalidateQueries({ queryKey: ['workout-plans', memberId] });
      toast.success(t(template ? 'admin.templates.saved' : 'admin.plans_w.saved'));
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        template
          ? template.id && existing
            ? existing.title
            : t('admin.templates.new')
          : existing?.id
            ? existing.title
            : t('admin.plans_w.new')
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={!title.trim()} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label={t('admin.plans_w.plan_title')} required>
            {(p) => (
              <Input
                {...p}
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={template ? shared : active}
              onChange={(e) => (template ? setShared : setActive)(e.target.checked)}
              className="size-4 accent-accent-500"
            />
            {t(template ? 'admin.templates.shared_label' : 'admin.plans_w.active_label')}
          </label>
        </div>
        <Field label={t('admin.plans_w.notes')}>
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              value={notes}
              maxLength={2000}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>

        <div className="flex flex-wrap items-center gap-1.5" role="tablist">
          {days.map((d, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === dayIdx}
              onClick={() => setDayIdx(i)}
              className={
                i === dayIdx
                  ? 'h-8 rounded-sm border border-accent-500 bg-accent-tint px-3 text-xs font-semibold'
                  : 'h-8 rounded-sm border border-border-subtle px-3 text-xs font-semibold text-text-secondary'
              }
            >
              {d.title || '-'}
            </button>
          ))}
          {days.length < 14 && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus className="size-4" />}
              onClick={() => {
                setDays([
                  ...days,
                  { title: t('admin.plans_w.day_n', { n: days.length + 1 }), items: [] },
                ]);
                setDayIdx(days.length);
              }}
            >
              {t('admin.plans_w.add_day')}
            </Button>
          )}
        </div>

        <div className="rounded-sm border border-border-subtle p-3">
          <div className="mb-3 flex items-end gap-2">
            <Field label={t('admin.plans_w.day_title')} className="flex-1">
              {(p) => (
                <Input
                  {...p}
                  value={day.title}
                  maxLength={80}
                  onChange={(e) => setDay({ title: e.target.value })}
                />
              )}
            </Field>
            {days.length > 1 && (
              <IconButton
                label={t('admin.plans_w.remove_day')}
                onClick={() => {
                  setDays(days.filter((_, i) => i !== dayIdx));
                  setDayIdx(Math.max(0, dayIdx - 1));
                }}
              >
                <Trash2 className="size-4" />
              </IconButton>
            )}
          </div>
          {lib.data && (
            <SuggestBar
              library={lib.data}
              onSuggest={(focus, items) =>
                setDay({
                  title: day.items.length ? day.title : t(`app.suggest.focus.${focus}`),
                  items: items.map((it) => ({ ...it, weightNote: null, note: null })),
                })
              }
            />
          )}
          {day.items.length === 0 && (
            <p className="mb-3 text-sm text-text-secondary">{t('admin.plans_w.rest_hint')}</p>
          )}
          <ul className="flex flex-col gap-2">
            {day.items.map((it, i) => (
              <li
                key={i}
                className="grid gap-2 rounded-sm bg-bg-surface2 p-2 sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]"
              >
                <Select
                  aria-label={t('admin.plans_w.exercise')}
                  value={it.exerciseId}
                  onChange={(e) => setItem(i, { exerciseId: e.target.value })}
                  className="h-9"
                >
                  {lib.data?.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label={t('admin.plans_w.sets')}
                  placeholder={t('admin.plans_w.sets')}
                  type="number"
                  min={1}
                  max={20}
                  value={it.sets ?? ''}
                  onChange={(e) =>
                    setItem(i, { sets: e.target.value ? Number(e.target.value) : null })
                  }
                  className="h-9"
                />
                <Input
                  aria-label={t('admin.plans_w.reps')}
                  placeholder={t('admin.plans_w.reps')}
                  value={it.reps ?? ''}
                  maxLength={20}
                  onChange={(e) => setItem(i, { reps: e.target.value })}
                  className="h-9"
                />
                <Input
                  aria-label={t('admin.plans_w.weight')}
                  placeholder={t('admin.plans_w.weight')}
                  value={it.weightNote ?? ''}
                  maxLength={40}
                  onChange={(e) => setItem(i, { weightNote: e.target.value })}
                  className="h-9"
                />
                <Input
                  aria-label={t('admin.plans_w.rest')}
                  placeholder={t('admin.plans_w.rest')}
                  type="number"
                  min={0}
                  max={900}
                  step={15}
                  value={it.restS ?? ''}
                  onChange={(e) =>
                    setItem(i, { restS: e.target.value ? Number(e.target.value) : null })
                  }
                  className="h-9"
                />
                <div className="flex">
                  <IconButton
                    label={t('admin.plans_w.up')}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </IconButton>
                  <IconButton
                    label={t('admin.plans_w.down')}
                    disabled={i === day.items.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </IconButton>
                  <IconButton
                    label={t('admin.plans_w.remove')}
                    onClick={() => setDay({ items: day.items.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
          {day.items.length < 40 && lib.data?.[0] && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              icon={<Plus className="size-4" />}
              onClick={() =>
                setDay({
                  items: [
                    ...day.items,
                    {
                      exerciseId: lib.data![0]!.id,
                      sets: 3,
                      reps: '8-10',
                      weightNote: null,
                      restS: 90,
                      note: null,
                    },
                  ],
                })
              }
            >
              {t('admin.plans_w.add_exercise')}
            </Button>
          )}
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

/** Rule-based starting point for a plan day (the trainer then adjusts it). No AI. */
function SuggestBar({
  library,
  onSuggest,
}: {
  library: ExerciseDto[];
  onSuggest: (focus: SuggestFocus, items: Omit<Item, 'weightNote' | 'note'>[]) => void;
}) {
  const { t } = useTranslation();
  const [focus, setFocus] = useState<SuggestFocus>('full_body');
  const [level, setLevel] = useState<SuggestLevel>('intermediate');
  const [minutes, setMinutes] = useState<number>(60);
  const [n, setN] = useState(0);
  return (
    <div className="mb-3 flex flex-wrap items-end gap-2 rounded-sm bg-bg-surface2 p-2">
      <Field label={t('admin.plans_w.suggest_focus')} className="min-w-32 flex-1">
        {(p) => (
          <Select {...p} value={focus} onChange={(e) => setFocus(e.target.value as SuggestFocus)}>
            {SUGGEST_FOCUSES.map((f) => (
              <option key={f} value={f}>
                {t(`app.suggest.focus.${f}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('admin.plans_w.suggest_level')} className="min-w-32 flex-1">
        {(p) => (
          <Select {...p} value={level} onChange={(e) => setLevel(e.target.value as SuggestLevel)}>
            {SUGGEST_LEVELS.map((l) => (
              <option key={l} value={l}>
                {t(`app.suggest.level.${l}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('admin.plans_w.suggest_minutes')} className="w-28">
        {(p) => (
          <Select
            {...p}
            value={String(minutes)}
            onChange={(e) => setMinutes(Number(e.target.value))}
          >
            {SUGGEST_MINUTES.map((m) => (
              <option key={m} value={m}>
                {t('app.suggest.minutes', { count: m })}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Button
        size="sm"
        variant="secondary"
        icon={<Sparkles className="size-4" />}
        onClick={() => {
          const s = suggestWorkout(library, { focus, level, minutes, seed: `${Date.now()}-${n}` });
          setN(n + 1);
          onSuggest(
            s.focus,
            s.items.map((i) => ({
              exerciseId: i.exerciseId,
              sets: i.sets,
              reps: i.reps,
              restS: i.restS,
            })),
          );
        }}
      >
        {t('admin.plans_w.suggest')}
      </Button>
    </div>
  );
}
