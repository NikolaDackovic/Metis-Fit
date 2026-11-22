import type { SeriesDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, EmptyState, ErrorState, TableSkeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { addDays, clubToday, useFormat } from '@/lib/format';
import { useClassFormat, useClassTypes, useTrainers } from './classes-utils';
import { TrainerSelect } from './SessionModal';

/** Weekly timetable: each row generates sessions ahead automatically. */
export function SeriesTab() {
  const { t, i18n } = useTranslation();
  const fmt = useClassFormat();
  const f = useFormat();
  const [editing, setEditing] = useState<SeriesDto | 'new' | null>(null);
  const q = useQuery({
    queryKey: ['class-series', i18n.language],
    queryFn: () => api.get<SeriesDto[]>('/admin/class-series'),
  });
  const today = clubToday();
  const ended = (s: SeriesDto) => s.validUntil !== null && s.validUntil < today;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-4">
        <p className="max-w-xl text-sm text-text-secondary">{t('admin.classes.series_intro')}</p>
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
          {t('admin.classes.new_series')}
        </Button>
      </div>
      {q.isPending ? (
        <TableSkeleton />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState icon={CalendarRange} title={t('admin.classes.series_empty')} />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {q.data.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setEditing(s)}
                className={cn(
                  'flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-start hover:bg-bg-surface2',
                  ended(s) && 'opacity-50',
                )}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: s.color }}
                  aria-hidden
                />
                <span className="w-32 font-semibold capitalize">{fmt.weekday(s.weekday)}</span>
                <span className="tabular w-14 font-semibold">{s.startTime}</span>
                <span className="min-w-0 flex-1 truncate">
                  {s.typeName}
                  <span className="text-text-secondary">
                    {' · '}
                    {s.trainerName ?? t('admin.classes.no_trainer')}
                    {' · '}
                    {t('admin.classes.minutes', { count: s.durationMin })}
                    {' · '}
                    {t('admin.classes.capacity_n', { count: s.capacity })}
                  </span>
                </span>
                {s.validUntil && (
                  <Badge tone={ended(s) ? 'neutral' : 'warning'}>
                    {ended(s)
                      ? t('admin.classes.series_ended_badge')
                      : t('admin.classes.until', { date: f.date(s.validUntil) })}
                  </Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing === 'new' && <SeriesCreateModal onClose={() => setEditing(null)} />}
      {editing && editing !== 'new' && (
        <SeriesEditModal series={editing} onClose={() => setEditing(null)} />
      )}
    </Card>
  );
}

function SeriesCreateModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const fmt = useClassFormat();
  const qc = useQueryClient();
  const types = useClassTypes();
  const trainers = useTrainers();
  const [typeId, setTypeId] = useState('');
  const [weekday, setWeekday] = useState('1');
  const [time, setTime] = useState('19:00');
  const [duration, setDuration] = useState('60');
  const [capacity, setCapacity] = useState('12');
  const [trainerId, setTrainerId] = useState('');
  const [roomKey, setRoomKey] = useState('');
  const [validFrom, setValidFrom] = useState(clubToday());
  const save = useMutation({
    mutationFn: () =>
      api.post('/admin/class-series', {
        classTypeId: typeId,
        weekday: Number(weekday),
        startTime: time,
        durationMin: Number(duration),
        capacity: Number(capacity),
        trainerId: trainerId || null,
        roomKey: roomKey || null,
        validFrom,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['class-series'] });
      void qc.invalidateQueries({ queryKey: ['classes'] });
      toast.success(t('admin.classes.saved'));
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.classes.new_series')}
      description={t('admin.classes.series_create_hint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={!typeId} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
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
        <Field label={t('admin.classes.weekday')} required>
          {(p) => (
            <Select {...p} value={weekday} onChange={(e) => setWeekday(e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <option key={d} value={d} className="capitalize">
                  {fmt.weekday(d)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.classes.start')} required>
          {(p) => (
            <Input {...p} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
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
        <Field label={t('admin.classes.valid_from')}>
          {(p) => (
            <Input
              {...p}
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
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
  );
}

function SeriesEditModal({ series, onClose }: { series: SeriesDto; onClose: () => void }) {
  const { t } = useTranslation();
  const fmt = useClassFormat();
  const qc = useQueryClient();
  const trainers = useTrainers();
  const [trainerId, setTrainerId] = useState(series.trainerId ?? '');
  const [capacity, setCapacity] = useState(String(series.capacity));
  const [roomKey, setRoomKey] = useState(series.roomKey ?? '');
  const [validUntil, setValidUntil] = useState(series.validUntil ?? '');
  const save = useMutation({
    mutationFn: (overrides: { validUntil?: string } = {}) =>
      api.patch<{ skippedCapacity: number }>(`/admin/class-series/${series.id}`, {
        trainerId: trainerId || null,
        capacity: Number(capacity),
        roomKey: roomKey || null,
        validUntil: (overrides.validUntil ?? validUntil) || null,
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['class-series'] });
      void qc.invalidateQueries({ queryKey: ['classes'] });
      toast.success(
        r.skippedCapacity > 0
          ? t('admin.classes.capacity_skipped', { count: r.skippedCapacity })
          : t('admin.classes.saved'),
      );
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`${series.typeName} · ${fmt.weekday(series.weekday)} ${series.startTime}`}
      description={t('admin.classes.series_edit_hint')}
      footer={
        <>
          <Button
            variant="danger"
            className="me-auto"
            loading={save.isPending && save.variables?.validUntil !== undefined}
            onClick={() => save.mutate({ validUntil: addDays(clubToday(), -1) })}
          >
            {t('admin.classes.end_series')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={save.isPending && save.variables?.validUntil === undefined}
            onClick={() => save.mutate({})}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TrainerSelect value={trainerId} onChange={setTrainerId} trainers={trainers.data} />
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
        <Field label={t('admin.classes.room_key')}>
          {(p) => (
            <Input
              {...p}
              value={roomKey}
              onChange={(e) => setRoomKey(e.target.value.toLowerCase())}
            />
          )}
        </Field>
        <Field label={t('admin.classes.valid_until')} hint={t('admin.classes.valid_until_hint')}>
          {(p) => (
            <Input
              {...p}
              type="date"
              min={series.validFrom}
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
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
  );
}
