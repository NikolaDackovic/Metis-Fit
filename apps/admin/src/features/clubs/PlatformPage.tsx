import type { ClubStatus, PlatformClubDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle2, PauseCircle, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Table';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';

const TONE: Record<ClubStatus, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  active: 'success',
  suspended: 'danger',
};

/** Platform owner (F12-3): every gym on the platform; approve new ones, suspend or reactivate. */
export function PlatformPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [status, setStatus] = useState<ClubStatus>('pending');
  const [suspending, setSuspending] = useState<PlatformClubDto | null>(null);
  const q = useQuery({
    queryKey: ['platform', 'clubs', status],
    queryFn: () => api.get<PlatformClubDto[]>('/platform/clubs', { status }),
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reactivate' }) =>
      api.post(`/platform/clubs/${id}/${action}`),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['platform'] });
      toast.success(
        t(v.action === 'approve' ? 'admin.platform.approved' : 'admin.platform.reactivated'),
      );
    },
  });
  return (
    <>
      <PageHeader title={t('admin.platform.title')} subtitle={t('admin.platform.subtitle')} />
      <div className="mb-4">
        <Tabs
          value={status}
          onChange={setStatus}
          tabs={(['pending', 'active', 'suspended'] as const).map((s) => ({
            value: s,
            label: t(`admin.platform.status.${s}`),
          }))}
        />
      </div>
      {q.isPending ? (
        <Skeleton className="h-60" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title={t(`admin.platform.empty.${status}`)} />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {q.data.map((c) => (
            <Card key={c.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-sm text-text-secondary">
                    {[c.city, c.address].filter(Boolean).join(', ')}
                  </p>
                </div>
                <Badge tone={TONE[c.status]}>{t(`admin.platform.status.${c.status}`)}</Badge>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-text-secondary">{t('admin.platform.address')}</dt>
                <dd className="font-mono text-xs">{c.slug}</dd>
                <dt className="text-text-secondary">{t('admin.platform.owner')}</dt>
                <dd>
                  {c.ownerName ?? '-'}
                  {c.ownerEmail ? ` · ${c.ownerEmail}` : ''}
                </dd>
                {(c.phone || c.email) && (
                  <>
                    <dt className="text-text-secondary">{t('admin.platform.contact')}</dt>
                    <dd>{[c.phone, c.email].filter(Boolean).join(' · ')}</dd>
                  </>
                )}
                <dt className="text-text-secondary">{t('admin.platform.members')}</dt>
                <dd>{c.members}</dd>
                <dt className="text-text-secondary">{t('admin.platform.registered')}</dt>
                <dd>{f.dateTime(c.createdAt)}</dd>
                {c.suspendedReason && (
                  <>
                    <dt className="text-text-secondary">{t('admin.platform.reason')}</dt>
                    <dd className="text-status-danger">{c.suspendedReason}</dd>
                  </>
                )}
              </dl>
              <div className="flex flex-wrap justify-end gap-2">
                {c.status === 'pending' && (
                  <Button
                    icon={<CheckCircle2 className="size-4" />}
                    loading={act.isPending && act.variables?.id === c.id}
                    onClick={() => act.mutate({ id: c.id, action: 'approve' })}
                  >
                    {t('admin.platform.approve')}
                  </Button>
                )}
                {c.status === 'suspended' && (
                  <Button
                    variant="secondary"
                    icon={<PlayCircle className="size-4" />}
                    onClick={() => act.mutate({ id: c.id, action: 'reactivate' })}
                  >
                    {t('admin.platform.reactivate')}
                  </Button>
                )}
                {c.status !== 'suspended' && !c.isDefault && (
                  <Button
                    variant="ghost"
                    icon={<PauseCircle className="size-4" />}
                    onClick={() => setSuspending(c)}
                  >
                    {t('admin.platform.suspend')}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {suspending && <SuspendModal club={suspending} onClose={() => setSuspending(null)} />}
    </>
  );
}

function SuspendModal({ club, onClose }: { club: PlatformClubDto; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => api.post(`/platform/clubs/${club.id}/suspend`, { reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform'] });
      toast.success(t('admin.platform.suspended'));
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`${t('admin.platform.suspend')}: ${club.name}`}
      description={t('admin.platform.suspend_hint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={save.isPending}
            disabled={reason.trim().length < 3}
            onClick={() => save.mutate()}
          >
            {t('admin.platform.suspend')}
          </Button>
        </>
      }
    >
      <Field label={t('admin.platform.reason')} required>
        {(p) => (
          <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        )}
      </Field>
      {save.error && (
        <p role="alert" className="mt-2 text-sm text-status-danger">
          {t(save.error instanceof ApiError ? save.error.message : 'errors.internal')}
        </p>
      )}
    </Modal>
  );
}
