import type {
  AbsenceDto,
  AbsenceKind,
  ClosureDto,
  ShiftRuleDto,
  ShiftTypeDto,
  ShiftWeekDto,
} from '@grit/validation';
import { ABSENCE_KINDS } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CalendarOff, Clock3, Pencil, Plus, Trash2, UserX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Table';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { clubToday, useFormat } from '@/lib/format';
import { useCan } from '@/lib/me';
import { PayrollTab } from './PayrollTab';
import {
  WEEKDAYS,
  daysLabel,
  mondayOf,
  useShiftPeople,
  useShiftTypes,
  useWeekdayNames,
} from './shared';
import { WeekNav, WeekTable } from './WeekTable';

type Tab = 'week' | 'rules' | 'absences' | 'closures' | 'types' | 'hours';

/** Smene: weekly table, who works when, absences, non-working days, shifts and work hours. */
export function ShiftsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const manage = can('shifts.manage');
  const [tab, setTab] = useState<Tab>('week');
  const tabs: Array<{ value: Tab; label: string; show: boolean }> = [
    { value: 'week', label: t('admin.shifts.tabs.week'), show: true },
    { value: 'rules', label: t('admin.shifts.tabs.rules'), show: manage },
    { value: 'absences', label: t('admin.shifts.tabs.absences'), show: manage },
    { value: 'closures', label: t('admin.shifts.tabs.closures'), show: manage },
    { value: 'types', label: t('admin.shifts.tabs.types'), show: manage },
    { value: 'hours', label: t('admin.shifts.tabs.hours'), show: can('payroll.read') },
  ];
  return (
    <>
      <PageHeader title={t('admin.shifts.title')} subtitle={t('admin.shifts.subtitle')} />
      <div className="mb-4 print:hidden">
        <Tabs value={tab} onChange={setTab} tabs={tabs.filter((x) => x.show)} />
      </div>
      {tab === 'week' && <WeekTab onPlan={manage ? () => setTab('rules') : undefined} />}
      {tab === 'rules' && <RulesTab />}
      {tab === 'absences' && <AbsencesTab />}
      {tab === 'closures' && <ClosuresTab />}
      {tab === 'types' && <TypesTab />}
      {tab === 'hours' && <PayrollTab />}
    </>
  );
}

function WeekTab({ onPlan }: { onPlan?: () => void }) {
  const { t } = useTranslation();
  const [monday, setMonday] = useState(mondayOf(clubToday()));
  const q = useQuery({
    queryKey: ['shifts', 'week', monday],
    queryFn: () => api.get<ShiftWeekDto>('/admin/shifts/week', { start: monday }),
  });
  return (
    <div className="flex flex-col gap-4">
      <WeekNav monday={monday} onChange={setMonday} print />
      {q.isPending ? (
        <Skeleton className="h-80" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.shiftTypes.length === 0 ? (
        <Card>
          <EmptyState
            icon={Clock3}
            title={t('admin.shifts.no_types')}
            description={t('admin.shifts.no_types_hint')}
          />
        </Card>
      ) : (
        <>
          <WeekTable week={q.data} />
          {q.data.assignments.length === 0 && (
            <p className="text-sm text-text-secondary">
              {t('admin.shifts.week_empty')}{' '}
              {onPlan && (
                <button type="button" className="font-semibold text-accent-400" onClick={onPlan}>
                  {t('admin.shifts.plan_now')}
                </button>
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Rules: who works which shift, on which days, from when ─────────────────────

function RulesTab() {
  const { t } = useTranslation();
  const f = useFormat();
  const wd = useWeekdayNames();
  const qc = useQueryClient();
  const types = useShiftTypes();
  const rules = useQuery({
    queryKey: ['shifts', 'rules'],
    queryFn: () => api.get<ShiftRuleDto[]>('/admin/shifts/rules'),
  });
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/shifts/rules/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shifts'] });
      toast.success(t('admin.shifts.removed'));
    },
  });
  const typeOf = new Map((types.data ?? []).map((s) => [s.id, s]));
  const today = clubToday();
  const byPerson = new Map<string, ShiftRuleDto[]>();
  for (const r of rules.data ?? []) byPerson.set(r.userId, [...(byPerson.get(r.userId) ?? []), r]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-text-secondary">{t('admin.shifts.rules_hint')}</p>
        <Button
          icon={<Plus className="size-4" />}
          disabled={!types.data?.length}
          onClick={() => setOpen(true)}
        >
          {t('admin.shifts.add_rule')}
        </Button>
      </div>
      {!types.data?.length && types.isSuccess && (
        <p className="text-sm text-status-warning">{t('admin.shifts.no_types_hint')}</p>
      )}
      {rules.isPending ? (
        <Skeleton className="h-60" />
      ) : rules.isError ? (
        <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />
      ) : byPerson.size === 0 ? (
        <Card>
          <EmptyState icon={CalendarDays} title={t('admin.shifts.rules_empty')} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {[...byPerson.entries()].map(([userId, list]) => (
            <Card key={userId} className="p-4">
              <p className="mb-3 font-semibold">{list[0]!.userName}</p>
              <ul className="flex flex-col gap-2">
                {list.map((r) => {
                  const s = typeOf.get(r.shiftTypeId);
                  const ended = r.validUntil !== null && r.validUntil < today;
                  return (
                    <li
                      key={r.id}
                      className={cn('flex items-start gap-3 text-sm', ended && 'opacity-50')}
                    >
                      <span
                        className="mt-1 size-3 shrink-0 rounded-full"
                        style={{ background: s?.color ?? '#888' }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold">{s?.name ?? '-'}</span>
                        <span className="text-text-secondary">
                          {' · '}
                          {daysLabel(r.weekdays, wd.short)}
                        </span>
                        <span className="block text-xs text-text-secondary">
                          {r.validUntil
                            ? t('admin.shifts.period_until', {
                                from: f.date(r.validFrom),
                                to: f.date(r.validUntil),
                              })
                            : t('admin.shifts.period_from', { from: f.date(r.validFrom) })}
                          {r.note ? ` · ${r.note}` : ''}
                        </span>
                      </span>
                      <IconButton
                        label={t('admin.shifts.remove_rule')}
                        onClick={() => remove.mutate(r.id)}
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
      {open && types.data && <RuleModal types={types.data} onClose={() => setOpen(false)} />}
    </div>
  );
}

type Line = { shiftTypeId: string; weekdays: number[] };

function RuleModal({ types, onClose }: { types: ShiftTypeDto[]; onClose: () => void }) {
  const { t } = useTranslation();
  const wd = useWeekdayNames();
  const qc = useQueryClient();
  const people = useShiftPeople();
  const active = types.filter((s) => s.isActive);
  const [userId, setUserId] = useState('');
  const [validFrom, setValidFrom] = useState(mondayOf(clubToday()));
  const [validUntil, setValidUntil] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([
    { shiftTypeId: active[0]?.id ?? '', weekdays: [1, 2, 3, 4, 5] },
  ]);
  const used = (except: number) =>
    new Set(lines.flatMap((l, i) => (i === except ? [] : l.weekdays)));
  const setLine = (i: number, fn: (l: Line) => Line) =>
    setLines((ls) => ls.map((l, j) => (j === i ? fn(l) : l)));
  const toggle = (i: number, d: number) =>
    setLine(i, (l) => ({
      ...l,
      weekdays: l.weekdays.includes(d) ? l.weekdays.filter((x) => x !== d) : [...l.weekdays, d],
    }));
  const preset = (i: number, days: number[]) =>
    setLine(i, (l) => ({ ...l, weekdays: days.filter((d) => !used(i).has(d)) }));

  const save = useMutation({
    mutationFn: () =>
      api.post('/admin/shifts/rules', {
        userId,
        validFrom,
        validUntil: validUntil || null,
        note,
        lines: lines.filter((l) => l.weekdays.length),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shifts'] });
      toast.success(t('admin.shifts.rule_saved'));
      onClose();
    },
  });
  const valid = userId && validFrom && lines.some((l) => l.weekdays.length && l.shiftTypeId);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('admin.shifts.add_rule')}
      description={t('admin.shifts.rule_modal_hint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('admin.shifts.employee')} required className="sm:col-span-3">
            {(p) => (
              <Select {...p} value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">{t('admin.shifts.pick_employee')}</option>
                {(people.data ?? []).map((x) => (
                  <option key={x.userId} value={x.userId}>
                    {x.name} (
                    {x.roles.map((r) => t(`admin.roles.${r}`, { defaultValue: r })).join(', ')})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('admin.shifts.valid_from')} required>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('admin.shifts.valid_until')} hint={t('admin.shifts.valid_until_hint')}>
            {(p) => (
              <Input
                {...p}
                type="date"
                min={validFrom}
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('admin.fields.note')}>
            {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
        </div>

        {lines.map((l, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-md border border-border-subtle p-3">
            <div className="flex items-end gap-2">
              <Field label={t('admin.shifts.shift')} className="flex-1">
                {(p) => (
                  <Select
                    {...p}
                    value={l.shiftTypeId}
                    onChange={(e) => setLine(i, (x) => ({ ...x, shiftTypeId: e.target.value }))}
                  >
                    {active.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.startsAt} - {s.endsAt})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {lines.length > 1 && (
                <IconButton
                  label={t('admin.shifts.remove_line')}
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              )}
            </div>
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label={t('admin.shifts.days')}
            >
              {WEEKDAYS.map((d) => {
                const taken = used(i).has(d);
                const on = l.weekdays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    disabled={taken}
                    onClick={() => toggle(i, d)}
                    className={cn(
                      'h-9 min-w-12 rounded-sm border px-2 text-sm font-semibold',
                      on
                        ? 'border-accent-500 bg-accent-tint text-text-primary'
                        : 'border-border-subtle text-text-secondary',
                      taken && 'cursor-not-allowed opacity-30',
                    )}
                  >
                    {wd.short(d)}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {(
                [
                  ['mon_fri', [1, 2, 3, 4, 5]],
                  ['weekend', [6, 7]],
                  ['every_day', [1, 2, 3, 4, 5, 6, 7]],
                ] as const
              ).map(([key, days]) => (
                <button
                  key={key}
                  type="button"
                  className="rounded-sm bg-bg-surface2 px-2 py-1 text-text-secondary hover:text-text-primary"
                  onClick={() => preset(i, [...days])}
                >
                  {t(`admin.shifts.presets.${key}`)}
                </button>
              ))}
            </div>
          </div>
        ))}
        {lines.length < 4 && used(-1).size < 7 && (
          <Button
            variant="secondary"
            icon={<Plus className="size-4" />}
            onClick={() =>
              setLines((ls) => [
                ...ls,
                {
                  shiftTypeId:
                    active.find((s) => !ls.some((x) => x.shiftTypeId === s.id))?.id ??
                    active[0]!.id,
                  weekdays: [],
                },
              ])
            }
          >
            {t('admin.shifts.add_line')}
          </Button>
        )}
        {save.error && (
          <p role="alert" className="text-sm text-status-danger">
            {t(save.error instanceof ApiError ? save.error.message : 'errors.internal')}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ── Absences ──────────────────────────────────────────────────────────────────

const KIND_TONE: Record<AbsenceKind, 'info' | 'danger' | 'neutral' | 'success' | 'warning'> = {
  vacation: 'success',
  sick: 'danger',
  day_off: 'info',
  holiday: 'warning',
  other: 'neutral',
};

function AbsencesTab() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const people = useShiftPeople();
  const q = useQuery({
    queryKey: ['shifts', 'absences'],
    queryFn: () => api.get<AbsenceDto[]>('/admin/shifts/absences'),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    userId: '',
    kind: 'vacation' as AbsenceKind,
    startsOn: clubToday(),
    endsOn: clubToday(),
    note: '',
  });
  const save = useMutation({
    mutationFn: () => api.post('/admin/shifts/absences', form),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shifts'] });
      toast.success(t('admin.shifts.absence_saved'));
      setOpen(false);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/shifts/absences/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-text-secondary">{t('admin.shifts.absences_hint')}</p>
        <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
          {t('admin.shifts.add_absence')}
        </Button>
      </div>
      {q.isPending ? (
        <Skeleton className="h-40" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState icon={UserX} title={t('admin.shifts.absences_empty')} />
        </Card>
      ) : (
        <Card className="divide-y divide-border-subtle">
          {q.data.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="min-w-40 font-semibold">{a.userName}</span>
              <Badge tone={KIND_TONE[a.kind]}>{t(`admin.shifts.kinds.${a.kind}`)}</Badge>
              <span className="text-text-secondary">
                {a.startsOn === a.endsOn
                  ? f.date(a.startsOn)
                  : `${f.date(a.startsOn)} - ${f.date(a.endsOn)}`}
              </span>
              {a.note && <span className="text-text-secondary">· {a.note}</span>}
              <span className="ms-auto">
                <IconButton label={t('admin.shifts.remove')} onClick={() => remove.mutate(a.id)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </span>
            </div>
          ))}
        </Card>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('admin.shifts.add_absence')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={save.isPending}
              disabled={!form.userId || form.endsOn < form.startsOn}
              onClick={() => save.mutate()}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('admin.shifts.employee')} required className="sm:col-span-2">
            {(p) => (
              <Select
                {...p}
                value={form.userId}
                onChange={(e) => setForm({ ...form, userId: e.target.value })}
              >
                <option value="">{t('admin.shifts.pick_employee')}</option>
                {(people.data ?? []).map((x) => (
                  <option key={x.userId} value={x.userId}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('admin.shifts.kind')} className="sm:col-span-2">
            {(p) => (
              <Select
                {...p}
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as AbsenceKind })}
              >
                {ABSENCE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`admin.shifts.kinds.${k}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('admin.fields.from')}>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={form.startsOn}
                onChange={(e) =>
                  setForm({
                    ...form,
                    startsOn: e.target.value,
                    endsOn: form.endsOn < e.target.value ? e.target.value : form.endsOn,
                  })
                }
              />
            )}
          </Field>
          <Field label={t('admin.fields.to')}>
            {(p) => (
              <Input
                {...p}
                type="date"
                min={form.startsOn}
                value={form.endsOn}
                onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('admin.fields.note')} className="sm:col-span-2">
            {(p) => (
              <Input
                {...p}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            )}
          </Field>
          {save.error && (
            <p role="alert" className="text-sm text-status-danger sm:col-span-2">
              {t(save.error instanceof ApiError ? save.error.message : 'errors.internal')}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ── Holidays and non-working days ─────────────────────────────────────────────

function ClosuresTab() {
  const { t } = useTranslation();
  const f = useFormat();
  const wd = useWeekdayNames();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['shifts', 'closures'],
    queryFn: () => api.get<ClosureDto[]>('/admin/shifts/closures'),
  });
  const [form, setForm] = useState({ day: clubToday(), name: '', isClosed: true });
  const save = useMutation({
    mutationFn: () => api.post('/admin/shifts/closures', form),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shifts'] });
      toast.success(t('admin.shifts.closure_saved'));
      setForm({ ...form, name: '' });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/shifts/closures/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
  const weekday = (d: string) => ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">{t('admin.shifts.closures_hint')}</p>
        {q.isPending ? (
          <Skeleton className="h-40" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.length === 0 ? (
          <Card>
            <EmptyState icon={CalendarOff} title={t('admin.shifts.closures_empty')} />
          </Card>
        ) : (
          <Card className="divide-y divide-border-subtle">
            {q.data.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-36 font-semibold">
                  {wd.short(weekday(c.day))} {f.date(c.day)}
                </span>
                <span className="flex-1">{c.name}</span>
                <Badge tone={c.isClosed ? 'warning' : 'info'}>
                  {t(c.isClosed ? 'admin.shifts.closed' : 'admin.shifts.open_note')}
                </Badge>
                <IconButton label={t('admin.shifts.remove')} onClick={() => remove.mutate(c.id)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            ))}
          </Card>
        )}
      </div>
      <Card className="flex h-fit flex-col gap-3 p-4">
        <p className="font-semibold">{t('admin.shifts.add_closure')}</p>
        <Field label={t('admin.fields.date')} required>
          {(p) => (
            <Input
              {...p}
              type="date"
              value={form.day}
              onChange={(e) => setForm({ ...form, day: e.target.value })}
            />
          )}
        </Field>
        <Field label={t('admin.fields.name')} required hint={t('admin.shifts.closure_name_hint')}>
          {(p) => (
            <Input
              {...p}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          )}
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-accent-500)]"
            checked={form.isClosed}
            onChange={(e) => setForm({ ...form, isClosed: e.target.checked })}
          />
          {t('admin.shifts.is_closed')}
        </label>
        <Button
          icon={<Plus className="size-4" />}
          loading={save.isPending}
          disabled={!form.day || !form.name.trim()}
          onClick={() => save.mutate()}
        >
          {t('common.save')}
        </Button>
      </Card>
    </div>
  );
}

// ── Shift types ───────────────────────────────────────────────────────────────

const SWATCHES = ['#2E7D32', '#1565C0', '#F9A825', '#6A1B9A', '#C62828', '#00838F', '#E54E26'];

function TypesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const types = useShiftTypes();
  const [editing, setEditing] = useState<ShiftTypeDto | 'new' | null>(null);
  const presets = useMutation({
    mutationFn: async () => {
      const list = [
        {
          name: t('admin.shifts.preset_names.first'),
          startsAt: '07:00',
          endsAt: '15:00',
          color: SWATCHES[0],
        },
        {
          name: t('admin.shifts.preset_names.second'),
          startsAt: '15:00',
          endsAt: '23:00',
          color: SWATCHES[1],
        },
        {
          name: t('admin.shifts.preset_names.middle'),
          startsAt: '11:00',
          endsAt: '19:00',
          color: SWATCHES[2],
        },
      ];
      for (const [i, s] of list.entries())
        await api.post('/admin/shifts/types', { ...s, sortOrder: i * 10 });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/shifts/types/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-text-secondary">{t('admin.shifts.types_hint')}</p>
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
          {t('admin.shifts.new_type')}
        </Button>
      </div>
      {types.isPending ? (
        <Skeleton className="h-40" />
      ) : types.isError ? (
        <ErrorState error={types.error} onRetry={() => void types.refetch()} />
      ) : types.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Clock3}
            title={t('admin.shifts.no_types')}
            description={t('admin.shifts.presets_hint')}
            action={
              <Button loading={presets.isPending} onClick={() => presets.mutate()}>
                {t('admin.shifts.add_presets')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {types.data.map((s) => (
            <div
              key={s.id}
              className={cn(
                'flex items-center gap-3 rounded-md border border-border-subtle bg-bg-surface p-4',
                !s.isActive && 'opacity-50',
              )}
              style={{ boxShadow: `inset 4px 0 0 ${s.color}` }}
            >
              <span className="flex-1">
                <span className="block font-semibold">{s.name}</span>
                <span className="text-sm text-text-secondary">
                  {s.startsAt} - {s.endsAt}
                </span>
              </span>
              <IconButton label={t('common.edit')} onClick={() => setEditing(s)}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton
                label={t('admin.shifts.remove')}
                onClick={() =>
                  window.confirm(t('admin.shifts.delete_type_confirm')) && remove.mutate(s.id)
                }
              >
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <TypeModal value={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function TypeModal({ value, onClose }: { value: ShiftTypeDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: value?.name ?? '',
    startsAt: value?.startsAt ?? '07:00',
    endsAt: value?.endsAt ?? '15:00',
    color: value?.color ?? SWATCHES[0]!,
    sortOrder: value?.sortOrder ?? 0,
    isActive: value?.isActive ?? true,
  });
  const save = useMutation({
    mutationFn: () =>
      value
        ? api.put(`/admin/shifts/types/${value.id}`, form)
        : api.post('/admin/shifts/types', form),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shifts'] });
      toast.success(t('admin.shifts.type_saved'));
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={value ? value.name : t('admin.shifts.new_type')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            disabled={!form.name.trim() || form.startsAt === form.endsAt}
            onClick={() => save.mutate()}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t('admin.fields.name')}
          required
          className="col-span-2"
          hint={t('admin.shifts.type_name_hint')}
        >
          {(p) => (
            <Input
              {...p}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          )}
        </Field>
        <Field label={t('admin.shifts.starts')}>
          {(p) => (
            <Input
              {...p}
              type="time"
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />
          )}
        </Field>
        <Field label={t('admin.shifts.ends')}>
          {(p) => (
            <Input
              {...p}
              type="time"
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            />
          )}
        </Field>
        <div className="col-span-2 flex flex-col gap-2">
          <span className="text-xs font-semibold tracking-wide text-text-secondary uppercase">
            {t('admin.shifts.color')}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={form.color.toUpperCase() === c}
                onClick={() => setForm({ ...form, color: c })}
                className={cn(
                  'size-8 rounded-full border-2',
                  form.color.toUpperCase() === c ? 'border-text-primary' : 'border-transparent',
                )}
                style={{ background: c }}
              />
            ))}
            <input
              type="color"
              aria-label={t('admin.shifts.color')}
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value.toUpperCase() })}
              className="h-8 w-10 cursor-pointer rounded-sm border border-border-subtle bg-transparent"
            />
          </div>
        </div>
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-accent-500)]"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          {t('admin.shifts.type_active')}
        </label>
        {save.error && (
          <p role="alert" className="col-span-2 text-sm text-status-danger">
            {t(save.error instanceof ApiError ? save.error.message : 'errors.internal')}
          </p>
        )}
      </div>
    </Modal>
  );
}
