import type { ClassAdminDto } from '@grit/validation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { addDays, clubToday } from '@/lib/format';
import { useCan } from '@/lib/me';
import { ClassTypesTab } from './ClassTypesTab';
import { clubDay, useClassFormat, weekStart } from './classes-utils';
import { SeriesTab } from './SeriesTab';
import { ClassFormModal, SessionModal } from './SessionModal';

type Tab = 'week' | 'series' | 'types';

export function SchedulePage() {
  const { t } = useTranslation();
  const can = useCan();
  const manage = can('classes.manage');
  const [tab, setTab] = useState<Tab>('week');
  return (
    <>
      <PageHeader title={t('admin.classes.title')} subtitle={t('admin.classes.subtitle')} />
      {manage && (
        <div className="mb-4">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'week', label: t('admin.classes.tabs.week') },
              { value: 'series', label: t('admin.classes.tabs.series') },
              { value: 'types', label: t('admin.classes.tabs.types') },
            ]}
          />
        </div>
      )}
      {tab === 'week' && <WeekView />}
      {tab === 'series' && manage && <SeriesTab />}
      {tab === 'types' && manage && <ClassTypesTab />}
    </>
  );
}

function WeekView() {
  const { t, i18n } = useTranslation();
  const fmt = useClassFormat();
  const can = useCan();
  const today = clubToday();
  const [monday, setMonday] = useState(() => weekStart(today));
  const [openId, setOpenId] = useState<string | null>(null);
  const [creatingOn, setCreatingOn] = useState<string | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);

  const q = useQuery({
    queryKey: ['classes', monday, i18n.language],
    queryFn: () =>
      api.get<ClassAdminDto[]>('/admin/classes', {
        from: monday,
        to: addDays(monday, 6),
        locale: i18n.language,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const byDay = useMemo(() => {
    const m = new Map<string, ClassAdminDto[]>();
    for (const c of q.data ?? []) {
      const d = clubDay(c.startsAt);
      m.set(d, [...(m.get(d) ?? []), c]);
    }
    return m;
  }, [q.data]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconButton
            label={t('admin.classes.prev_week')}
            onClick={() => setMonday(addDays(monday, -7))}
          >
            <ChevronLeft className="size-4" />
          </IconButton>
          <IconButton
            label={t('admin.classes.next_week')}
            onClick={() => setMonday(addDays(monday, 7))}
          >
            <ChevronRight className="size-4" />
          </IconButton>
          <Button variant="ghost" size="sm" onClick={() => setMonday(weekStart(today))}>
            {t('admin.classes.this_week')}
          </Button>
          <span className="tabular ms-1 text-sm font-semibold text-text-secondary">
            {fmt.day(days[0]!)} - {fmt.day(days[6]!)}
          </span>
        </div>
        {can('classes.manage') && (
          <Button icon={<Plus className="size-4" />} onClick={() => setCreatingOn(today)}>
            {t('admin.classes.new_session')}
          </Button>
        )}
      </div>

      {q.isPending ? (
        <Skeleton className="h-96" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (q.data ?? []).length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title={t('admin.classes.empty_week')}
            description={can('classes.manage') ? t('admin.classes.empty_week_hint') : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-7">
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            const isToday = d === today;
            return (
              <section
                key={d}
                aria-label={fmt.dayLong(d)}
                className={cn(
                  'flex min-w-0 flex-col gap-2 rounded-md border border-border-subtle bg-bg-surface p-2',
                  isToday && 'border-accent-500/60',
                  items.length === 0 && 'max-lg:hidden',
                )}
              >
                <h2
                  className={cn(
                    'px-1 pt-1 text-xs font-semibold tracking-wide uppercase',
                    isToday ? 'text-accent-400' : 'text-text-secondary',
                  )}
                >
                  <span className="lg:hidden">{fmt.dayLong(d)}</span>
                  <span className="max-lg:hidden">{fmt.day(d)}</span>
                </h2>
                {items.map((c) => (
                  <SessionChip key={c.id} c={c} onOpen={() => setOpenId(c.id)} />
                ))}
              </section>
            );
          })}
        </div>
      )}

      {openId && <SessionModal classId={openId} onClose={() => setOpenId(null)} />}
      {creatingOn && <ClassFormModal date={creatingOn} onClose={() => setCreatingOn(null)} />}
    </>
  );
}

function SessionChip({ c, onOpen }: { c: ClassAdminDto; onOpen: () => void }) {
  const { t } = useTranslation();
  const fmt = useClassFormat();
  const cancelled = c.status === 'cancelled';
  const full = c.spotsLeft === 0;
  const past = new Date(c.endsAt) < new Date();
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex w-full flex-col gap-1 rounded-sm border border-border-subtle bg-bg-surface2 p-2.5 text-start transition-colors hover:border-border-strong',
        (cancelled || past) && 'opacity-60',
      )}
      style={{ borderInlineStartColor: c.color, borderInlineStartWidth: 3 }}
    >
      <span className="tabular text-xs font-semibold text-text-secondary">
        {fmt.time(c.startsAt)}-{fmt.time(c.endsAt)}
      </span>
      <span className={cn('truncate text-sm font-semibold', cancelled && 'line-through')}>
        {c.typeName}
      </span>
      {c.trainer && <span className="truncate text-xs text-text-secondary">{c.trainer.name}</span>}
      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
        {cancelled ? (
          <span className="font-semibold text-status-danger">{t('admin.classes.cancelled')}</span>
        ) : (
          <>
            <span
              className={cn(
                'tabular rounded-xs px-1.5 py-0.5 font-semibold',
                full
                  ? 'bg-status-warning/15 text-status-warning'
                  : 'bg-bg-surface text-text-primary',
              )}
            >
              {t('admin.classes.booked_of', { booked: c.booked, capacity: c.capacity })}
            </span>
            {c.waitlisted > 0 && (
              <span className="tabular text-text-secondary">
                {t('admin.classes.waitlist_count', { count: c.waitlisted })}
              </span>
            )}
          </>
        )}
      </span>
    </button>
  );
}
