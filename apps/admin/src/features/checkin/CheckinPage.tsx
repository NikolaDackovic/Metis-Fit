import type { AccessResultDto, AttendanceRowDto, MemberListItemDto } from '@grit/validation';
import { MemberAvatar } from '@/components/MemberAvatar';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Camera,
  CheckCircle2,
  ScanLine,
  Search,
  ShieldCheck,
  UserPlus,
  XCircle,
  MonitorSmartphone,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Input } from '@/components/ui/Field';
import { ReasonDialog } from '@/components/ui/ReasonDialog';
import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/States';
import { api, ApiError } from '@/lib/api';
import { clubToday, useFormat } from '@/lib/format';
import { useCan } from '@/lib/me';
import { CameraScanner, cameraScanSupported } from './CameraScanner';
import { InsideNow } from './InsideNow';
import { beep } from './sound';

const TERMINAL = 'reception-1';

/**
 * Reception check-in (docs/DESIGN_SYSTEM.md §7). Primary input: USB/Bluetooth 2D scanner,
 * which types the token into the always-focused field and presses Enter.
 */
export function CheckinPage() {
  const { t } = useTranslation();
  const can = useCan();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState('');
  const [result, setResult] = useState<AccessResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);

  const refocus = () => setTimeout(() => inputRef.current?.focus(), 0);

  const onResult = (r: AccessResultDto) => {
    setResult(r);
    setError(null);
    beep(r.result === 'granted');
    void qc.invalidateQueries({ queryKey: ['checkin', 'recent'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    refocus();
  };
  const onError = (e: unknown) => {
    setError(e instanceof ApiError ? e.message : 'errors.internal');
    beep(false);
    refocus();
  };

  const validate = useMutation({
    mutationFn: (value: string) =>
      api.post<AccessResultDto>('/admin/access/validate', { token: value, terminalId: TERMINAL }),
    onSuccess: onResult,
    onError,
  });
  const manual = useMutation({
    mutationFn: (memberId: string) =>
      api.post<AccessResultDto>('/admin/access/manual', { memberId, terminalId: TERMINAL }),
    onSuccess: onResult,
    onError,
  });

  useEffect(() => {
    refocus();
  }, []);

  const submitToken = (value: string) => {
    const v = value.trim();
    if (!v || validate.isPending) return;
    setToken('');
    validate.mutate(v);
  };

  return (
    <>
      <PageHeader
        title={t('admin.checkin.title')}
        subtitle={t('admin.checkin.subtitle')}
        actions={
          <a
            href="/kiosk"
            target="_blank"
            rel="noopener"
            title={t('admin.kiosk.open_hint')}
            className="inline-flex h-10 items-center gap-2 rounded-sm border border-border-strong px-4 text-sm font-semibold hover:bg-bg-surface2"
          >
            <MonitorSmartphone className="size-4" aria-hidden />
            {t('admin.kiosk.open')}
          </a>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card className="p-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitToken(token);
              }}
              className="flex flex-col gap-3"
            >
              <label htmlFor="scan" className="flex items-center gap-2 text-sm font-semibold">
                <ScanLine className="size-4 text-accent-400" aria-hidden />
                {t('admin.checkin.scan_label')}
              </label>
              <Input
                id="scan"
                ref={inputRef}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={t('admin.checkin.scan_placeholder')}
                autoComplete="off"
                spellCheck={false}
                className="h-12 font-mono"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={validate.isPending} disabled={!token.trim()}>
                  {t('admin.checkin.check')}
                </Button>
                {cameraScanSupported() && (
                  <Button
                    variant="secondary"
                    icon={<Camera className="size-4" />}
                    onClick={() => setCamera((c) => !c)}
                  >
                    {t(camera ? 'admin.checkin.camera_off' : 'admin.checkin.camera_on')}
                  </Button>
                )}
              </div>
              <p className="text-xs text-text-secondary">{t('admin.checkin.scanner_hint')}</p>
            </form>
            {camera && (
              <div className="mt-4">
                <CameraScanner onScan={(v) => submitToken(v)} paused={validate.isPending} />
              </div>
            )}
          </Card>

          <ManualCheckin onCheckin={(id) => manual.mutate(id)} pending={manual.isPending} />
        </div>

        <div className="flex flex-col gap-6">
          <ResultPanel
            result={result}
            error={error}
            canOverride={can('attendance.override')}
            onOverridden={onResult}
          />
          <InsideNow />
          <RecentAttempts />
        </div>
      </div>
    </>
  );
}

export function ResultPanel({
  result,
  error,
  canOverride,
  onOverridden,
}: {
  result: AccessResultDto | null;
  error: string | null;
  canOverride: boolean;
  onOverridden: (r: AccessResultDto) => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const [overriding, setOverriding] = useState(false);
  const override = useMutation({
    mutationFn: (reason: string) =>
      api.post<AccessResultDto>('/admin/access/override', {
        memberId: result!.member!.id,
        reason,
        terminalId: TERMINAL,
      }),
    onSuccess: (r) => {
      setOverriding(false);
      onOverridden(r);
    },
  });

  if (error) {
    return (
      <Card className="border-status-danger/50 p-8 text-center">
        <p role="alert" className="text-lg font-semibold text-status-danger">
          {t(error, { defaultValue: t('errors.internal') })}
        </p>
      </Card>
    );
  }
  if (!result) {
    return (
      <Card>
        <EmptyState
          icon={ScanLine}
          title={t('admin.checkin.waiting')}
          description={t('admin.checkin.waiting_hint')}
        />
      </Card>
    );
  }

  const granted = result.result === 'granted';
  const debt = result.warnings.find((w) => w.code === 'DEBT');
  return (
    <section
      aria-live="assertive"
      className={cn(
        'overflow-hidden rounded-md border',
        granted
          ? 'border-status-success/60 bg-status-success/10'
          : 'border-status-danger/60 bg-status-danger/10',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-3 px-6 py-4 text-on-accent',
          granted ? 'bg-status-success' : 'bg-status-danger',
        )}
      >
        {granted ? (
          <CheckCircle2 className="size-8" aria-hidden />
        ) : (
          <XCircle className="size-8" aria-hidden />
        )}
        <p className="font-display text-xl tracking-tight uppercase">
          {t(granted ? 'admin.checkin.granted' : 'admin.checkin.denied')}
        </p>
      </div>
      <div className="flex flex-col gap-4 px-6 py-5">
        {result.member ? (
          <div className="flex items-center gap-4">
            <MemberAvatar
              url={result.member.photoUrl}
              firstName={result.member.firstName}
              lastName={result.member.lastName}
              className="size-20"
            />
            <div className="min-w-0">
              <Link
                to={`/members/${result.member.id}`}
                className="text-3xl font-bold hover:text-accent-400"
              >
                {result.member.firstName} {result.member.lastName}
              </Link>
              <p className="tabular text-sm text-text-secondary">{result.member.memberNumber}</p>
            </div>
          </div>
        ) : (
          <p className="text-xl font-bold">{t('admin.checkin.unknown_member')}</p>
        )}

        {result.reasonCode !== 'OK' && (
          <p
            className={cn(
              'text-lg font-semibold',
              granted ? 'text-text-primary' : 'text-status-danger',
            )}
          >
            {t(`admin.attendance.reasons.${result.reasonCode}`, {
              defaultValue: result.reasonCode,
            })}
          </p>
        )}

        {result.membership && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="font-semibold">{result.membership.planName}</span>
            <StatusBadge status={result.membership.displayStatus} />
            {result.membership.endDate && (
              <span className="tabular text-text-secondary">
                {t('admin.dashboard.until', { date: f.date(result.membership.endDate) })}
              </span>
            )}
            {result.membership.visitsRemaining !== null && (
              <span className="tabular text-text-secondary">
                {t('admin.memberships.visits_left', { count: result.membership.visitsRemaining })}
              </span>
            )}
          </div>
        )}

        {debt && (
          <p className="rounded-sm border border-status-warning/50 bg-status-warning/10 px-3 py-2 text-sm font-semibold text-status-warning">
            {t('admin.checkin.debt_warning', { amount: f.money(debt.amount, debt.currency) })}
          </p>
        )}

        {!granted && result.member && (
          <div className="flex flex-wrap gap-2 pt-1">
            {canOverride && (
              <Button
                variant="secondary"
                icon={<ShieldCheck className="size-4" />}
                onClick={() => setOverriding(true)}
              >
                {t('admin.checkin.override')}
              </Button>
            )}
            <Link to={`/members/${result.member.id}`}>
              <Button variant="ghost" icon={<UserPlus className="size-4" />}>
                {t('admin.checkin.open_member')}
              </Button>
            </Link>
          </div>
        )}
      </div>
      <ReasonDialog
        open={overriding}
        title={t('admin.checkin.override')}
        consequence={t('admin.checkin.override_consequence')}
        confirmLabel={t('admin.checkin.override_confirm')}
        onCancel={() => setOverriding(false)}
        onConfirm={(reason) => override.mutate(reason)}
        loading={override.isPending}
        error={override.error instanceof ApiError ? override.error.message : null}
      />
    </section>
  );
}

function ManualCheckin({
  onCheckin,
  pending,
}: {
  onCheckin: (memberId: string) => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);
  const results = useQuery({
    queryKey: ['members', { q: debounced, checkin: true }],
    queryFn: () => api.page<MemberListItemDto[]>('/admin/members', { q: debounced, pageSize: 6 }),
    enabled: debounced.length >= 2,
    placeholderData: keepPreviousData,
  });

  return (
    <Card>
      <CardHeader title={t('admin.checkin.manual_title')} />
      <div className="flex flex-col gap-3 p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('admin.members.search_placeholder')}
            aria-label={t('admin.checkin.manual_title')}
            className="ps-9"
          />
        </div>
        {debounced.length >= 2 && (
          <ul className="divide-y divide-border-subtle rounded-sm border border-border-subtle">
            {results.data?.items.length === 0 && (
              <li className="px-4 py-3 text-sm text-text-secondary">
                {t('admin.members.no_results')}
              </li>
            )}
            {results.data?.items.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {m.firstName} {m.lastName}
                  </p>
                  <p className="tabular truncate text-xs text-text-secondary">
                    {m.memberNumber} · {m.phone ?? m.email ?? ''}
                  </p>
                </div>
                <StatusBadge status={m.currentStatus} />
                <Button
                  size="sm"
                  variant="secondary"
                  loading={pending}
                  onClick={() => onCheckin(m.id)}
                >
                  {t('admin.checkin.check')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-text-secondary">{t('admin.checkin.manual_hint')}</p>
      </div>
    </Card>
  );
}

export function RecentAttempts() {
  const { t } = useTranslation();
  const f = useFormat();
  const today = clubToday();
  const q = useQuery({
    queryKey: ['checkin', 'recent'],
    queryFn: () =>
      api.page<AttendanceRowDto[]>('/admin/attendance', { from: today, to: today, pageSize: 10 }),
    refetchInterval: 30_000,
  });
  return (
    <Card>
      <CardHeader title={t('admin.checkin.recent')} />
      {!q.data?.items.length ? (
        <p className="px-5 py-4 text-sm text-text-secondary">{t('admin.checkin.no_recent')}</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {q.data.items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              {a.result === 'granted' ? (
                <CheckCircle2
                  className="size-4 shrink-0 text-status-success"
                  aria-label={t('admin.attendance.results.granted')}
                />
              ) : (
                <XCircle
                  className="size-4 shrink-0 text-status-danger"
                  aria-label={t('admin.attendance.results.denied')}
                />
              )}
              <span className="min-w-0 flex-1 truncate font-semibold">
                {a.memberName ?? t('admin.checkin.unknown_member')}
              </span>
              <span className="hidden truncate text-text-secondary sm:inline">
                {a.result === 'denied' || a.reasonCode === 'OVERRIDE'
                  ? t(`admin.attendance.reasons.${a.reasonCode}`, { defaultValue: a.reasonCode })
                  : t(`admin.attendance.sources.${a.source}`)}
              </span>
              <span className="tabular shrink-0 text-text-secondary">
                {f.dateTime(a.occurredAt).split(' ').pop()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
