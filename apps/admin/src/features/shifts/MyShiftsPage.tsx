import type { ClockStatusDto, ShiftWeekDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarOff, LogIn, LogOut, Timer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Card, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { clubToday, useFormat } from '@/lib/format';
import { useCan } from '@/lib/me';
import { minutesLabel, mondayOf, tint, useWeekdayNames } from './shared';
import { WeekNav, WeekTable } from './WeekTable';

/** Moje smene: my week, clock in / out, my hours this month. Trainers, reception, café... */
export function MyShiftsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const [monday, setMonday] = useState(mondayOf(clubToday()));
  const [all, setAll] = useState(false);
  const canAll = can('shifts.view');
  const week = useQuery({
    queryKey: ['shifts', all ? 'week' : 'mine', monday],
    queryFn: () =>
      api.get<ShiftWeekDto>(all ? '/admin/shifts/week' : '/admin/my-shifts', { start: monday }),
  });
  return (
    <>
      <PageHeader title={t('admin.shifts.my_title')} subtitle={t('admin.shifts.my_subtitle')} />
      <div className="flex flex-col gap-4">
        <ClockCard />
        <div className="flex flex-wrap items-center gap-3">
          <WeekNav monday={monday} onChange={setMonday} />
          {canAll && (
            <label className="ms-auto flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-accent-500)]"
                checked={all}
                onChange={(e) => setAll(e.target.checked)}
              />
              {t('admin.shifts.show_everyone')}
            </label>
          )}
        </div>
        {week.isPending ? (
          <Skeleton className="h-60" />
        ) : week.isError ? (
          <ErrorState error={week.error} onRetry={() => void week.refetch()} />
        ) : all ? (
          <WeekTable week={week.data} />
        ) : (
          <MyWeek week={week.data} />
        )}
      </div>
    </>
  );
}

function MyWeek({ week }: { week: ShiftWeekDto }) {
  const { t } = useTranslation();
  const f = useFormat();
  const wd = useWeekdayNames();
  const today = clubToday();
  const typeOf = new Map(week.shiftTypes.map((s) => [s.id, s]));
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
      {week.days.map((d) => {
        const shifts = week.assignments.filter((a) => a.date === d.date);
        const absence = week.absences.find((a) => a.date === d.date);
        return (
          <Card
            key={d.date}
            className={cn(
              'flex min-h-28 flex-col gap-2 p-3',
              d.date === today && 'ring-2 ring-accent-500',
            )}
          >
            <p className="text-sm font-semibold">
              {wd.long(d.weekday)}
              <span className="block text-xs font-normal text-text-secondary">
                {f.date(d.date)}
              </span>
            </p>
            {d.closure && (
              <span className="flex items-center gap-1 text-xs text-status-warning">
                <CalendarOff className="size-3" /> {d.closure.name}
              </span>
            )}
            {shifts.map((a) => {
              const s = typeOf.get(a.shiftTypeId);
              return (
                <span
                  key={a.shiftTypeId}
                  className="rounded-xs px-2 py-1.5 text-sm font-semibold"
                  style={{
                    background: tint(s?.color ?? '#888888'),
                    borderInlineStart: `3px solid ${s?.color ?? '#888888'}`,
                  }}
                >
                  {s?.name}
                  <span className="block text-xs font-normal">
                    {s?.startsAt} - {s?.endsAt}
                  </span>
                </span>
              );
            })}
            {absence && <Badge tone="info">{t(`admin.shifts.kinds.${absence.kind}`)}</Badge>}
            {!shifts.length && !absence && !d.closure?.isClosed && (
              <span className="text-xs text-text-muted">{t('admin.shifts.day_off')}</span>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function ClockCard() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['timeclock'],
    queryFn: () => api.get<ClockStatusDto>('/admin/timeclock'),
    refetchInterval: 60_000,
  });
  const act = useMutation({
    mutationFn: (dir: 'in' | 'out') => api.post<ClockStatusDto>(`/admin/timeclock/${dir}`),
    onSuccess: (data, dir) => {
      qc.setQueryData(['timeclock'], data);
      void qc.invalidateQueries({ queryKey: ['payroll'] });
      toast.success(t(dir === 'in' ? 'admin.shifts.clocked_in' : 'admin.shifts.clocked_out'));
    },
  });
  if (q.isPending) return <Skeleton className="h-28" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const open = q.data.open;
  return (
    <Card className="flex flex-wrap items-center gap-4 p-4">
      <span
        className={cn(
          'flex size-12 items-center justify-center rounded-full',
          open ? 'bg-status-success/15 text-status-success' : 'bg-bg-surface2 text-text-secondary',
        )}
      >
        <Timer className="size-6" />
      </span>
      <div className="min-w-48 flex-1">
        <p className="font-semibold">
          {open
            ? t('admin.shifts.working_since', { time: f.time(open.clockIn) })
            : t('admin.shifts.not_working')}
        </p>
        <p className="text-sm text-text-secondary">
          {t('admin.shifts.month_summary', {
            days: q.data.monthDays,
            hours: minutesLabel(q.data.monthMinutes),
          })}
        </p>
      </div>
      <Button
        size="lg"
        variant={open ? 'secondary' : 'primary'}
        icon={open ? <LogOut className="size-5" /> : <LogIn className="size-5" />}
        loading={act.isPending}
        onClick={() => act.mutate(open ? 'out' : 'in')}
      >
        {t(open ? 'admin.shifts.clock_out' : 'admin.shifts.clock_in')}
      </Button>
      {act.error && (
        <p role="alert" className="w-full text-sm text-status-danger">
          {t(act.error instanceof ApiError ? act.error.message : 'errors.internal')}
        </p>
      )}
    </Card>
  );
}
