import type { ShiftWeekDto } from '@grit/validation';
import { CalendarOff, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { addDays, clubToday, useFormat } from '@/lib/format';
import { mondayOf, tint, useWeekdayNames } from './shared';

/** Week navigation: previous / this week / next, with the date range. */
export function WeekNav({
  monday,
  onChange,
  print,
}: {
  monday: string;
  onChange: (monday: string) => void;
  print?: boolean;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const thisWeek = mondayOf(clubToday());
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <IconButton
        label={t('admin.classes.prev_week')}
        onClick={() => onChange(addDays(monday, -7))}
      >
        <ChevronLeft className="size-4" />
      </IconButton>
      <span className="min-w-44 text-center text-sm font-semibold">
        {f.date(monday)} - {f.date(addDays(monday, 6))}
      </span>
      <IconButton label={t('admin.classes.next_week')} onClick={() => onChange(addDays(monday, 7))}>
        <ChevronRight className="size-4" />
      </IconButton>
      {monday !== thisWeek && (
        <Button variant="ghost" onClick={() => onChange(thisWeek)}>
          {t('admin.classes.this_week')}
        </Button>
      )}
      {print && (
        <Button
          variant="ghost"
          className="ms-auto"
          icon={<Printer className="size-4" />}
          onClick={() => window.print()}
        >
          {t('admin.shifts.print')}
        </Button>
      )}
    </div>
  );
}

/**
 * The weekly table the club asked for: days in columns, shifts in rows, colored names in the
 * cells; absent people in their own row; closed days greyed out with the holiday name.
 */
export function WeekTable({ week, highlight }: { week: ShiftWeekDto; highlight?: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const wd = useWeekdayNames();
  const today = clubToday();
  const types = week.shiftTypes.filter(
    (s) => s.isActive || week.assignments.some((a) => a.shiftTypeId === s.id),
  );
  const at = (date: string, shiftTypeId: string) =>
    week.assignments.filter((a) => a.date === date && a.shiftTypeId === shiftTypeId);

  return (
    <div className="overflow-x-auto rounded-md border border-border-subtle">
      <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
        <thead>
          <tr className="bg-bg-surface2">
            <th className="w-40 border-b border-border-subtle p-2 text-start text-xs font-semibold text-text-secondary uppercase">
              {t('admin.shifts.shift')}
            </th>
            {week.days.map((d) => (
              <th
                key={d.date}
                className={cn(
                  'border-b border-s border-border-subtle p-2 text-start align-top',
                  d.date === today && 'bg-accent-tint',
                )}
              >
                <span className="block text-xs font-semibold uppercase">{wd.short(d.weekday)}</span>
                <span className="block text-xs font-normal text-text-secondary">
                  {f.date(d.date)}
                </span>
                {d.closure && (
                  <span
                    className={cn(
                      'mt-1 flex items-center gap-1 text-xs font-medium',
                      d.closure.isClosed ? 'text-status-warning' : 'text-text-secondary',
                    )}
                  >
                    <CalendarOff className="size-3 shrink-0" />
                    <span className="truncate">{d.closure.name}</span>
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {types.map((s) => (
            <tr key={s.id}>
              <th
                scope="row"
                className="border-b border-border-subtle p-2 text-start align-top"
                style={{ boxShadow: `inset 4px 0 0 ${s.color}` }}
              >
                <span className="block ps-1 font-semibold">{s.name}</span>
                <span className="block ps-1 text-xs font-normal text-text-secondary">
                  {s.startsAt} - {s.endsAt}
                </span>
              </th>
              {week.days.map((d) => (
                <td
                  key={d.date}
                  className={cn(
                    'border-b border-s border-border-subtle p-1.5 align-top',
                    d.closure?.isClosed && 'bg-bg-surface2/60',
                  )}
                >
                  <div className="flex flex-col gap-1">
                    {at(d.date, s.id).map((a) => (
                      <span
                        key={a.userId}
                        title={a.name}
                        className={cn(
                          'truncate rounded-xs px-1.5 py-1 text-xs font-semibold',
                          highlight && a.userId === highlight && 'ring-2 ring-accent-400',
                        )}
                        style={{
                          background: tint(s.color),
                          borderInlineStart: `3px solid ${s.color}`,
                        }}
                      >
                        {a.name}
                      </span>
                    ))}
                  </div>
                </td>
              ))}
            </tr>
          ))}
          {week.absences.length > 0 && (
            <tr>
              <th
                scope="row"
                className="p-2 text-start align-top text-xs font-semibold text-text-secondary uppercase"
              >
                {t('admin.shifts.absent')}
              </th>
              {week.days.map((d) => (
                <td key={d.date} className="border-s border-border-subtle p-1.5 align-top">
                  <div className="flex flex-col gap-1">
                    {week.absences
                      .filter((a) => a.date === d.date)
                      .map((a) => (
                        <span
                          key={a.userId}
                          title={`${a.name} - ${t(`admin.shifts.kinds.${a.kind}`)}`}
                          className="truncate rounded-xs border border-dashed border-border-strong px-1.5 py-1 text-xs text-text-secondary"
                        >
                          {a.name}
                          <span className="block text-[11px]">
                            {t(`admin.shifts.kinds.${a.kind}`)}
                          </span>
                        </span>
                      ))}
                  </div>
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
