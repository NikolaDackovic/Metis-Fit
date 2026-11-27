import type {
  AccessResultDto,
  MemberDto,
  MemberListItemDto,
  MembershipDto,
} from '@grit/validation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck,
  Camera,
  CheckCircle2,
  Coffee,
  CreditCard,
  IdCard,
  KeyRound,
  Maximize,
  Receipt,
  ScanLine,
  Search,
  ShoppingBag,
  UserPlus,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { MemberAvatar } from '@/components/MemberAvatar';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Input } from '@/components/ui/Field';
import { Card } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useCan } from '@/lib/me';
import { RecordPaymentModal } from '../payments/PaymentActions';
import { AssignMembershipModal } from '../members/AssignMembershipModal';
import { MemberFormModal } from '../members/MemberFormModal';
import { CameraScanner, cameraScanSupported } from './CameraScanner';
import { RecentAttempts, ResultPanel } from './CheckinPage';
import { InsideNow } from './InsideNow';
import { beep } from './sound';

const TERMINAL = 'reception-1';
/** A scanner types a long token without spaces; anything else is a search (name, phone, number). */
const looksLikeToken = (v: string) => v.length >= 20 && !/\s/.test(v);

/** The membership the desk cares about: valid now, else waiting, else the newest one. */
function currentOf(list: MembershipDto[] | undefined) {
  const live = (list ?? []).filter((m) => m.state !== 'cancelled');
  return (
    live.find((m) => m.displayStatus === 'active' || m.displayStatus === 'expiring_soon') ??
    live.find((m) => m.displayStatus === 'pending' || m.displayStatus === 'paused') ??
    live[0] ??
    null
  );
}

/** A big action button; hidden when the staff member is not allowed to do it. */
function Action({
  icon: Icon,
  label,
  hint,
  onClick,
  to,
  tone = 'default',
  loading,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onClick?: () => void;
  to?: string;
  tone?: 'default' | 'primary' | 'warning';
  loading?: boolean;
}) {
  const cls = cn(
    'flex min-h-24 flex-col items-start justify-between gap-2 rounded-md border p-4 text-start transition-colors disabled:opacity-60',
    tone === 'primary'
      ? 'border-accent-500 bg-accent-500 text-on-accent hover:bg-accent-600'
      : tone === 'warning'
        ? 'border-status-warning/60 bg-status-warning/10 hover:bg-status-warning/20'
        : 'border-border-subtle bg-bg-surface hover:border-border-strong hover:bg-bg-surface2',
  );
  const body: ReactNode = (
    <>
      <Icon className="size-6 shrink-0" aria-hidden />
      <span>
        <span className="block text-base font-semibold">{label}</span>
        {hint && (
          <span className={cn('block text-xs', tone === 'primary' ? '' : 'text-text-secondary')}>
            {hint}
          </span>
        )}
      </span>
    </>
  );
  if (to)
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} disabled={loading} className={cls}>
      {body}
    </button>
  );
}

/**
 * Reception mode: one screen for the desk. Scan or search, see the member at a glance, then one
 * click for the usual jobs: check in, renew, take a payment, sell, locker, booking, new member.
 * Every button follows the staff member's permissions (the owner decides what the desk may do).
 */
export function ReceptionPage() {
  const { t } = useTranslation();
  const can = useCan();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [camera, setCamera] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [scan, setScan] = useState<AccessResultDto | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [modal, setModal] = useState<'assign' | 'payment' | 'new' | null>(null);
  const refocus = () => setTimeout(() => inputRef.current?.focus(), 0);

  useEffect(() => {
    refocus();
  }, []);
  useEffect(() => {
    const id = setTimeout(() => setTerm(looksLikeToken(text.trim()) ? '' : text.trim()), 250);
    return () => clearTimeout(id);
  }, [text]);

  const search = useQuery({
    queryKey: ['members', { q: term, reception: true }],
    queryFn: () => api.page<MemberListItemDto[]>('/admin/members', { q: term, pageSize: 6 }),
    enabled: term.length >= 2,
    placeholderData: keepPreviousData,
  });
  const member = useQuery({
    queryKey: ['member', memberId],
    queryFn: () => api.get<MemberDto>(`/admin/members/${memberId}`),
    enabled: Boolean(memberId),
  });
  const memberships = useQuery({
    queryKey: ['member', memberId, 'memberships'],
    queryFn: () => api.get<MembershipDto[]>(`/admin/members/${memberId}/memberships`),
    enabled: Boolean(memberId),
  });

  const afterAccess = (r: AccessResultDto) => {
    setScan(r);
    setScanError(null);
    beep(r.result === 'granted');
    if (r.member) setMemberId(r.member.id);
    void qc.invalidateQueries({ queryKey: ['checkin', 'recent'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    refocus();
  };
  const accessError = (e: unknown) => {
    setScanError(e instanceof ApiError ? e.message : 'errors.internal');
    beep(false);
    refocus();
  };
  const validate = useMutation({
    mutationFn: (token: string) =>
      api.post<AccessResultDto>('/admin/access/validate', { token, terminalId: TERMINAL }),
    onSuccess: afterAccess,
    onError: accessError,
  });
  const checkin = useMutation({
    mutationFn: (id: string) =>
      api.post<AccessResultDto>('/admin/access/manual', { memberId: id, terminalId: TERMINAL }),
    onSuccess: afterAccess,
    onError: accessError,
  });

  const pick = (id: string) => {
    setMemberId(id);
    setScan(null);
    setScanError(null);
    setText('');
    setTerm('');
  };
  const submit = () => {
    const v = text.trim();
    if (!v) return;
    if (looksLikeToken(v)) {
      setText('');
      validate.mutate(v);
    } else if (search.data?.items.length === 1) pick(search.data.items[0]!.id);
  };
  const clear = () => {
    setMemberId(null);
    setScan(null);
    setScanError(null);
    refocus();
  };

  const m = member.data;
  const current = currentOf(memberships.data);
  const debt = (memberships.data ?? [])
    .filter((x) => x.state !== 'cancelled')
    .reduce((s, x) => s + Math.max(0, x.balanceAmount), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-[1_1_16rem]">
          <h1 className="font-display text-2xl tracking-tight uppercase">
            {t('admin.reception.title')}
          </h1>
          <p className="text-sm text-text-secondary">{t('admin.reception.subtitle')}</p>
        </div>
        {can('members.create') && (
          <Button icon={<UserPlus className="size-4" />} onClick={() => setModal('new')}>
            {t('admin.reception.new_member')}
          </Button>
        )}
        {/* Full screen is for the desk computer; phones are already full screen. */}
        <span className="hidden sm:inline-flex">
          <Button
            variant="ghost"
            icon={<Maximize className="size-4" />}
            onClick={() => void document.documentElement.requestFullscreen?.()}
          >
            {t('admin.reception.fullscreen')}
          </Button>
        </span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="flex gap-3"
            >
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-text-muted" />
                <Input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t('admin.reception.search')}
                  aria-label={t('admin.reception.search')}
                  autoComplete="off"
                  spellCheck={false}
                  className="h-16 ps-12 text-lg"
                />
              </div>
              {cameraScanSupported() && (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-16 px-5"
                  icon={<Camera className="size-5" />}
                  aria-label={t(camera ? 'admin.checkin.camera_off' : 'admin.checkin.camera_on')}
                  onClick={() => setCamera((c) => !c)}
                />
              )}
            </form>
            {camera && (
              <div className="mt-4 max-w-md">
                <CameraScanner onScan={(v) => validate.mutate(v)} paused={validate.isPending} />
              </div>
            )}
            {term.length >= 2 && (
              <ul className="mt-3 divide-y divide-border-subtle rounded-sm border border-border-subtle">
                {search.data?.items.length === 0 && (
                  <li className="px-4 py-4 text-sm text-text-secondary">
                    {t('admin.members.no_results')}
                  </li>
                )}
                {search.data?.items.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => pick(r.id)}
                      className="flex w-full items-center gap-4 px-4 py-3 text-start hover:bg-bg-surface2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold">
                          {r.firstName} {r.lastName}
                        </p>
                        <p className="tabular truncate text-sm text-text-secondary">
                          {r.memberNumber} · {r.phone ?? r.email ?? ''}
                        </p>
                      </div>
                      <StatusBadge status={r.currentStatus} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {(scan || scanError) && (
            <ResultPanel
              result={scan}
              error={scanError}
              canOverride={can('attendance.override')}
              onOverridden={afterAccess}
            />
          )}

          {memberId && (
            <MemberCard
              member={m ?? null}
              current={current}
              debt={debt}
              onClose={clear}
              actions={
                <>
                  {can('attendance.checkin') && (
                    <Action
                      icon={CheckCircle2}
                      tone="primary"
                      label={t('admin.reception.checkin')}
                      hint={t('admin.reception.checkin_hint')}
                      loading={checkin.isPending}
                      onClick={() => memberId && checkin.mutate(memberId)}
                    />
                  )}
                  {can('payments.create') && debt > 0 && (
                    <Action
                      icon={CreditCard}
                      tone="warning"
                      label={t('admin.reception.pay_debt')}
                      onClick={() => setModal('payment')}
                    />
                  )}
                  {can('memberships.create') && (
                    <Action
                      icon={IdCard}
                      label={t('admin.reception.renew')}
                      hint={t('admin.reception.renew_hint')}
                      onClick={() => setModal('assign')}
                    />
                  )}
                  {can('payments.create') && debt === 0 && (
                    <Action
                      icon={Receipt}
                      label={t('admin.reception.payment')}
                      onClick={() => setModal('payment')}
                    />
                  )}
                  {can('services.sell') && (
                    <Action icon={ShoppingBag} label={t('admin.reception.sell')} to="/services" />
                  )}
                  {can('cafe.orders') && (
                    <Action icon={Coffee} label={t('admin.reception.cafe')} to="/cafe" />
                  )}
                  {can('lockers.manage') && (
                    <Action icon={KeyRound} label={t('admin.reception.locker')} to="/lockers" />
                  )}
                  {can('classes.roster') && (
                    <Action icon={CalendarCheck} label={t('admin.reception.book')} to="/schedule" />
                  )}
                  <Action
                    icon={UserRound}
                    label={t('admin.reception.profile')}
                    to={`/members/${memberId}`}
                  />
                </>
              }
            />
          )}

          {!memberId && !scan && !scanError && (
            <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <ScanLine className="size-10 text-accent-400" aria-hidden />
              <p className="text-lg font-semibold">{t('admin.reception.waiting')}</p>
              <p className="max-w-md text-sm text-text-secondary">
                {t('admin.reception.waiting_hint')}
              </p>
            </Card>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <InsideNow />
          <RecentAttempts />
        </div>
      </div>

      {modal === 'assign' && memberId && (
        <AssignMembershipModal
          memberId={memberId}
          onClose={() => {
            setModal(null);
            void qc.invalidateQueries({ queryKey: ['member', memberId] });
          }}
        />
      )}
      {modal === 'payment' && memberId && (
        <RecordPaymentModal
          memberId={memberId}
          onClose={() => {
            setModal(null);
            void qc.invalidateQueries({ queryKey: ['member', memberId] });
          }}
          memberships={(memberships.data ?? [])
            .filter((x) => x.state !== 'cancelled')
            .map((x) => ({ id: x.id, label: x.planName, balance: x.balanceAmount }))}
        />
      )}
      {modal === 'new' && (
        <MemberFormModal
          onClose={() => setModal(null)}
          onSaved={(saved) => {
            setModal(null);
            toast.success(t('admin.reception.member_created'));
            pick(saved.id);
            if (can('memberships.create')) setModal('assign');
            else navigate(`/members/${saved.id}`);
          }}
        />
      )}
    </div>
  );
}

function MemberCard({
  member,
  current,
  debt,
  onClose,
  actions,
}: {
  member: MemberDto | null;
  current: MembershipDto | null;
  debt: number;
  onClose: () => void;
  actions: ReactNode;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-5 border-b border-border-subtle p-5">
        <MemberAvatar
          url={member?.photoUrl ?? null}
          firstName={member?.firstName ?? ''}
          lastName={member?.lastName ?? ''}
          className="size-20"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-2xl font-bold">
            {member ? `${member.firstName} ${member.lastName}` : ' '}
          </p>
          <p className="tabular text-sm text-text-secondary">
            {member?.memberNumber}
            {member?.phone ? ` · ${member.phone}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {current ? (
              <>
                <span className="font-semibold">{current.planName}</span>
                <StatusBadge status={current.displayStatus} />
                {current.endDate && (
                  <span className="tabular text-text-secondary">
                    {t('admin.dashboard.until', { date: f.date(current.endDate) })}
                  </span>
                )}
                {current.visitsRemaining !== null && (
                  <span className="tabular text-text-secondary">
                    {t('admin.memberships.visits_left', { count: current.visitsRemaining })}
                  </span>
                )}
              </>
            ) : (
              <span className="font-semibold text-status-warning">
                {t('admin.reception.no_membership')}
              </span>
            )}
          </div>
          {debt > 0 && (
            <p className="mt-2 inline-block rounded-sm border border-status-warning/50 bg-status-warning/10 px-3 py-1 text-sm font-semibold text-status-warning">
              {t('admin.checkin.debt_warning', { amount: f.money(debt) })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-10 items-center justify-center rounded-sm text-text-secondary hover:bg-bg-surface2 hover:text-text-primary"
          aria-label={t('admin.reception.next')}
          title={t('admin.reception.next')}
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-3">{actions}</div>
    </Card>
  );
}
