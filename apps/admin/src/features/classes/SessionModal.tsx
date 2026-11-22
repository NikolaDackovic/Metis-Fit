import type { ClassAdminDto, MemberDto, RosterDto, RosterEntryDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Search, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ReasonDialog } from '@/components/ui/ReasonDialog';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useCan } from '@/lib/me';
import {
  clubDateTimeToIso,
  clubDay,
  useClassFormat,
  useClassTypes,
  useTrainers,
} from './classes-utils';

const statusTone = {
  confirmed: 'accent',
  waitlisted: 'warning',
  attended: 'success',
  no_show: 'danger',
  cancelled: 'neutral',
} as const;

const errorText = (t: (k: string) => string, e: unknown) =>
  t(e instanceof ApiError ? e.message : 'errors.internal');

export function SessionModal({ classId, onClose }: { classId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const fmt = useClassFormat();
  const can = useCan();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const q = useQuery({
    queryKey: ['roster', classId],
    queryFn: () => api.get<RosterDto>(`/admin/classes/${classId}/roster`),
  });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['roster', classId] });
    void qc.invalidateQueries({ queryKey: ['classes'] });
  };
  const cancelClass = useMutation({
    mutationFn: (reason: string) => api.post(`/admin/classes/${classId}/cancel`, { reason }),
    onSuccess: () => {
      invalidate();
      setCancelling(false);
      toast.success(t('admin.classes.session_cancelled'));
    },
  });

  const c = q.data?.class;
  if (editing && c) return <ClassFormModal existing={c} onClose={() => setEditing(false)} />;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={c ? c.typeName : t('admin.classes.session')}
      description={
        c
          ? `${fmt.dayLong(clubDay(c.startsAt))} · ${fmt.time(c.startsAt)}-${fmt.time(c.endsAt)}`
          : undefined
      }
      footer={
        c && c.status === 'scheduled' && can('classes.manage') ? (
          <>
            <Button variant="danger" onClick={() => setCancelling(true)}>
              {t('admin.classes.cancel_session')}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t('common.edit')}
            </Button>
          </>
        ) : undefined
      }
    >
      {q.isPending ? (
        <Skeleton className="h-64" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="flex flex-col gap-5">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label={t('admin.classes.trainer')} value={c!.trainer?.name ?? '-'} />
            <Stat
              label={t('admin.classes.booked')}
              value={t('admin.classes.booked_of', { booked: c!.booked, capacity: c!.capacity })}
            />
            <Stat label={t('admin.classes.waitlist')} value={String(c!.waitlisted)} />
            <Stat label={t('admin.classes.room')} value={c!.roomName ?? c!.roomKey ?? '-'} />
          </dl>
          {c!.status === 'cancelled' && (
            <p className="rounded-sm border border-status-danger/40 bg-status-danger/10 p-3 text-sm text-status-danger">
              {t('admin.classes.cancelled_reason', {
                reason:
                  c!.cancelledReason === 'series_ended'
                    ? t('admin.classes.series_ended')
                    : c!.cancelledReason,
              })}
            </p>
          )}
          {c!.note && <p className="text-sm text-text-secondary">{c!.note}</p>}
          <Roster data={q.data} onChange={invalidate} />
          {c!.status === 'scheduled' && new Date(c!.endsAt) > new Date() && (
            <AddMember classId={classId} onAdded={invalidate} />
          )}
        </div>
      )}
      <ReasonDialog
        open={cancelling}
        title={t('admin.classes.cancel_session')}
        consequence={t('admin.classes.cancel_consequence', { count: c?.booked ?? 0 })}
        confirmLabel={t('admin.classes.cancel_session')}
        onCancel={() => setCancelling(false)}
        onConfirm={(reason) => cancelClass.mutate(reason)}
        loading={cancelClass.isPending}
        error={cancelClass.error instanceof ApiError ? cancelClass.error.message : null}
      />
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm bg-bg-surface2 p-3">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="tabular mt-0.5 truncate font-semibold">{value}</dd>
    </div>
  );
}

function Roster({ data, onChange }: { data: RosterDto; onChange: () => void }) {
  const { t } = useTranslation();
  const [showCancelled, setShowCancelled] = useState(false);
  const started = new Date(data.class.startsAt).getTime() - 30 * 60_000 <= Date.now();
  const live = data.entries.filter((e) => e.status !== 'cancelled');
  const cancelled = data.entries.filter((e) => e.status === 'cancelled');
  const order = { attended: 0, no_show: 0, confirmed: 0, waitlisted: 1, cancelled: 2 };
  const sorted = [...live].sort(
    (a, b) =>
      order[a.status] - order[b.status] || (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0),
  );
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        {t('admin.classes.roster')}
      </h3>
      {live.length === 0 ? (
        <p className="text-sm text-text-secondary">{t('admin.classes.roster_empty')}</p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-sm border border-border-subtle">
          {sorted.map((e) => (
            <RosterRow
              key={e.bookingId}
              e={e}
              canMark={started && data.class.status === 'scheduled'}
              onChange={onChange}
            />
          ))}
        </ul>
      )}
      {cancelled.length > 0 && (
        <button
          type="button"
          className="mt-2 text-xs font-semibold text-text-secondary underline-offset-2 hover:underline"
          onClick={() => setShowCancelled((v) => !v)}
        >
          {t('admin.classes.show_cancelled', { count: cancelled.length })}
        </button>
      )}
      {showCancelled && (
        <ul className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
          {cancelled.map((e) => (
            <li key={e.bookingId}>
              {e.firstName} {e.lastName}
              {e.lateCancel && ` · ${t('admin.classes.late_cancel')}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RosterRow({
  e,
  canMark,
  onChange,
}: {
  e: RosterEntryDto;
  canMark: boolean;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const mark = useMutation({
    mutationFn: (status: 'attended' | 'no_show' | 'confirmed') =>
      api.post(`/admin/bookings/${e.bookingId}/attendance`, { status }),
    onSuccess: onChange,
    onError: (err) => toast.error(errorText(t, err)),
  });
  const cancel = useMutation({
    mutationFn: () => api.post(`/admin/bookings/${e.bookingId}/cancel`),
    onSuccess: () => {
      onChange();
      toast.success(t('admin.classes.booking_cancelled'));
    },
    onError: (err) => toast.error(errorText(t, err)),
  });
  const marked = e.status === 'attended' || e.status === 'no_show';
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {e.firstName} {e.lastName}
        </p>
        <p className="tabular text-xs text-text-secondary">
          {e.memberNumber}
          {e.source === 'staff' && ` · ${t('admin.classes.source_staff')}`}
        </p>
      </div>
      <Badge tone={statusTone[e.status]}>
        {e.status === 'waitlisted'
          ? t('admin.classes.waitlist_position', { position: e.waitlistPosition })
          : t(`admin.classes.booking_status.${e.status}`)}
      </Badge>
      <div className="flex gap-1.5">
        {canMark && e.status !== 'waitlisted' && (
          <>
            <Button
              size="sm"
              variant={e.status === 'attended' ? 'primary' : 'secondary'}
              icon={<Check className="size-4" />}
              aria-pressed={e.status === 'attended'}
              loading={mark.isPending && mark.variables === 'attended'}
              onClick={() => mark.mutate(e.status === 'attended' ? 'confirmed' : 'attended')}
            >
              {t('admin.classes.mark_attended')}
            </Button>
            <Button
              size="sm"
              variant={e.status === 'no_show' ? 'danger' : 'ghost'}
              icon={<X className="size-4" />}
              aria-pressed={e.status === 'no_show'}
              loading={mark.isPending && mark.variables === 'no_show'}
              onClick={() => mark.mutate(e.status === 'no_show' ? 'confirmed' : 'no_show')}
            >
              {t('admin.classes.mark_no_show')}
            </Button>
          </>
        )}
        {!marked && (
          <Button
            size="sm"
            variant="ghost"
            loading={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {t('admin.classes.remove')}
          </Button>
        )}
      </div>
    </li>
  );
}

function AddMember({ classId, onAdded }: { classId: string; onAdded: () => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const term = q.trim();
  const search = useQuery({
    queryKey: ['members', 'search', term],
    queryFn: () => api.get<MemberDto[]>('/admin/members', { q: term, pageSize: 6 }),
    enabled: term.length >= 2,
  });
  const add = useMutation({
    mutationFn: (memberId: string) => api.post(`/admin/classes/${classId}/bookings`, { memberId }),
    onSuccess: () => {
      setQ('');
      onAdded();
      toast.success(t('admin.classes.member_added'));
    },
    onError: (err) => toast.error(errorText(t, err)),
  });
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        <UserPlus className="size-3.5" aria-hidden />
        {t('admin.classes.add_member')}
      </h3>
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('admin.classes.search_member')}
          aria-label={t('admin.classes.search_member')}
          className="ps-9"
        />
      </div>
      {term.length >= 2 && (search.data?.length ?? 0) > 0 && (
        <ul className="mt-2 divide-y divide-border-subtle rounded-sm border border-border-subtle">
          {search.data!.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-semibold">
                  {m.firstName} {m.lastName}
                </span>{' '}
                <span className="tabular text-text-secondary">{m.memberNumber}</span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                loading={add.isPending && add.variables === m.id}
                onClick={() => add.mutate(m.id)}
              >
                {t('admin.classes.book_in')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {term.length >= 2 && search.data?.length === 0 && (
        <p className="mt-2 text-sm text-text-secondary">{t('admin.classes.no_member_found')}</p>
      )}
    </section>
  );
}

/** Create a one-off session (date given) or edit an existing one. */
export function ClassFormModal({
  date,
  existing,
  onClose,
}: {
  date?: string;
  existing?: ClassAdminDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useClassFormat();
  const qc = useQueryClient();
  const types = useClassTypes();
  const trainers = useTrainers();
  const startTime = existing ? fmt.time(existing.startsAt) : '19:00';
  const [typeId, setTypeId] = useState(existing?.classTypeId ?? '');
  const [day, setDay] = useState(existing ? clubDay(existing.startsAt) : (date ?? ''));
  const [time, setTime] = useState(startTime);
  const [duration, setDuration] = useState(
    existing
      ? String((Date.parse(existing.endsAt) - Date.parse(existing.startsAt)) / 60_000)
      : '60',
  );
  const [capacity, setCapacity] = useState(String(existing?.capacity ?? ''));
  const [trainerId, setTrainerId] = useState(existing?.trainer?.id ?? '');
  const [roomKey, setRoomKey] = useState(existing?.roomKey ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const type = types.data?.find((x) => x.id === typeId);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        trainerId: trainerId || null,
        capacity: Number(capacity || type?.defaultCapacity),
        durationMin: Number(duration),
        roomKey: roomKey || null,
        note: note || null,
        ...(!existing?.seriesId && { startsAt: clubDateTimeToIso(day, time) }),
      };
      return existing
        ? api.patch(`/admin/classes/${existing.id}`, body)
        : api.post('/admin/classes', { ...body, classTypeId: typeId });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['classes'] });
      void qc.invalidateQueries({ queryKey: ['roster'] });
      toast.success(t('admin.classes.saved'));
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? t('admin.classes.edit_session') : t('admin.classes.new_session')}
      description={existing?.seriesId ? t('admin.classes.series_session_hint') : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            disabled={(!existing && !typeId) || !day || !time}
            onClick={() => save.mutate()}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!existing && (
          <Field label={t('admin.classes.type')} required className="sm:col-span-2">
            {(p) => (
              <Select
                {...p}
                value={typeId}
                onChange={(e) => {
                  setTypeId(e.target.value);
                  const ty = types.data?.find((x) => x.id === e.target.value);
                  if (ty) {
                    setDuration(String(ty.defaultDurationMin));
                    setCapacity(String(ty.defaultCapacity));
                    if (!roomKey) setRoomKey(ty.zone);
                  }
                }}
              >
                <option value="">-</option>
                {types.data
                  ?.filter((x) => x.isActive)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        )}
        <Field label={t('admin.classes.date')} required>
          {(p) => (
            <Input
              {...p}
              type="date"
              value={day}
              disabled={!!existing?.seriesId}
              onChange={(e) => setDay(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('admin.classes.start')} required>
          {(p) => (
            <Input
              {...p}
              type="time"
              value={time}
              disabled={!!existing?.seriesId}
              onChange={(e) => setTime(e.target.value)}
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
              placeholder={type ? String(type.defaultCapacity) : undefined}
              onChange={(e) => setCapacity(e.target.value)}
            />
          )}
        </Field>
        <TrainerSelect value={trainerId} onChange={setTrainerId} trainers={trainers.data} />
        <Field label={t('admin.classes.room_key')} hint={t('admin.classes.room_hint')}>
          {(p) => (
            <Input
              {...p}
              value={roomKey}
              onChange={(e) => setRoomKey(e.target.value.toLowerCase())}
            />
          )}
        </Field>
        <Field
          label={t('admin.classes.note')}
          hint={t('admin.classes.note_hint')}
          className="sm:col-span-2"
        >
          {(p) => (
            <Textarea
              {...p}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
        {save.error && (
          <p role="alert" className="text-sm text-status-danger sm:col-span-2">
            {errorText(t, save.error)}
          </p>
        )}
      </div>
    </Modal>
  );
}

export function TrainerSelect({
  value,
  onChange,
  trainers,
}: {
  value: string;
  onChange: (v: string) => void;
  trainers?: Array<{ id: string; firstName: string; lastName: string; archivedAt: string | null }>;
}) {
  const { t } = useTranslation();
  return (
    <Field label={t('admin.classes.trainer')}>
      {(p) => (
        <Select {...p} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('admin.classes.no_trainer')}</option>
          {trainers
            ?.filter((x) => !x.archivedAt || x.id === value)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.firstName} {x.lastName}
              </option>
            ))}
        </Select>
      )}
    </Field>
  );
}
