import type { MembershipDto, PtSessionsDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ReasonDialog } from '@/components/ui/ReasonDialog';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { clubToday, useFormat } from '@/lib/format';
import { useTrainers } from './classes-utils';
import { TrainerSelect } from './SessionModal';

/** Held personal-training sessions of one membership: record (consumes one) or void. */
export function PtSessionsModal({
  membership,
  onClose,
}: {
  membership: MembershipDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const trainers = useTrainers();
  const key = ['pt-sessions', membership.id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api.get<PtSessionsDto>(`/admin/memberships/${membership.id}/pt-sessions`),
  });
  const [heldOn, setHeldOn] = useState(clubToday());
  const [trainerId, setTrainerId] = useState('');
  const [voidId, setVoidId] = useState<string | null>(null);
  const onDone = (data: PtSessionsDto) => {
    qc.setQueryData(key, data);
    void qc.invalidateQueries({ queryKey: ['member', membership.memberId] });
  };
  const record = useMutation({
    mutationFn: () =>
      api.post<PtSessionsDto>(`/admin/memberships/${membership.id}/pt-sessions`, {
        heldOn,
        trainerId: trainerId || null,
      }),
    onSuccess: (d) => {
      onDone(d);
      toast.success(t('admin.pt.session_recorded'));
    },
  });
  const voidSession = useMutation({
    mutationFn: (reason: string) =>
      api.post<PtSessionsDto>(`/admin/pt-sessions/${voidId}/void`, { reason }),
    onSuccess: (d) => {
      onDone(d);
      setVoidId(null);
    },
  });
  const left = q.data?.visitLimit != null ? q.data.visitLimit - q.data.visitsUsed : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.pt.sessions_title')}
      description={membership.planName}
      size="md"
    >
      {q.isPending ? (
        <Skeleton className="h-48" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="flex flex-col gap-5">
          <p className="tabular text-sm">
            <span className="font-display text-2xl">{q.data.visitsUsed}</span>
            <span className="text-text-secondary"> / {q.data.visitLimit ?? '∞'} </span>
            {left !== null && (
              <span className="text-text-secondary">
                · {t('admin.pt.sessions_left', { count: left })}
              </span>
            )}
          </p>
          {membership.state === 'active' && (left === null || left > 0) && (
            <div className="grid items-end gap-3 rounded-sm border border-border-subtle p-3 sm:grid-cols-[1fr_1fr_auto]">
              <Field label={t('admin.pt.held_on')}>
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    max={clubToday()}
                    min={membership.startDate}
                    value={heldOn}
                    onChange={(e) => setHeldOn(e.target.value)}
                  />
                )}
              </Field>
              <TrainerSelect value={trainerId} onChange={setTrainerId} trainers={trainers.data} />
              <Button
                icon={<Plus className="size-4" />}
                loading={record.isPending}
                onClick={() => record.mutate()}
              >
                {t('admin.pt.record')}
              </Button>
              {record.error && (
                <p role="alert" className="text-sm text-status-danger sm:col-span-3">
                  {t(record.error instanceof ApiError ? record.error.message : 'errors.internal')}
                </p>
              )}
            </div>
          )}
          {q.data.sessions.length === 0 ? (
            <p className="text-sm text-text-secondary">{t('admin.pt.no_sessions')}</p>
          ) : (
            <ul className="divide-y divide-border-subtle rounded-sm border border-border-subtle">
              {q.data.sessions.map((s) => (
                <li
                  key={s.id}
                  className={cn('flex items-center gap-3 px-3 py-2.5', s.voidedAt && 'opacity-50')}
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn('tabular font-semibold', s.voidedAt && 'line-through')}>
                      {f.date(s.heldOn)}
                    </p>
                    <p className="truncate text-xs text-text-secondary">
                      {s.trainerName ?? '-'}
                      {s.recordedByName &&
                        ` · ${t('admin.pt.recorded_by', { name: s.recordedByName })}`}
                      {s.voidReason && ` · ${s.voidReason}`}
                    </p>
                  </div>
                  {!s.voidedAt && (
                    <Button size="sm" variant="ghost" onClick={() => setVoidId(s.id)}>
                      {t('admin.pt.void')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ReasonDialog
        open={voidId !== null}
        title={t('admin.pt.void')}
        consequence={t('admin.pt.void_consequence')}
        confirmLabel={t('admin.pt.void')}
        onCancel={() => setVoidId(null)}
        onConfirm={(reason) => voidSession.mutate(reason)}
        loading={voidSession.isPending}
        error={voidSession.error instanceof ApiError ? voidSession.error.message : null}
      />
    </Modal>
  );
}
