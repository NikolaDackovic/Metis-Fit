import type { EquipmentStatus, MaintenanceDto } from '@grit/validation';
import { EQUIPMENT_STATUSES, MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES } from '@grit/validation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Table';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { statusTone, useEquipmentList } from './EquipmentPage';

const priorityTone = {
  critical: 'danger',
  high: 'warning',
  normal: 'neutral',
  low: 'neutral',
} as const;
const statusToneM = {
  open: 'accent',
  in_progress: 'warning',
  resolved: 'success',
  rejected: 'neutral',
} as const;

export function MaintenancePage() {
  const { t } = useTranslation();
  const f = useFormat();
  const [status, setStatus] = useState<string>('open');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<MaintenanceDto | null>(null);
  const [creating, setCreating] = useState(false);

  const q = useQuery({
    queryKey: ['maintenance', { status, page }],
    queryFn: () =>
      api.page<MaintenanceDto[]>('/admin/maintenance', {
        status: status || undefined,
        page,
        pageSize: 30,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title={t('admin.maintenance.title')}
        subtitle={t('admin.maintenance.subtitle')}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            {t('admin.maintenance.new')}
          </Button>
        }
      />
      <Card>
        <div
          role="group"
          className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border-subtle p-4"
        >
          {['open', 'in_progress', 'resolved', 'rejected', ''].map((s) => (
            <button
              key={s || 'all'}
              type="button"
              aria-pressed={status === s}
              onClick={() => (setStatus(s), setPage(1))}
              className={cn(
                'h-9 shrink-0 rounded-sm border px-3 text-xs font-semibold',
                status === s
                  ? 'border-accent-500 bg-accent-tint'
                  : 'border-border-subtle text-text-secondary',
              )}
            >
              {s ? t(`admin.maintenance.statuses.${s}`) : t('admin.members.all')}
            </button>
          ))}
        </div>
        {q.isPending ? (
          <TableSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState icon={Wrench} title={t('admin.maintenance.empty')} />
        ) : (
          <>
            <ul className="divide-y divide-border-subtle">
              {q.data.items.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(m)}
                    className="flex w-full flex-col gap-2 px-4 py-3.5 text-start hover:bg-bg-surface2 md:flex-row md:items-center md:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {m.equipmentName ?? t('admin.maintenance.room', { room: m.roomKey })}
                      </p>
                      <p className="line-clamp-2 text-sm text-text-secondary">{m.description}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={priorityTone[m.priority]}>
                        {t(`admin.maintenance.priorities.${m.priority}`)}
                      </Badge>
                      <Badge tone={statusToneM[m.status]}>
                        {t(`admin.maintenance.statuses.${m.status}`)}
                      </Badge>
                      <span className="tabular text-xs text-text-secondary">
                        {f.dateTime(m.createdAt)} · {t(`admin.maintenance.sources.${m.source}`)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination
              page={q.data.meta.page}
              pageSize={q.data.meta.pageSize}
              total={q.data.meta.total}
              onPage={setPage}
            />
          </>
        )}
      </Card>
      {selected && <TriageModal item={selected} onClose={() => setSelected(null)} />}
      {creating && <CreateModal onClose={() => setCreating(false)} />}
    </>
  );
}

function TriageModal({ item, onClose }: { item: MaintenanceDto; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState(item.status);
  const [priority, setPriority] = useState(item.priority);
  const [note, setNote] = useState(item.resolutionNote ?? '');
  const [machine, setMachine] = useState<EquipmentStatus | ''>('');

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/admin/maintenance/${item.id}`, {
        status,
        priority,
        resolutionNote: note,
        ...(machine && { equipmentStatus: machine }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['maintenance'] });
      void qc.invalidateQueries({ queryKey: ['equipment'] });
      toast.success(t('admin.maintenance.saved'));
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={item.equipmentName ?? t('admin.maintenance.room', { room: item.roomKey })}
      description={item.description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('admin.fields.status')}>
          {(p) => (
            <Select
              {...p}
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              {MAINTENANCE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`admin.maintenance.statuses.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.maintenance.priority')}>
          {(p) => (
            <Select
              {...p}
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
            >
              {MAINTENANCE_PRIORITIES.map((s) => (
                <option key={s} value={s}>
                  {t(`admin.maintenance.priorities.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {item.equipmentId && (
          <Field
            label={t('admin.maintenance.machine_status')}
            hint={
              item.equipmentStatus
                ? t('admin.maintenance.currently', {
                    status: t(`equipment.status.${item.equipmentStatus}`),
                  })
                : undefined
            }
            className="sm:col-span-2"
          >
            {(p) => (
              <Select
                {...p}
                value={machine}
                onChange={(e) => setMachine(e.target.value as EquipmentStatus | '')}
              >
                <option value="">{t('admin.maintenance.keep_status')}</option>
                {EQUIPMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`equipment.status.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label={t('admin.maintenance.resolution')} className="sm:col-span-2">
          {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {item.equipmentStatus && (
          <p className="text-xs text-text-secondary sm:col-span-2">
            <Badge tone={statusTone[item.equipmentStatus]}>
              {t(`equipment.status.${item.equipmentStatus}`)}
            </Badge>{' '}
            {t('admin.maintenance.reported_by', { name: item.reportedByName ?? '-' })}
          </p>
        )}
      </div>
    </Modal>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const equipment = useEquipmentList();
  const [equipmentId, setEquipmentId] = useState('');
  const [roomKey, setRoomKey] = useState('');
  const [description, setDescription] = useState('');
  const create = useMutation({
    mutationFn: () =>
      api.post('/admin/maintenance', {
        ...(equipmentId && { equipmentId }),
        ...(roomKey && { roomKey }),
        description,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['maintenance'] });
      toast.success(t('admin.maintenance.saved'));
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('admin.maintenance.new')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={create.isPending}
            disabled={description.trim().length < 5 || (!equipmentId && !roomKey)}
            onClick={() => create.mutate()}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('admin.maintenance.machine')}>
          {(p) => (
            <Select {...p} value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
              <option value="">-</option>
              {equipment.data?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('admin.maintenance.room_key')} hint={t('admin.maintenance.room_hint')}>
          {(p) => (
            <Input
              {...p}
              value={roomKey}
              onChange={(e) => setRoomKey(e.target.value.toLowerCase())}
            />
          )}
        </Field>
        <Field label={t('admin.maintenance.description')} required>
          {(p) => (
            <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} />
          )}
        </Field>
        {create.error && (
          <p className="text-sm text-status-danger">
            {t(create.error instanceof ApiError ? create.error.message : 'errors.internal')}
          </p>
        )}
      </div>
    </Modal>
  );
}
