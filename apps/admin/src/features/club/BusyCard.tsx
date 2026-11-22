import type { BusySettings } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Card, CardHeader, Skeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';

const KEY = ['admin-busy-settings'];

/** F13-1: whether members see how busy the gym is, and the capacity for a percentage. */
export function BusyCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<BusySettings>('/admin/busy-settings'),
  });
  const [visible, setVisible] = useState(true);
  const [capacity, setCapacity] = useState('');
  useEffect(() => {
    if (!q.data) return;
    setVisible(q.data.visible);
    setCapacity(q.data.capacity ? String(q.data.capacity) : '');
  }, [q.data]);
  const cap = capacity.trim() ? Number(capacity) : null;
  const invalid = cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > 10_000);
  const save = useMutation({
    mutationFn: () => api.put<BusySettings>('/admin/busy-settings', { visible, capacity: cap }),
    onSuccess: (d) => {
      qc.setQueryData(KEY, d);
      toast.success(t('admin.club.saved'));
    },
    onError: (e) => toast.error(t(e instanceof ApiError ? e.message : 'errors.internal')),
  });
  return (
    <Card>
      <CardHeader
        title={t('admin.busy.title')}
        action={
          <Button
            size="sm"
            loading={save.isPending}
            disabled={!q.data || invalid}
            onClick={() => save.mutate()}
          >
            {t('common.save')}
          </Button>
        }
      />
      {!q.data ? (
        <Skeleton className="m-4 h-24" />
      ) : (
        <div className="flex flex-col gap-4 p-4 text-sm">
          <p className="text-text-secondary">{t('admin.busy.hint')}</p>
          <label className="flex items-center gap-2 font-semibold">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-accent-500)]"
              checked={visible}
              onChange={(e) => setVisible(e.target.checked)}
            />
            {t('admin.busy.visible')}
          </label>
          <Field
            label={t('admin.busy.capacity')}
            hint={t('admin.busy.capacity_hint')}
            error={invalid ? 'admin.busy.capacity_invalid' : undefined}
          >
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="numeric"
                min={1}
                max={10000}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-40"
              />
            )}
          </Field>
        </div>
      )}
    </Card>
  );
}
