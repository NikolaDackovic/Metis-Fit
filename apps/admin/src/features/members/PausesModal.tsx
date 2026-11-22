import type { MembershipDto, PauseDto, PauseStatus } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { addDays, clubToday, useFormat } from '@/lib/format';

const TONE: Record<PauseStatus, 'warning' | 'success' | 'danger' | 'neutral'> = {
  requested: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

/** Invalidate everything that shows a pause or a membership end date. */
export function useRefreshPauses() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['pauses'] });
    void qc.invalidateQueries({ queryKey: ['member'] });
    void qc.invalidateQueries({ queryKey: ['alerts'] });
  };
}

/** Approve / reject a waiting request (used here and in the alert center). */
export function usePauseDecision() {
  const { t, i18n } = useTranslation();
  const refresh = useRefreshPauses();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' | 'end' }) =>
      api.post<PauseDto>(`/admin/pauses/${id}/${action}?locale=${i18n.language}`, {}),
    onSuccess: (_d, v) => {
      refresh();
      toast.success(t(`admin.pauses.done_${v.action}`));
    },
    onError: (e) => toast.error(t(e instanceof ApiError ? e.message : 'errors.internal')),
  });
}

/**
 * F13-2: pauses of one membership. Staff see the history, decide on requests, end a running
 * pause early (unused days are taken back) and enter a new pause that is approved at once.
 */
export function PausesModal({
  membership,
  onClose,
}: {
  membership: MembershipDto;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const refresh = useRefreshPauses();
  const decide = usePauseDecision();
  const list = useQuery({
    queryKey: ['pauses', membership.id, i18n.language],
    queryFn: () =>
      api.get<PauseDto[]>('/admin/pauses', { membershipId: membership.id, locale: i18n.language }),
  });
  const [startsOn, setStartsOn] = useState(clubToday());
  const [endsOn, setEndsOn] = useState(addDays(clubToday(), 6));
  const [reason, setReason] = useState('');
  const create = useMutation({
    mutationFn: () =>
      api.post<PauseDto>(`/admin/memberships/${membership.id}/pauses?locale=${i18n.language}`, {
        startsOn,
        endsOn,
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      refresh();
      setReason('');
      toast.success(t('admin.pauses.done_create'));
    },
    onError: (e) => toast.error(t(e instanceof ApiError ? e.message : 'errors.internal')),
  });
  const today = clubToday();

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('admin.pauses.title', { plan: membership.planName })}
      description={t('admin.pauses.hint')}
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3 rounded-md border border-border-subtle p-4">
          <h3 className="text-sm font-semibold">{t('admin.pauses.new')}</h3>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('admin.pauses.from')}>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                />
              )}
            </Field>
            <Field label={t('admin.pauses.to')}>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={endsOn}
                  min={startsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
              )}
            </Field>
            <Field label={t('admin.pauses.reason')} className="min-w-48 flex-1">
              {(p) => (
                <Input
                  {...p}
                  value={reason}
                  maxLength={300}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
            </Field>
            <Button
              loading={create.isPending}
              disabled={!startsOn || !endsOn || endsOn < startsOn}
              onClick={() => create.mutate()}
            >
              {t('admin.pauses.add')}
            </Button>
          </div>
          <p className="text-xs text-text-secondary">{t('admin.pauses.add_hint')}</p>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('admin.pauses.history')}</h3>
          {list.isPending ? (
            <p className="text-sm text-text-secondary">…</p>
          ) : !list.data?.length ? (
            <p className="text-sm text-text-secondary">{t('admin.pauses.empty')}</p>
          ) : (
            <ul className="divide-y divide-border-subtle rounded-md border border-border-subtle">
              {list.data.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="tabular font-semibold">
                      {f.date(p.startsOn)} - {f.date(p.endsOn)}
                      <span className="ms-2 font-normal text-text-secondary">
                        {t('admin.pauses.days', { count: p.days })}
                      </span>
                    </p>
                    {(p.reason || p.decisionNote) && (
                      <p className="truncate text-xs text-text-secondary">
                        {[p.reason, p.decisionNote].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <Badge tone={TONE[p.status]}>{t(`admin.pauses.status.${p.status}`)}</Badge>
                  {p.status === 'requested' && (
                    <>
                      <Button
                        size="sm"
                        loading={decide.isPending}
                        onClick={() => decide.mutate({ id: p.id, action: 'approve' })}
                      >
                        {t('admin.pauses.approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => decide.mutate({ id: p.id, action: 'reject' })}
                      >
                        {t('admin.pauses.reject')}
                      </Button>
                    </>
                  )}
                  {p.status === 'approved' && p.endsOn >= today && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => decide.mutate({ id: p.id, action: 'end' })}
                    >
                      {p.startsOn > today ? t('admin.pauses.cancel') : t('admin.pauses.end')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}
