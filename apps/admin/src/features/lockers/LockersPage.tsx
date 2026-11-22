import type { AdminLockerMapDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DoorClosed, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Table';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useCan } from '@/lib/me';

type Locker = AdminLockerMapDto[number]['lockers'][number];

const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p.charAt(0))
    .join('');

/** Changing rooms: locker grid (free / taken / out of service), release, service, add lockers. */
export function LockersPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const q = useQuery({
    queryKey: ['lockers', i18n.language],
    queryFn: () => api.get<AdminLockerMapDto>('/admin/lockers'),
    refetchInterval: 15_000,
  });
  const [room, setRoom] = useState<string | null>(null);
  const [selected, setSelected] = useState<Locker | null>(null);
  const [adding, setAdding] = useState(false);
  const current = q.data?.find((r) => r.key === room) ?? q.data?.[0];
  const counts = (current?.lockers ?? []).reduce(
    (a, l) => {
      if (l.status === 'out_of_service') a.service += 1;
      else if (l.occupant) a.taken += 1;
      else a.free += 1;
      return a;
    },
    { free: 0, taken: 0, service: 0 },
  );

  return (
    <>
      <PageHeader
        title={t('admin.lockers.title')}
        subtitle={t('admin.lockers.subtitle')}
        actions={
          can('lockers.manage') && (
            <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              {t('admin.lockers.add')}
            </Button>
          )
        }
      />
      {q.isPending ? (
        <Skeleton className="h-96" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <Card>
          <div className="px-4 pt-2">
            <Tabs
              value={current?.key ?? ''}
              onChange={setRoom}
              tabs={q.data.map((r) => ({ value: r.key, label: `${r.name} (${r.lockers.length})` }))}
            />
          </div>
          <div className="flex flex-wrap gap-4 px-4 py-3 text-sm text-text-secondary">
            <span>
              <span
                className="me-1.5 inline-block size-3 rounded-xs bg-status-success/30"
                aria-hidden
              />
              {t('admin.lockers.free', { count: counts.free })}
            </span>
            <span>
              <span className="me-1.5 inline-block size-3 rounded-xs bg-accent-500" aria-hidden />
              {t('admin.lockers.taken', { count: counts.taken })}
            </span>
            <span>
              <span
                className="me-1.5 inline-block size-3 rounded-xs bg-status-warning/40"
                aria-hidden
              />
              {t('admin.lockers.service', { count: counts.service })}
            </span>
          </div>
          {!current || current.lockers.length === 0 ? (
            <EmptyState
              icon={DoorClosed}
              title={t('admin.lockers.empty')}
              description={t('admin.lockers.empty_hint')}
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2 p-4">
              {current.lockers.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSelected(l)}
                  title={l.occupant?.name ?? l.note ?? undefined}
                  aria-label={
                    l.occupant
                      ? t('admin.lockers.a11y_taken', { n: l.number, name: l.occupant.name })
                      : l.status === 'out_of_service'
                        ? t('admin.lockers.a11y_service', { n: l.number })
                        : t('admin.lockers.a11y_free', { n: l.number })
                  }
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center rounded-sm border text-sm transition-transform hover:scale-105',
                    l.status === 'out_of_service'
                      ? 'border-status-warning/50 bg-status-warning/10 text-status-warning'
                      : l.occupant
                        ? 'border-accent-500 bg-accent-500 text-on-accent'
                        : 'border-status-success/40 bg-status-success/10',
                  )}
                >
                  <span className="tabular text-base font-bold">{l.number}</span>
                  {l.occupant && (
                    <span className="max-w-full truncate px-1 text-[10px] font-semibold">
                      {initials(l.occupant.name)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </Card>
      )}
      {selected && <LockerModal locker={selected} onClose={() => setSelected(null)} />}
      {adding && q.data && (
        <AddModal
          rooms={q.data}
          initialRoom={current?.key}
          onClose={() => setAdding(false)}
          onAdded={setRoom}
        />
      )}
    </>
  );
}

function LockerModal({ locker, onClose }: { locker: Locker; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const qc = useQueryClient();
  const [note, setNote] = useState(locker.note ?? '');
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['lockers'] });
    void qc.invalidateQueries({ queryKey: ['occupancy'] });
    onClose();
  };
  const release = useMutation({
    mutationFn: () => api.post(`/admin/lockers/${locker.id}/release`),
    onSuccess: done,
  });
  const update = useMutation({
    mutationFn: (status: 'available' | 'out_of_service') =>
      api.patch(`/admin/lockers/${locker.id}`, { status, note }),
    onSuccess: () => {
      toast.success(t('admin.lockers.saved'));
      done();
    },
  });
  const error = release.error ?? update.error;
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('admin.lockers.locker_n', { n: locker.number })}
    >
      <div className="flex flex-col gap-4">
        {locker.occupant ? (
          <div className="rounded-sm bg-bg-surface2 p-3 text-sm">
            <p className="font-semibold">{locker.occupant.name}</p>
            <p className="text-text-secondary">
              {t('admin.lockers.since', { time: f.dateTime(locker.occupant.since) })}
            </p>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">
            {locker.status === 'out_of_service'
              ? t('admin.lockers.is_service')
              : t('admin.lockers.is_free')}
          </p>
        )}
        {locker.occupant && can('attendance.checkin') && (
          <Button variant="secondary" loading={release.isPending} onClick={() => release.mutate()}>
            {t('admin.lockers.release')}
          </Button>
        )}
        {can('lockers.manage') && (
          <>
            <Field label={t('admin.lockers.note')}>
              {(p) => (
                <Input
                  {...p}
                  value={note}
                  maxLength={200}
                  onChange={(e) => setNote(e.target.value)}
                />
              )}
            </Field>
            {locker.status === 'out_of_service' ? (
              <Button loading={update.isPending} onClick={() => update.mutate('available')}>
                {t('admin.lockers.back_in_service')}
              </Button>
            ) : (
              <Button
                variant="danger"
                loading={update.isPending}
                onClick={() => update.mutate('out_of_service')}
              >
                {t('admin.lockers.out_of_service')}
              </Button>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-status-danger">
            {t(error instanceof ApiError ? error.message : 'errors.internal')}
          </p>
        )}
      </div>
    </Modal>
  );
}

function AddModal({
  rooms,
  initialRoom,
  onClose,
  onAdded,
}: {
  rooms: AdminLockerMapDto;
  initialRoom?: string;
  onClose: () => void;
  onAdded: (roomKey: string) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  // Starts in the changing room that is open on the page (not always the first one).
  const [roomKey, setRoomKey] = useState(initialRoom ?? rooms[0]?.key ?? '');
  const lastIn = (key: string) =>
    Math.max(0, ...(rooms.find((r) => r.key === key)?.lockers.map((l) => l.number) ?? [0]));
  const [from, setFrom] = useState(String(lastIn(roomKey) + 1));
  const [to, setTo] = useState(String(lastIn(roomKey) + 10));
  const pickRoom = (key: string) => {
    setRoomKey(key);
    setFrom(String(lastIn(key) + 1));
    setTo(String(lastIn(key) + 10));
  };
  const add = useMutation({
    mutationFn: () =>
      api.post<{ added: number }>('/admin/lockers', {
        roomKey,
        from: Number(from),
        to: Number(to),
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['lockers'] });
      toast.success(t('admin.lockers.added', { count: r.added }));
      onAdded(roomKey);
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('admin.lockers.add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={add.isPending} onClick={() => add.mutate()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('admin.lockers.room')} className="sm:col-span-2">
          {(p) => (
            <Select {...p} value={roomKey} onChange={(e) => pickRoom(e.target.value)}>
              {rooms.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.lockers.from')}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('admin.lockers.to')} hint={t('admin.lockers.range_hint')}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          )}
        </Field>
        {add.error && (
          <p role="alert" className="text-sm text-status-danger sm:col-span-2">
            {t(add.error instanceof ApiError ? add.error.message : 'errors.internal')}
          </p>
        )}
      </div>
    </Modal>
  );
}
