import type { PtRequestAdminDto, PtRequestStatus } from '@grit/validation';
import { PT_REQUEST_STATUSES } from '@grit/validation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Table';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useTrainers } from './classes-utils';
import { TrainerSelect } from './SessionModal';

const tone = {
  new: 'accent',
  contacted: 'warning',
  scheduled: 'success',
  closed: 'neutral',
  cancelled: 'neutral',
} as const;

export function PtRequestsPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const [status, setStatus] = useState<PtRequestStatus | ''>('new');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PtRequestAdminDto | null>(null);
  const q = useQuery({
    queryKey: ['pt-requests', { status, page }],
    queryFn: () =>
      api.page<PtRequestAdminDto[]>('/admin/pt-requests', {
        status: status || undefined,
        page,
        pageSize: 30,
      }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader title={t('admin.pt.title')} subtitle={t('admin.pt.subtitle')} />
      <Card>
        <div
          role="group"
          className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border-subtle p-4"
        >
          {[...PT_REQUEST_STATUSES, ''].map((s) => (
            <button
              key={s || 'all'}
              type="button"
              aria-pressed={status === s}
              onClick={() => (setStatus(s as PtRequestStatus | ''), setPage(1))}
              className={cn(
                'h-9 shrink-0 rounded-sm border px-3 text-xs font-semibold',
                status === s
                  ? 'border-accent-500 bg-accent-tint'
                  : 'border-border-subtle text-text-secondary',
              )}
            >
              {s ? t(`admin.pt.statuses.${s}`) : t('admin.members.all')}
            </button>
          ))}
        </div>
        {q.isPending ? (
          <TableSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState icon={UserCheck} title={t('admin.pt.empty')} />
        ) : (
          <>
            <ul className="divide-y divide-border-subtle">
              {q.data.items.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r)}
                    className="flex w-full flex-col gap-2 px-4 py-3.5 text-start hover:bg-bg-surface2 md:flex-row md:items-center md:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {r.member.firstName} {r.member.lastName}{' '}
                        <span className="tabular text-xs font-normal text-text-secondary">
                          {r.member.memberNumber}
                        </span>
                      </p>
                      <p className="line-clamp-2 text-sm text-text-secondary">{r.goal}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-text-secondary">
                        {r.trainerName ?? t('admin.pt.any_trainer')}
                      </span>
                      <Badge tone={tone[r.status]}>{t(`admin.pt.statuses.${r.status}`)}</Badge>
                      <span className="tabular text-xs text-text-secondary">
                        {f.dateTime(r.createdAt)}
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
      {selected && <RequestModal item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function RequestModal({ item, onClose }: { item: PtRequestAdminDto; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const trainers = useTrainers();
  const [status, setStatus] = useState(item.status);
  const [trainerId, setTrainerId] = useState(item.trainerId ?? '');
  const [note, setNote] = useState(item.staffNote ?? '');
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/admin/pt-requests/${item.id}`, {
        status,
        trainerId: trainerId || null,
        staffNote: note,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pt-requests'] });
      toast.success(t('admin.pt.saved'));
      onClose();
    },
  });
  const m = item.member;
  return (
    <Modal
      open
      onClose={onClose}
      title={`${m.firstName} ${m.lastName}`}
      description={t('admin.pt.requested_at', { date: f.dateTime(item.createdAt) })}
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {m.phone && (
            <a
              href={`tel:${m.phone}`}
              className="inline-flex h-9 items-center gap-2 rounded-sm border border-border-strong px-3 text-sm font-semibold"
            >
              <Phone className="size-4" aria-hidden /> {m.phone}
            </a>
          )}
          {m.email && (
            <a
              href={`mailto:${m.email}`}
              className="inline-flex h-9 items-center gap-2 rounded-sm border border-border-strong px-3 text-sm font-semibold"
            >
              <Mail className="size-4" aria-hidden /> {m.email}
            </a>
          )}
          <Link
            to={`/members/${m.id}`}
            className="inline-flex h-9 items-center rounded-sm px-3 text-sm font-semibold text-accent-400 hover:underline"
          >
            {t('admin.pt.open_member')}
          </Link>
        </div>
        <div className="rounded-sm bg-bg-surface2 p-3 text-sm">
          <p className="text-xs font-semibold text-text-secondary uppercase">
            {t('admin.pt.goal')}
          </p>
          <p className="mt-1 whitespace-pre-line">{item.goal}</p>
          {item.preferredTimes && (
            <>
              <p className="mt-3 text-xs font-semibold text-text-secondary uppercase">
                {t('admin.pt.preferred_times')}
              </p>
              <p className="mt-1">{item.preferredTimes}</p>
            </>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('admin.fields.status')}>
            {(p) => (
              <Select
                {...p}
                value={status}
                onChange={(e) => setStatus(e.target.value as PtRequestStatus)}
              >
                {PT_REQUEST_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`admin.pt.statuses.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <TrainerSelect value={trainerId} onChange={setTrainerId} trainers={trainers.data} />
        </div>
        <Field label={t('admin.pt.staff_note')} hint={t('admin.pt.staff_note_hint')}>
          {(p) => (
            <Textarea
              {...p}
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
        {item.handledByName && (
          <p className="text-xs text-text-secondary">
            {t('admin.pt.handled_by', { name: item.handledByName })}
          </p>
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
