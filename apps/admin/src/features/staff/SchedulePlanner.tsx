import { APPOINTMENT_KINDS, type AgendaItemDto, type TrainerAdminDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MemberPicker, type PickedMember } from '@/components/MemberPicker';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useCan } from '@/lib/me';

const DAY = 86_400_000;
const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Belgrade' });
function mondayOf(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  return ymd(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY));
}
const addDays = (day: string, n: number) => ymd(new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY));
/** Europe/Belgrade wall time → ISO with the correct offset for that date. */
function belgradeIso(day: string, time: string) {
  const probe = new Date(`${day}T${time}:00Z`);
  const local = new Date(probe.toLocaleString('en-US', { timeZone: 'Europe/Belgrade' }));
  const offsetMin = Math.round((local.getTime() - probe.getTime()) / 60_000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
  const mm = String(Math.abs(offsetMin) % 60).padStart(2, '0');
  return `${day}T${time}:00${sign}${hh}:${mm}`;
}

/**
 * Week planner. `mine`: a trainer's own schedule (classes they lead + appointments).
 * Otherwise every trainer, with a trainer filter (front desk / managers).
 */
export function SchedulePlanner({ mine = false }: { mine?: boolean }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const qc = useQueryClient();
  const [week, setWeek] = useState(mondayOf(ymd(new Date())));
  const [trainerId, setTrainerId] = useState('');
  const [creating, setCreating] = useState<string | null>(null);
  const to = addDays(week, 6);
  const trainers = useQuery({
    queryKey: ['trainers-admin'],
    queryFn: () => api.get<TrainerAdminDto[]>('/admin/trainers'),
    enabled: !mine,
  });
  const q = useQuery({
    queryKey: ['agenda', mine, week, trainerId, i18n.language],
    queryFn: () =>
      api.get<AgendaItemDto[]>(mine ? '/admin/my-schedule' : '/admin/trainer-schedule', {
        from: week,
        to,
        locale: i18n.language,
        ...(trainerId && { trainerId }),
      }),
  });
  const status = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) =>
      api.post(`/admin/appointments/${id}/status`, { status: s }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['agenda'] }),
    onError: (e) => toast.error(t(e instanceof ApiError ? e.message : 'errors.internal')),
  });
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const today = ymd(new Date());
  const canCreate = mine || can('trainers.manage');
  const myTrainerError =
    mine && q.error instanceof ApiError && q.error.message === 'errors.trainer.not_linked';

  return (
    <>
      <PageHeader
        title={mine ? t('admin.schedule2.mine_title') : t('admin.schedule2.title')}
        subtitle={mine ? t('admin.schedule2.mine_subtitle') : t('admin.schedule2.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!mine && (
              <Select
                aria-label={t('admin.services.trainer')}
                value={trainerId}
                onChange={(e) => setTrainerId(e.target.value)}
                className="w-48"
              >
                <option value="">{t('admin.schedule2.all_trainers')}</option>
                {(trainers.data ?? [])
                  .filter((x) => !x.archivedAt)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.firstName} {x.lastName}
                    </option>
                  ))}
              </Select>
            )}
            <IconButton
              label={t('admin.schedule2.prev_week')}
              onClick={() => setWeek(addDays(week, -7))}
            >
              <ChevronLeft className="size-4" />
            </IconButton>
            <Button variant="secondary" size="sm" onClick={() => setWeek(mondayOf(today))}>
              {t('admin.schedule2.this_week')}
            </Button>
            <IconButton
              label={t('admin.schedule2.next_week')}
              onClick={() => setWeek(addDays(week, 7))}
            >
              <ChevronRight className="size-4" />
            </IconButton>
            {canCreate && !myTrainerError && (
              <Button
                size="sm"
                icon={<Plus className="size-4" />}
                onClick={() => setCreating(today >= week && today <= to ? today : week)}
              >
                {t('admin.schedule2.new')}
              </Button>
            )}
          </div>
        }
      />
      <p className="mb-3 text-sm text-text-secondary">
        {f.date(week)} - {f.date(to)}
      </p>
      {myTrainerError ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title={t('admin.schedule2.not_linked')}
            description={t('admin.schedule2.not_linked_hint')}
          />
        </Card>
      ) : q.isPending ? (
        <Skeleton className="h-96" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((d) => {
            const items = q.data.filter((x) => ymd(new Date(x.startsAt)) === d);
            return (
              <section
                key={d}
                className={`flex min-w-0 flex-col gap-2 rounded-sm border p-2 ${d === today ? 'border-accent-500' : 'border-border-subtle'}`}
              >
                <header className="flex items-center justify-between gap-1">
                  <h2 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    {new Intl.DateTimeFormat(i18n.language, {
                      weekday: 'short',
                      day: 'numeric',
                      timeZone: 'UTC',
                    }).format(new Date(`${d}T12:00:00Z`))}
                  </h2>
                  {canCreate && (
                    <IconButton label={t('admin.schedule2.new')} onClick={() => setCreating(d)}>
                      <Plus className="size-3.5" />
                    </IconButton>
                  )}
                </header>
                {items.length === 0 && (
                  <p className="text-xs text-text-muted">{t('admin.schedule2.free')}</p>
                )}
                {items.map((x) => (
                  <article
                    key={`${x.type}-${x.id}`}
                    className={`min-w-0 rounded-xs border-s-2 bg-bg-surface2 px-2 py-1.5 text-xs ${
                      x.type === 'class' ? 'border-accent-500' : 'border-status-info'
                    } ${x.status === 'cancelled' ? 'opacity-50 line-through' : ''}`}
                  >
                    <p className="font-semibold tabular-nums">
                      {f.time(x.startsAt)}-{f.time(x.endsAt)}
                    </p>
                    <p className="break-words font-semibold">
                      {x.type === 'class'
                        ? x.title
                        : x.title || t(`admin.schedule2.kinds.${x.kind}`)}
                    </p>
                    {x.memberName && (
                      <p className="break-words text-text-secondary">{x.memberName}</p>
                    )}
                    {!mine && x.trainerName && (
                      <p className="break-words text-text-secondary">{x.trainerName}</p>
                    )}
                    {x.type === 'class' && (
                      <p className="text-text-secondary">
                        {t('admin.schedule2.booked', { booked: x.booked, capacity: x.capacity })}
                      </p>
                    )}
                    {x.location && <p className="break-words text-text-secondary">{x.location}</p>}
                    {x.type === 'appointment' &&
                      x.status !== 'scheduled' &&
                      x.status !== 'cancelled' && (
                        <Badge tone={x.status === 'done' ? 'success' : 'warning'}>
                          {t(`admin.schedule2.statuses.${x.status}`)}
                        </Badge>
                      )}
                    {x.type === 'appointment' && x.status === 'scheduled' && canCreate && (
                      <div className="mt-1 flex gap-1">
                        <IconButton
                          label={t('admin.schedule2.mark_done')}
                          onClick={() => status.mutate({ id: x.id, s: 'done' })}
                        >
                          <Check className="size-3.5" />
                        </IconButton>
                        <IconButton
                          label={t('admin.schedule2.cancel')}
                          onClick={() => status.mutate({ id: x.id, s: 'cancelled' })}
                        >
                          <X className="size-3.5" />
                        </IconButton>
                      </div>
                    )}
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}
      {creating && (
        <AppointmentModal
          day={creating}
          mine={mine}
          trainers={(trainers.data ?? []).filter((x) => !x.archivedAt)}
          defaultTrainerId={trainerId}
          onClose={() => setCreating(null)}
        />
      )}
    </>
  );
}

function AppointmentModal({
  day,
  mine,
  trainers,
  defaultTrainerId,
  onClose,
}: {
  day: string;
  mine: boolean;
  trainers: TrainerAdminDto[];
  defaultTrainerId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const own = useQuery({
    queryKey: ['my-trainer-id'],
    queryFn: async () =>
      (await api.get<{ trainerId: string | null }>('/admin/me/trainer')).trainerId,
    enabled: mine,
  });
  const [trainerId, setTrainerId] = useState(defaultTrainerId);
  const [kind, setKind] = useState<(typeof APPOINTMENT_KINDS)[number]>('pt');
  const [date, setDate] = useState(day);
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState('60');
  const [member, setMember] = useState<PickedMember | null>(null);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const effectiveTrainer = mine ? own.data : trainerId;
  const save = useMutation({
    mutationFn: () =>
      api.post('/admin/appointments', {
        trainerId: effectiveTrainer,
        memberId: member?.id ?? null,
        kind,
        title,
        startsAt: belgradeIso(date, time),
        durationMin: Number(duration),
        location,
        note,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['agenda'] });
      toast.success(t('admin.schedule2.saved'));
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.schedule2.new')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!effectiveTrainer || !Number(duration)}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!mine && (
          <Field label={t('admin.services.trainer')} required>
            {(p) => (
              <Select {...p} value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
                <option value="">{t('admin.services.choose')}</option>
                {trainers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.firstName} {x.lastName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('admin.schedule2.kind')}>
            {(p) => (
              <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                {APPOINTMENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`admin.schedule2.kinds.${k}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('admin.schedule2.title_field')}>
            {(p) => (
              <Input
                {...p}
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('admin.schedule2.date')} required>
            {(p) => (
              <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('admin.schedule2.time')} required>
              {(p) => (
                <Input {...p} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              )}
            </Field>
            <Field label={t('admin.schedule2.duration')}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="numeric"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))}
                />
              )}
            </Field>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold">{t('admin.schedule2.member')}</p>
          <MemberPicker value={member} onChange={setMember} />
          <p className="mt-1 text-xs text-text-secondary">{t('admin.schedule2.member_hint')}</p>
        </div>
        <Field label={t('admin.schedule2.location')}>
          {(p) => (
            <Input
              {...p}
              value={location}
              maxLength={80}
              onChange={(e) => setLocation(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('admin.schedule2.note')}>
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
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
