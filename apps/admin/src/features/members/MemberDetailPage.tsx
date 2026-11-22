import type { AuditEntryDto, MemberDto, MembershipDto, PaymentDto } from '@grit/validation';
import { MemberAvatar } from '@/components/MemberAvatar';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarCheck,
  CreditCard,
  History,
  Pencil,
  Plus,
  Smartphone,
  StickyNote,
  UserX,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Field, Textarea } from '@/components/ui/Field';
import { ReasonDialog } from '@/components/ui/ReasonDialog';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
  TableSkeleton,
} from '@/components/ui/States';
import { Table, Tabs, Td, Th } from '@/components/ui/Table';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useCan } from '@/lib/me';
import { PtSessionsModal } from '../classes/PtSessionsModal';
import { MemberNutritionPanel } from '../nutrition/MemberNutritionPanel';
import { WorkoutPlansPanel } from '../workouts/WorkoutPlansPanel';
import { RecordPaymentModal } from '../payments/PaymentActions';
import { PaymentList } from '../payments/PaymentList';
import { ActivateMembershipModal } from './ActivateMembershipModal';
import { PausesModal } from './PausesModal';
import { AssignMembershipModal } from './AssignMembershipModal';
import { LinkCodeModal } from './LinkCodeModal';
import { MemberLoyaltyTab } from '@/features/loyalty/MemberLoyaltyTab';
import { MemberFormModal } from './MemberFormModal';

type Tab = 'memberships' | 'payments' | 'attendance' | 'loyalty' | 'plans' | 'notes' | 'audit';

export function MemberDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('memberships');
  const [modal, setModal] = useState<
    'edit' | 'assign' | 'payment' | 'deactivate' | 'erase' | 'link' | null
  >(null);

  const member = useQuery({
    queryKey: ['member', id],
    queryFn: () => api.get<MemberDto>(`/admin/members/${id}`),
  });
  const memberships = useQuery({
    queryKey: ['member', id, 'memberships'],
    queryFn: () => api.get<MembershipDto[]>(`/admin/members/${id}/memberships`),
  });

  const deactivate = useMutation({
    mutationFn: (reason: string) =>
      api.post<MemberDto>(`/admin/members/${id}/deactivate`, { reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['member', id] });
      void qc.invalidateQueries({ queryKey: ['members'] });
      toast.success(t('admin.members.deactivated'));
      setModal(null);
    },
  });

  const erase = useMutation({
    mutationFn: (reason: string) => api.post<MemberDto>(`/admin/members/${id}/erase`, { reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['member'] });
      void qc.invalidateQueries({ queryKey: ['members'] });
      toast.success(t('admin.members.erased'));
      setModal(null);
    },
  });

  if (member.isError)
    return <ErrorState error={member.error} onRetry={() => void member.refetch()} />;
  const m = member.data;
  const current = memberships.data?.find((x) => x.state !== 'cancelled');
  const totalDebt =
    memberships.data?.reduce(
      (s, x) => s + (x.state !== 'cancelled' ? Math.max(0, x.balanceAmount) : 0),
      0,
    ) ?? 0;

  const tabs: Array<{ value: Tab; label: string; permission: string }> = [
    {
      value: 'memberships',
      label: t('admin.members.tabs.memberships'),
      permission: 'members.read',
    },
    { value: 'payments', label: t('admin.members.tabs.payments'), permission: 'payments.read' },
    {
      value: 'attendance',
      label: t('admin.members.tabs.attendance'),
      permission: 'attendance.read',
    },
    { value: 'loyalty', label: t('admin.members.tabs.loyalty'), permission: 'members.read' },
    { value: 'plans', label: t('admin.members.tabs.plans'), permission: 'trainers.manage' },
    { value: 'notes', label: t('admin.members.tabs.notes'), permission: 'members.notes' },
    { value: 'audit', label: t('admin.members.tabs.audit'), permission: 'audit.read' },
  ];

  return (
    <>
      <Link
        to="/members"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t('admin.members.back')}
      </Link>

      {!m ? (
        <Skeleton className="h-36" />
      ) : (
        <Card className="grit-cut mb-6 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex min-w-0 items-start gap-4">
              <MemberAvatar url={m.photoUrl} firstName={m.firstName} lastName={m.lastName} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold">
                    {m.firstName} {m.lastName}
                  </h1>
                  {m.anonymizedAt ? (
                    <Badge tone="neutral">{t('admin.members.anonymized')}</Badge>
                  ) : (
                    m.deactivatedAt && <Badge tone="danger">{t('admin.members.inactive')}</Badge>
                  )}
                  {m.hasAppAccount && (
                    <Badge tone="accent" icon={<Smartphone className="size-3" />}>
                      {t('admin.members.has_app')}
                    </Badge>
                  )}
                </div>
                <p className="tabular mt-1 text-sm text-text-secondary">
                  {m.memberNumber} · {m.phone ?? '-'} · {m.email ?? '-'}
                </p>
                {m.notesPublic && (
                  <p className="mt-2 text-sm text-text-secondary">{m.notesPublic}</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {can('members.update') && !m.hasAppAccount && !m.deactivatedAt && (
                <Button
                  variant="secondary"
                  icon={<Smartphone className="size-4" />}
                  onClick={() => setModal('link')}
                >
                  {t('admin.members.link_code')}
                </Button>
              )}
              {can('members.update') && (
                <Button
                  variant="secondary"
                  icon={<Pencil className="size-4" />}
                  onClick={() => setModal('edit')}
                >
                  {t('common.edit')}
                </Button>
              )}
              {can('payments.create') && !m.deactivatedAt && (
                <Button
                  variant="secondary"
                  icon={<CreditCard className="size-4" />}
                  onClick={() => setModal('payment')}
                >
                  {t('admin.payments.record')}
                </Button>
              )}
              {can('memberships.create') && !m.deactivatedAt && (
                <Button icon={<Plus className="size-4" />} onClick={() => setModal('assign')}>
                  {t('admin.memberships.assign')}
                </Button>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border-subtle pt-4 md:grid-cols-4">
            <Info label={t('admin.fields.status')}>
              {memberships.data ? (
                <StatusBadge status={current?.displayStatus ?? 'none'} />
              ) : (
                <Skeleton className="h-5 w-20" />
              )}
            </Info>
            <Info label={t('admin.fields.plan')}>{current?.planName ?? '-'}</Info>
            <Info label={t('admin.fields.valid_until')}>
              <span className="tabular">
                {current?.endDate ? f.date(current.endDate) : '-'}
                {current?.visitsRemaining != null &&
                  ` · ${t('admin.memberships.visits_left', { count: current.visitsRemaining })}`}
              </span>
            </Info>
            <Info label={t('admin.memberships.debt')}>
              <span className={cn('tabular', totalDebt > 0 && 'font-semibold text-status-warning')}>
                {totalDebt > 0 ? f.money(totalDebt) : '-'}
              </span>
            </Info>
          </div>
        </Card>
      )}

      <Tabs tabs={tabs.filter((x) => can(x.permission))} value={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'memberships' && <MembershipsTab id={id} query={memberships} />}
        {tab === 'payments' && <PaymentsTab id={id} />}
        {tab === 'attendance' && <AttendanceTab id={id} />}
        {tab === 'notes' && <NotesTab id={id} />}
        {tab === 'loyalty' && <MemberLoyaltyTab memberId={id} />}
        {tab === 'plans' && (
          <div className="flex flex-col gap-4">
            <WorkoutPlansPanel memberId={id} />
            <MemberNutritionPanel memberId={id} />
          </div>
        )}
        {tab === 'audit' && <AuditTab id={id} />}
      </div>

      {m && !m.anonymizedAt && (can('members.deactivate') || can('members.erase')) && (
        <div className="mt-10 flex flex-wrap justify-end gap-2">
          {can('members.deactivate') && !m.deactivatedAt && (
            <Button
              variant="danger"
              size="sm"
              icon={<UserX className="size-4" />}
              onClick={() => setModal('deactivate')}
            >
              {t('admin.members.deactivate')}
            </Button>
          )}
          {can('members.erase') && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 className="size-4" />}
              onClick={() => setModal('erase')}
            >
              {t('admin.members.erase')}
            </Button>
          )}
        </div>
      )}

      {modal === 'edit' && m && (
        <MemberFormModal member={m} onClose={() => setModal(null)} onSaved={() => setModal(null)} />
      )}
      {modal === 'assign' && <AssignMembershipModal memberId={id} onClose={() => setModal(null)} />}
      {modal === 'link' && (
        <LinkCodeModal
          memberId={id}
          onClose={() => {
            setModal(null);
            void qc.invalidateQueries({ queryKey: ['member', id] });
          }}
        />
      )}
      {modal === 'payment' && (
        <RecordPaymentModal
          memberId={id}
          onClose={() => setModal(null)}
          memberships={(memberships.data ?? [])
            .filter((x) => x.state !== 'cancelled')
            .map((x) => ({
              id: x.id,
              label: `${x.planName} · ${f.date(x.startDate)}${x.balanceAmount > 0 ? ` · ${t('admin.memberships.debt')}: ${f.money(x.balanceAmount)}` : ''}`,
              balance: x.balanceAmount,
            }))}
        />
      )}
      <ReasonDialog
        open={modal === 'deactivate'}
        title={t('admin.members.deactivate')}
        consequence={t('admin.members.deactivate_consequence')}
        confirmLabel={t('admin.members.deactivate')}
        onCancel={() => setModal(null)}
        onConfirm={(reason) => deactivate.mutate(reason)}
        loading={deactivate.isPending}
        error={deactivate.error instanceof ApiError ? deactivate.error.message : null}
      />
      <ReasonDialog
        open={modal === 'erase'}
        title={t('admin.members.erase')}
        consequence={t('admin.members.erase_consequence')}
        confirmLabel={t('admin.members.erase_confirm')}
        onCancel={() => setModal(null)}
        onConfirm={(reason) => erase.mutate(reason)}
        loading={erase.isPending}
        error={erase.error instanceof ApiError ? erase.error.message : null}
      />
    </>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold tracking-wider text-text-secondary uppercase">
        {label}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function MembershipsTab({
  id,
  query,
}: {
  id: string;
  query: ReturnType<typeof useQuery<MembershipDto[]>>;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const qc = useQueryClient();
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [ptFor, setPtFor] = useState<MembershipDto | null>(null);
  const [activateFor, setActivateFor] = useState<MembershipDto | null>(null);
  const onPt = can('pt.manage') ? setPtFor : undefined;
  const onActivate = can('memberships.create') ? setActivateFor : undefined;
  const [pausesFor, setPausesFor] = useState<MembershipDto | null>(null);
  const onPauses = can('memberships.pause') ? setPausesFor : undefined;
  const cancel = useMutation({
    mutationFn: (reason: string) => api.post(`/admin/memberships/${cancelId}/cancel`, { reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['member', id] });
      void qc.invalidateQueries({ queryKey: ['members'] });
      toast.success(t('admin.memberships.cancelled'));
      setCancelId(null);
    },
  });

  if (query.isPending) return <TableSkeleton rows={3} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data.length === 0)
    return <EmptyState icon={CalendarCheck} title={t('admin.memberships.empty')} />;
  return (
    <Card>
      <MembershipCards
        items={query.data}
        onCancel={can('memberships.cancel') ? setCancelId : undefined}
        onPt={onPt}
        onActivate={onActivate}
        onPauses={onPauses}
      />
      <div className="hidden md:block">
        <Table>
          <thead>
            <tr>
              <Th>{t('admin.fields.plan')}</Th>
              <Th>{t('admin.fields.status')}</Th>
              <Th>{t('admin.fields.period')}</Th>
              <Th>{t('admin.fields.visits')}</Th>
              <Th className="text-end">{t('admin.fields.price')}</Th>
              <Th className="text-end">{t('admin.memberships.paid')}</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {query.data.map((ms) => (
              <tr key={ms.id} className={cn(ms.state === 'cancelled' && 'opacity-50')}>
                <Td className="font-semibold">{ms.planName}</Td>
                <Td>
                  <StatusBadge status={ms.displayStatus} />
                </Td>
                <Td className="tabular">
                  {f.date(ms.startDate)} - {f.date(ms.endDate)}
                </Td>
                <Td className="tabular">
                  {ms.visitLimit ? `${ms.visitsUsed} / ${ms.visitLimit}` : '-'}
                </Td>
                <Td className="tabular text-end">
                  {f.money(ms.priceAmount, ms.currency)}
                  {ms.promoCode && (
                    <span
                      className="block text-xs text-text-secondary"
                      title={t('admin.promos.code')}
                    >
                      {ms.promoCode} -{f.money(ms.discountAmount, ms.currency)}
                    </span>
                  )}
                </Td>
                <Td
                  className={cn(
                    'tabular text-end',
                    ms.balanceAmount > 0 && ms.state !== 'cancelled' && 'text-status-warning',
                  )}
                >
                  {f.money(ms.paidAmount, ms.currency)}
                </Td>
                <Td className="text-end">
                  {onActivate && ms.state === 'pending' && (
                    <Button size="sm" onClick={() => onActivate(ms)}>
                      {t('admin.memberships.activate')}
                    </Button>
                  )}
                  {onPt && ms.planKind === 'personal_training' && ms.state !== 'cancelled' && (
                    <Button size="sm" variant="secondary" onClick={() => onPt(ms)}>
                      {t('admin.pt.sessions_button')}
                    </Button>
                  )}
                  {onPauses && canPause(ms) && (
                    <Button size="sm" variant="secondary" onClick={() => onPauses(ms)}>
                      {t('admin.pauses.button')}
                    </Button>
                  )}
                  {can('memberships.cancel') && ms.state !== 'cancelled' && (
                    <Button size="sm" variant="ghost" onClick={() => setCancelId(ms.id)}>
                      {t('admin.memberships.cancel')}
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      <ReasonDialog
        open={cancelId !== null}
        title={t('admin.memberships.cancel')}
        consequence={t('admin.memberships.cancel_consequence')}
        confirmLabel={t('admin.memberships.cancel')}
        onCancel={() => setCancelId(null)}
        onConfirm={(reason) => cancel.mutate(reason)}
        loading={cancel.isPending}
        error={cancel.error instanceof ApiError ? cancel.error.message : null}
      />
      {ptFor && <PtSessionsModal membership={ptFor} onClose={() => setPtFor(null)} />}
      {activateFor && (
        <ActivateMembershipModal membership={activateFor} onClose={() => setActivateFor(null)} />
      )}
      {pausesFor && <PausesModal membership={pausesFor} onClose={() => setPausesFor(null)} />}
    </Card>
  );
}

function PaymentsTab({ id }: { id: string }) {
  const { t } = useTranslation();

  const q = useQuery({
    queryKey: ['member', id, 'payments'],
    queryFn: () => api.page<PaymentDto[]>('/admin/payments', { memberId: id, pageSize: 100 }),
  });
  if (q.isPending) return <TableSkeleton rows={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data.items.length === 0)
    return <EmptyState icon={CreditCard} title={t('admin.payments.empty')} />;
  return (
    <Card>
      <PaymentList items={q.data.items} />
    </Card>
  );
}

function AttendanceTab({ id }: { id: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const q = useQuery({
    queryKey: ['member', id, 'attendance'],
    queryFn: () =>
      api.get<
        Array<{
          id: string;
          source: string;
          result: string;
          reasonCode: string;
          occurredAt: string;
          performedByName: string | null;
        }>
      >(`/admin/members/${id}/attendance`),
  });
  if (q.isPending) return <TableSkeleton rows={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data.length === 0)
    return (
      <EmptyState
        icon={CalendarCheck}
        title={t('admin.attendance.empty')}
        description={t('admin.attendance.empty_hint')}
      />
    );
  return (
    <Card>
      <Table>
        <thead>
          <tr>
            <Th>{t('admin.fields.date')}</Th>
            <Th>{t('admin.attendance.result')}</Th>
            <Th>{t('admin.attendance.source')}</Th>
            <Th>{t('admin.fields.recorded_by')}</Th>
          </tr>
        </thead>
        <tbody>
          {q.data.map((a) => (
            <tr key={a.id}>
              <Td className="tabular">{f.dateTime(a.occurredAt)}</Td>
              <Td>
                <Badge tone={a.result === 'granted' ? 'success' : 'danger'}>
                  {t(`admin.attendance.results.${a.result}`)}
                </Badge>
                {a.result === 'denied' && (
                  <span className="ms-2 text-xs text-text-secondary">
                    {t(`admin.attendance.reasons.${a.reasonCode}`, { defaultValue: a.reasonCode })}
                  </span>
                )}
              </Td>
              <Td className="text-text-secondary">{t(`admin.attendance.sources.${a.source}`)}</Td>
              <Td className="text-text-secondary">{a.performedByName ?? '-'}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function NotesTab({ id }: { id: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const q = useQuery({
    queryKey: ['member', id, 'notes'],
    queryFn: () =>
      api.get<Array<{ id: string; body: string; authorName: string; createdAt: string }>>(
        `/admin/members/${id}/notes`,
      ),
  });
  const add = useMutation({
    mutationFn: () => api.post(`/admin/members/${id}/notes`, { body }),
    onSuccess: () => {
      setBody('');
      void qc.invalidateQueries({ queryKey: ['member', id, 'notes'] });
    },
  });
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="p-5 lg:order-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) add.mutate();
          }}
          className="flex flex-col gap-3"
        >
          <Field label={t('admin.notes.new')} hint={t('admin.notes.private_hint')}>
            {(p) => (
              <Textarea
                {...p}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={2000}
              />
            )}
          </Field>
          <Button type="submit" variant="secondary" disabled={!body.trim()} loading={add.isPending}>
            {t('admin.notes.add')}
          </Button>
        </form>
      </Card>
      <div className="lg:col-span-2">
        {q.isPending ? (
          <TableSkeleton rows={2} />
        ) : q.isError ? (
          <ErrorState error={q.error} />
        ) : q.data.length === 0 ? (
          <EmptyState icon={StickyNote} title={t('admin.notes.empty')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {q.data.map((n) => (
              <li key={n.id}>
                <Card className="px-5 py-4">
                  <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                  <p className="mt-2 text-xs text-text-secondary">
                    {n.authorName} · {f.dateTime(n.createdAt)}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AuditTab({ id }: { id: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const q = useQuery({
    queryKey: ['member', id, 'audit'],
    queryFn: () => api.get<AuditEntryDto[]>(`/admin/members/${id}/audit`),
  });
  if (q.isPending) return <TableSkeleton rows={3} />;
  if (q.isError) return <ErrorState error={q.error} />;
  if (q.data.length === 0) return <EmptyState icon={History} title={t('admin.audit.empty')} />;
  return (
    <Card>
      <CardHeader title={t('admin.audit.title')} />
      <ul className="divide-y divide-border-subtle">
        {q.data.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm"
          >
            <span>
              <span className="font-semibold">
                {t(`admin.audit.actions.${a.action.replace('.', '_')}`, { defaultValue: a.action })}
              </span>
              <span className="text-text-secondary"> · {a.actorName ?? '-'}</span>
            </span>
            <span className="tabular text-xs text-text-secondary">{f.dateTime(a.occurredAt)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** F13-2: only a started, active membership with an end date can be paused. */
const canPause = (ms: MembershipDto) =>
  ms.state === 'active' &&
  ms.endDate !== null &&
  ['active', 'expiring_soon', 'paused'].includes(ms.displayStatus);

/** Phone layout for the memberships tab. */
function MembershipCards({
  items,
  onCancel,
  onPt,
  onActivate,
  onPauses,
}: {
  items: MembershipDto[];
  onPauses?: (ms: MembershipDto) => void;
  onCancel?: (id: string) => void;
  onPt?: (ms: MembershipDto) => void;
  onActivate?: (ms: MembershipDto) => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <ul className="divide-y divide-border-subtle md:hidden">
      {items.map((ms) => (
        <li key={ms.id} className={cn('px-4 py-3.5', ms.state === 'cancelled' && 'opacity-60')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{ms.planName}</p>
              <p className="tabular mt-0.5 text-xs text-text-secondary">
                {f.date(ms.startDate)} - {f.date(ms.endDate)}
                {ms.visitLimit ? ` · ${ms.visitsUsed} / ${ms.visitLimit}` : ''}
              </p>
            </div>
            <StatusBadge status={ms.displayStatus} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <span className="tabular text-text-secondary">
              {t('admin.memberships.paid')}:{' '}
              <span
                className={cn(
                  'font-semibold text-text-primary',
                  ms.balanceAmount > 0 && ms.state !== 'cancelled' && 'text-status-warning',
                )}
              >
                {f.money(ms.paidAmount, ms.currency)}
              </span>{' '}
              / {f.money(ms.priceAmount, ms.currency)}
            </span>
            {onActivate && ms.state === 'pending' && (
              <Button size="sm" onClick={() => onActivate(ms)}>
                {t('admin.memberships.activate')}
              </Button>
            )}
            {onPt && ms.planKind === 'personal_training' && ms.state !== 'cancelled' && (
              <Button size="sm" variant="secondary" onClick={() => onPt(ms)}>
                {t('admin.pt.sessions_button')}
              </Button>
            )}
            {onPauses && canPause(ms) && (
              <Button size="sm" variant="secondary" onClick={() => onPauses(ms)}>
                {t('admin.pauses.button')}
              </Button>
            )}
            {onCancel && ms.state !== 'cancelled' && (
              <Button size="sm" variant="ghost" onClick={() => onCancel(ms.id)}>
                {t('admin.memberships.cancel')}
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
