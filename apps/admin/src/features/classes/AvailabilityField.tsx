import type { AvailabilityBody } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { intlLocale } from '@/lib/i18n';

type Rule = AvailabilityBody['rules'][number];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const LENGTHS = [30, 45, 60, 90] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const bad = (r: Rule) => !HHMM.test(r.startsAt) || !HHMM.test(r.endsAt) || r.endsAt <= r.startsAt;

/**
 * F14-5: the desk or the manager sets when a trainer takes personal sessions (the same hours the
 * trainer can set in the app). Members book the free slots from the app.
 */
export function AvailabilityField({ trainerId }: { trainerId: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const key = ['trainer-availability', trainerId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api.get<AvailabilityBody>(`/admin/trainers/${trainerId}/availability`),
  });
  const [slot, setSlot] = useState(60);
  const [rules, setRules] = useState<Rule[] | null>(null);
  useEffect(() => {
    if (q.data && !rules) {
      setRules(q.data.rules);
      setSlot(q.data.slotMinutes);
    }
  }, [q.data, rules]);
  const save = useMutation({
    mutationFn: () =>
      api.put<AvailabilityBody>(`/admin/trainers/${trainerId}/availability`, {
        slotMinutes: slot,
        rules,
      }),
    onSuccess: (d) => {
      qc.setQueryData(key, d);
      toast.success(t('admin.availability.saved'));
    },
    onError: (e) => toast.error(t(e instanceof ApiError ? e.message : 'errors.internal')),
  });
  // 2024-01-01 was a Monday.
  const dayName = (w: number) =>
    new Intl.DateTimeFormat(intlLocale(i18n.language), { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, 0, w)),
    );
  const set = (i: number, patch: Partial<Rule>) =>
    setRules((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="sm:col-span-2">
      <p className="mb-1 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        {t('admin.availability.title')}
      </p>
      <p className="mb-2 text-xs text-text-secondary">{t('admin.availability.hint')}</p>
      {!rules ? (
        <div className="h-24 animate-pulse rounded-sm bg-bg-surface2" />
      ) : (
        <div className="grid gap-3 rounded-sm border border-border-subtle p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-text-secondary">{t('admin.availability.length')}</span>
            {LENGTHS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={m === slot}
                onClick={() => setSlot(m)}
                className={
                  m === slot
                    ? 'h-8 rounded-sm border border-accent-500 bg-accent-tint px-3 text-xs font-semibold'
                    : 'h-8 rounded-sm border border-border-subtle px-3 text-xs font-semibold text-text-secondary'
                }
              >
                {m} min
              </button>
            ))}
          </div>
          {rules.length === 0 && (
            <p className="text-sm text-text-secondary">{t('admin.availability.none')}</p>
          )}
          {rules.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                value={r.weekday}
                onChange={(e) => set(i, { weekday: Number(e.target.value) })}
                aria-label={t('admin.availability.day')}
                className="h-10 rounded-sm border border-border-subtle bg-bg-surface2 px-2 text-sm"
              >
                {WEEKDAYS.map((w) => (
                  <option key={w} value={w}>
                    {dayName(w)}
                  </option>
                ))}
              </select>
              <div className="w-28">
                <Input
                  type="time"
                  value={r.startsAt}
                  onChange={(e) => set(i, { startsAt: e.target.value })}
                  aria-label={t('admin.availability.from')}
                  aria-invalid={bad(r)}
                />
              </div>
              <span className="text-text-secondary">-</span>
              <div className="w-28">
                <Input
                  type="time"
                  value={r.endsAt}
                  onChange={(e) => set(i, { endsAt: e.target.value })}
                  aria-label={t('admin.availability.to')}
                  aria-invalid={bad(r)}
                />
              </div>
              <IconButton
                label={t('admin.availability.remove')}
                onClick={() => setRules(rules.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus className="size-4" />}
              disabled={rules.length >= 21}
              onClick={() => {
                const last = rules.at(-1);
                setRules([
                  ...rules,
                  {
                    weekday: last ? (last.weekday % 7) + 1 : 1,
                    startsAt: last?.startsAt ?? '16:00',
                    endsAt: last?.endsAt ?? '20:00',
                  },
                ]);
              }}
            >
              {t('admin.availability.add')}
            </Button>
            <Button
              size="sm"
              className="ms-auto"
              loading={save.isPending}
              disabled={rules.some(bad)}
              onClick={() => save.mutate()}
            >
              {t('admin.availability.save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
