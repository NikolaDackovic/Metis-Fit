import type { AttendanceRowDto } from '@grit/validation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarCheck, CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/components/ui/cn';
import { Field, Input, Select } from '@/components/ui/Field';
import { Card, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/States';
import { Pagination, Table, Td, Th } from '@/components/ui/Table';
import { api } from '@/lib/api';
import { clubToday, useFormat } from '@/lib/format';

/** Every check-in attempt (granted and denied), filterable - the audit trail of the front door. */
export function AttendancePage() {
  const { t } = useTranslation();
  const f = useFormat();
  const [from, setFrom] = useState(clubToday());
  const [to, setTo] = useState(clubToday());
  const [result, setResult] = useState('');
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ['attendance', { from, to, result, page }],
    queryFn: () =>
      api.page<AttendanceRowDto[]>('/admin/attendance', {
        from,
        to,
        result: result || undefined,
        page,
        pageSize: 50,
      }),
    placeholderData: keepPreviousData,
  });

  const reasonOf = (a: AttendanceRowDto) =>
    a.reasonCode === 'OK'
      ? t(`admin.attendance.sources.${a.source}`)
      : t(`admin.attendance.reasons.${a.reasonCode}`, { defaultValue: a.reasonCode });

  return (
    <>
      <PageHeader title={t('admin.attendance.title')} subtitle={t('admin.attendance.subtitle')} />
      <Card>
        <div className="grid grid-cols-2 gap-3 border-b border-border-subtle p-4 md:flex md:flex-wrap md:items-end md:gap-4">
          <Field label={t('admin.fields.from')}>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={from}
                max={to}
                onChange={(e) => (setFrom(e.target.value), setPage(1))}
              />
            )}
          </Field>
          <Field label={t('admin.fields.to')}>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={to}
                min={from}
                onChange={(e) => (setTo(e.target.value), setPage(1))}
              />
            )}
          </Field>
          <Field label={t('admin.attendance.result')} className="col-span-2 md:col-span-1">
            {(p) => (
              <Select
                {...p}
                value={result}
                onChange={(e) => (setResult(e.target.value), setPage(1))}
              >
                <option value="">{t('admin.members.all')}</option>
                <option value="granted">{t('admin.attendance.results.granted')}</option>
                <option value="denied">{t('admin.attendance.results.denied')}</option>
              </Select>
            )}
          </Field>
        </div>

        {q.isPending ? (
          <TableSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState icon={CalendarCheck} title={t('admin.attendance.empty_period')} />
        ) : (
          <>
            <ul className="divide-y divide-border-subtle md:hidden">
              {q.data.items.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                  {a.result === 'granted' ? (
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-status-success"
                      aria-hidden
                    />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-status-danger" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {a.memberName ?? t('admin.checkin.unknown_member')}
                    </p>
                    <p className="truncate text-xs text-text-secondary">
                      {f.dateTime(a.occurredAt)} · {reasonOf(a)}
                    </p>
                    {a.overrideReason && (
                      <p className="text-xs text-text-secondary">{a.overrideReason}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>{t('admin.fields.date')}</Th>
                    <Th>{t('admin.fields.member')}</Th>
                    <Th>{t('admin.attendance.result')}</Th>
                    <Th>{t('admin.attendance.detail')}</Th>
                    <Th>{t('admin.fields.recorded_by')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((a) => (
                    <tr key={a.id}>
                      <Td className="tabular whitespace-nowrap">{f.dateTime(a.occurredAt)}</Td>
                      <Td>
                        {a.memberId ? (
                          <Link
                            to={`/members/${a.memberId}`}
                            className="font-semibold hover:text-accent-400"
                          >
                            {a.memberName}
                          </Link>
                        ) : (
                          <span className="text-text-secondary">
                            {t('admin.checkin.unknown_member')}
                          </span>
                        )}
                        {a.memberNumber && (
                          <p className="tabular text-xs text-text-secondary">{a.memberNumber}</p>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={a.result === 'granted' ? 'success' : 'danger'}>
                          {t(`admin.attendance.results.${a.result}`)}
                        </Badge>
                        {a.consumedVisit && (
                          <span className="ms-2 text-xs text-text-secondary">
                            {t('admin.attendance.visit_used')}
                          </span>
                        )}
                      </Td>
                      <Td className={cn('text-text-secondary')}>
                        {reasonOf(a)}
                        {a.overrideReason && <p className="text-xs">{a.overrideReason}</p>}
                      </Td>
                      <Td className="text-text-secondary">{a.performedByName ?? '-'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <Pagination
              page={q.data.meta.page}
              pageSize={q.data.meta.pageSize}
              total={q.data.meta.total}
              onPage={setPage}
            />
          </>
        )}
      </Card>
    </>
  );
}
