import type { PayrollDto, TimeEntryDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Printer, Timer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { clubToday, parseMoneyInput, useFormat } from '@/lib/format';
import { minutesLabel } from './shared';

type Row = PayrollDto['rows'][number];

/** Belgrade wall-clock date + time -> ISO with the right offset (summer / winter time). */
function belgradeIso(date: string, time: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const local = new Date(guess.toLocaleString('en-US', { timeZone: 'Europe/Belgrade' }));
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMin = Math.round((local.getTime() - utc.getTime()) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `${date}T${time}:00${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/**
 * Evidencija rada: staff clock in and out; here the manager sees days and hours per person
 * for the month, sets the hourly rate and gets the payout. Corrections are logged.
 */
export function PayrollTab() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [month, setMonth] = useState(clubToday().slice(0, 7));
  const [person, setPerson] = useState<Row | null>(null);
  const [rateFor, setRateFor] = useState<Row | null>(null);
  const q = useQuery({
    queryKey: ['payroll', month],
    queryFn: () => api.get<PayrollDto>('/admin/payroll', { month }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Field label={t('admin.shifts.month')}>
          {(p) => (
            <Input
              {...p}
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          )}
        </Field>
        <p className="max-w-xl flex-1 text-sm text-text-secondary">
          {t('admin.shifts.hours_hint')}
        </p>
        <Button
          variant="ghost"
          icon={<Printer className="size-4" />}
          onClick={() => window.print()}
        >
          {t('admin.shifts.print')}
        </Button>
      </div>
      {q.isPending ? (
        <Skeleton className="h-60" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.rows.length === 0 ? (
        <Card>
          <EmptyState icon={Timer} title={t('admin.shifts.hours_empty')} />
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-start text-xs text-text-secondary uppercase">
                <th className="p-3 text-start">{t('admin.shifts.employee')}</th>
                <th className="p-3 text-end">{t('admin.shifts.days_worked')}</th>
                <th className="p-3 text-end">{t('admin.shifts.hours')}</th>
                <th className="p-3 text-end">{t('admin.shifts.rate')}</th>
                <th className="p-3 text-end">{t('admin.shifts.payout')}</th>
              </tr>
            </thead>
            <tbody>
              {q.data.rows.map((r) => (
                <tr key={r.userId} className="border-b border-border-subtle last:border-0">
                  <td className="p-3">
                    <button
                      type="button"
                      className="font-semibold hover:text-accent-400"
                      onClick={() => setPerson(r)}
                    >
                      {r.name}
                    </button>
                    {r.openEntry && (
                      <span className="ms-2">
                        <Badge tone="success">{t('admin.shifts.working_now')}</Badge>
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-end tabular-nums">{r.days}</td>
                  <td className="p-3 text-end tabular-nums">{minutesLabel(r.minutes)}</td>
                  <td className="p-3 text-end">
                    <button
                      type="button"
                      className="tabular-nums text-text-secondary underline-offset-2 hover:underline print:no-underline"
                      onClick={() => setRateFor(r)}
                    >
                      {r.hourlyRateMinor === null
                        ? t('admin.shifts.set_rate')
                        : `${f.money(r.hourlyRateMinor, r.currency)}/h`}
                    </button>
                  </td>
                  <td className="p-3 text-end font-semibold tabular-nums">
                    {r.payoutMinor === null ? '-' : f.money(r.payoutMinor, r.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong">
                <td className="p-3 font-semibold" colSpan={4}>
                  {t('admin.shifts.total_payout')}
                </td>
                <td className="p-3 text-end font-bold tabular-nums">
                  {f.money(q.data.totalMinor)}
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="border-t border-border-subtle px-3 py-2 text-xs text-text-muted">
            {t('admin.shifts.payout_note')}
          </p>
        </Card>
      )}
      {person && <EntriesModal row={person} month={month} onClose={() => setPerson(null)} />}
      {rateFor && (
        <RateModal
          row={rateFor}
          onClose={() => setRateFor(null)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['payroll'] })}
        />
      )}
    </div>
  );
}

function RateModal({
  row,
  onClose,
  onSaved,
}: {
  row: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(
    row.hourlyRateMinor === null ? '' : String(row.hourlyRateMinor / 100),
  );
  const minor = parseMoneyInput(value);
  const save = useMutation({
    mutationFn: () => api.put(`/admin/payroll/rates/${row.userId}`, { hourlyRateMinor: minor }),
    onSuccess: () => {
      toast.success(t('admin.shifts.rate_saved'));
      onSaved();
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`${t('admin.shifts.rate')}: ${row.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={minor === null} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Field label={t('admin.shifts.rate_rsd')} hint={t('admin.shifts.rate_hint')}>
        {(p) => (
          <Input
            {...p}
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      </Field>
    </Modal>
  );
}

function EntriesModal({ row, month, onClose }: { row: Row; month: string; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['payroll', month, 'entries', row.userId],
    queryFn: () => api.get<TimeEntryDto[]>('/admin/payroll/entries', { month, userId: row.userId }),
  });
  const [form, setForm] = useState({
    date: clubToday().slice(0, 7) === month ? clubToday() : `${month}-01`,
    from: '07:00',
    to: '15:00',
    note: '',
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['payroll'] });
  const add = useMutation({
    mutationFn: () => {
      const clockIn = belgradeIso(form.date, form.from);
      // "22:00 - 06:00" ends the next morning.
      const endDate =
        form.to <= form.from
          ? new Date(Date.parse(`${form.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
          : form.date;
      return api.post('/admin/payroll/entries', {
        userId: row.userId,
        clockIn,
        clockOut: belgradeIso(endDate, form.to),
        note: form.note,
      });
    },
    onSuccess: () => {
      toast.success(t('admin.shifts.entry_saved'));
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/payroll/entries/${id}`),
    onSuccess: refresh,
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={row.name}
      description={t('admin.shifts.entries_hint')}
    >
      <div className="flex flex-col gap-4">
        {q.isPending ? (
          <Skeleton className="h-32" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.length === 0 ? (
          <p className="text-sm text-text-secondary">{t('admin.shifts.entries_empty')}</p>
        ) : (
          <div className="divide-y divide-border-subtle rounded-md border border-border-subtle">
            {q.data.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-28 font-semibold">{f.date(e.clockIn)}</span>
                <span className="tabular-nums">
                  {f.time(e.clockIn)} - {e.clockOut ? f.time(e.clockOut) : '…'}
                </span>
                <span className="tabular-nums text-text-secondary">
                  {e.minutes === null ? t('admin.shifts.working_now') : minutesLabel(e.minutes)}
                </span>
                {e.source === 'admin' && (
                  <Badge tone="info">{t('admin.shifts.entered_by_admin')}</Badge>
                )}
                {e.note && <span className="text-text-secondary">· {e.note}</span>}
                <span className="ms-auto">
                  <IconButton label={t('admin.shifts.remove')} onClick={() => remove.mutate(e.id)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-3 rounded-md border border-border-subtle p-3 sm:grid-cols-[1fr_auto_auto]">
          <p className="text-sm font-semibold sm:col-span-3">{t('admin.shifts.add_entry')}</p>
          <Field label={t('admin.fields.date')}>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('admin.shifts.starts')}>
            {(p) => (
              <Input
                {...p}
                type="time"
                value={form.from}
                onChange={(e) => setForm({ ...form, from: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('admin.shifts.ends')}>
            {(p) => (
              <Input
                {...p}
                type="time"
                value={form.to}
                onChange={(e) => setForm({ ...form, to: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('admin.fields.note')} className="sm:col-span-2">
            {(p) => (
              <Input
                {...p}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            )}
          </Field>
          <div className="flex items-end">
            <Button
              icon={<Plus className="size-4" />}
              loading={add.isPending}
              disabled={!form.date || form.from === form.to}
              onClick={() => add.mutate()}
            >
              {t('admin.shifts.add')}
            </Button>
          </div>
          {add.error && (
            <p role="alert" className="text-sm text-status-danger sm:col-span-3">
              {t(add.error instanceof ApiError ? add.error.message : 'errors.internal')}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
