import type { CafeCategoryDto, StockCountDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Input } from '@/components/ui/Field';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Belgrade' });

/** Popis: count what is on the shelf; differences to the system stock are booked. */
export function StockCountTab() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [countedOn, setCountedOn] = useState(today());
  const [note, setNote] = useState('');
  const [counted, setCounted] = useState<Record<string, string>>({});
  const items = useQuery({
    queryKey: ['cafe', 'admin-menu', i18n.language],
    queryFn: () => api.get<CafeCategoryDto[]>('/admin/cafe/menu', { locale: i18n.language }),
    select: (cats) => cats.flatMap((c) => c.items).filter((i) => i.trackStock),
  });
  const history = useQuery({
    queryKey: ['business', 'counts'],
    queryFn: () => api.get<StockCountDto[]>('/admin/stock-counts'),
  });
  const entered = Object.entries(counted).filter(([, v]) => v.trim() !== '');
  const valid = entered.length > 0 && entered.every(([, v]) => /^\d+$/.test(v.trim()));
  const save = useMutation({
    mutationFn: () =>
      api.post('/admin/stock-counts', {
        countedOn,
        note,
        lines: entered.map(([cafeItemId, v]) => ({ cafeItemId, countedQty: Number(v) })),
      }),
    onSuccess: () => {
      toast.success(t('admin.business.count.saved'));
      setCounted({});
      setNote('');
      for (const k of ['business', 'cafe']) void qc.invalidateQueries({ queryKey: [k] });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">{t('admin.business.count.hint')}</p>
        <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
          <Input
            type="date"
            aria-label={t('admin.business.count.date')}
            value={countedOn}
            max={today()}
            onChange={(e) => setCountedOn(e.target.value)}
          />
          <Input
            aria-label={t('admin.fields.note')}
            placeholder={t('admin.fields.note')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            {t('admin.business.count.save')}
          </Button>
        </div>
        {save.error && (
          <p role="alert" className="text-sm text-status-danger">
            {t(save.error instanceof ApiError ? save.error.message : 'errors.internal')}
          </p>
        )}
        {items.isPending ? (
          <TableSkeleton rows={4} />
        ) : items.isError ? (
          <ErrorState error={items.error} onRetry={() => void items.refetch()} />
        ) : !items.data.length ? (
          <EmptyState icon={ClipboardList} title={t('admin.business.count.no_items')} />
        ) : (
          <div className="overflow-x-auto rounded-md border border-border-subtle">
            <table className="w-full min-w-[560px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="bg-bg-surface2 text-xs uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-3 py-2 text-start">{t('admin.business.line.name')}</th>
                  <th className="px-2 py-2 text-end">{t('admin.business.count.system')}</th>
                  <th className="w-36 px-2 py-2 text-end">{t('admin.business.count.counted')}</th>
                  <th className="px-3 py-2 text-end">{t('admin.business.count.diff')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {items.data.map((i) => {
                  const v = counted[i.id] ?? '';
                  const diff = /^\d+$/.test(v) ? Number(v) - (i.stockQty ?? 0) : null;
                  return (
                    <tr key={i.id}>
                      <td className="px-3 py-1.5 font-semibold">{i.name}</td>
                      <td className="tabular px-2 py-1.5 text-end">{i.stockQty ?? 0}</td>
                      <td className="px-2 py-1.5">
                        <Input
                          aria-label={`${t('admin.business.count.counted')}: ${i.name}`}
                          inputMode="numeric"
                          value={v}
                          onChange={(e) => setCounted((c) => ({ ...c, [i.id]: e.target.value }))}
                          className="tabular h-9 text-end"
                        />
                      </td>
                      <td
                        className={cn(
                          'tabular px-3 py-1.5 text-end font-semibold',
                          diff !== null && diff < 0 && 'text-status-danger',
                          diff !== null && diff > 0 && 'text-status-success',
                        )}
                      >
                        {diff === null ? '' : diff > 0 ? `+${diff}` : diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          {t('admin.business.count.history')}
        </h2>
        {history.data?.length ? (
          <ul className="divide-y divide-border-subtle rounded-md border border-border-subtle">
            {history.data.map((c) => {
              const changed = c.lines.filter((l) => l.diff !== 0);
              return (
                <li key={c.id} className="px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{f.date(c.countedOn)}</span>
                    <span className="text-xs text-text-secondary">
                      {t('admin.business.count.summary', {
                        items: c.lines.length,
                        changed: changed.length,
                      })}
                    </span>
                  </div>
                  {changed.length > 0 && (
                    <p className="mt-1 text-xs text-text-secondary">
                      {changed
                        .map((l) => `${l.name} ${l.diff > 0 ? '+' : ''}${l.diff}`)
                        .join(' · ')}
                    </p>
                  )}
                  {c.note && <p className="mt-1 text-xs text-text-muted">{c.note}</p>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">{t('admin.business.count.history_empty')}</p>
        )}
      </div>
    </div>
  );
}
