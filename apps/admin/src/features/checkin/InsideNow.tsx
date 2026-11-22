import type { OccupancyDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, EmptyState } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useCan } from '@/lib/me';

/** Who is inside right now (open visits), with locker and a desk check-out. */
export function InsideNow() {
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['occupancy'],
    queryFn: () => api.get<OccupancyDto>('/admin/occupancy'),
    refetchInterval: 15_000,
    enabled: can('attendance.read'),
  });
  const out = useMutation({
    mutationFn: (id: string) => api.post(`/admin/visits/${id}/checkout`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['occupancy'] });
      void qc.invalidateQueries({ queryKey: ['lockers'] });
      toast.success(t('admin.inside.checked_out'));
    },
  });
  if (!can('attendance.read')) return null;
  return (
    <Card>
      <CardHeader
        title={t('admin.inside.title')}
        action={
          <Badge tone="success">{t('admin.inside.count', { count: q.data?.inside ?? 0 })}</Badge>
        }
      />
      {(q.data?.visits.length ?? 0) === 0 ? (
        <EmptyState icon={Users} title={t('admin.inside.empty')} />
      ) : (
        <ul className="max-h-96 divide-y divide-border-subtle overflow-y-auto">
          {q.data!.visits.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <Link
                  to={`/members/${v.memberId}`}
                  className="block truncate font-semibold hover:underline"
                >
                  {v.firstName} {v.lastName}
                </Link>
                <p className="tabular text-xs text-text-secondary">
                  {t('admin.inside.since', { time: f.dateTime(v.startedAt) })}
                </p>
              </div>
              {v.locker ? (
                <Badge tone="accent">
                  <KeyRound className="size-3" aria-hidden /> {v.locker.number}
                </Badge>
              ) : (
                <span className="text-xs text-text-muted">{t('admin.inside.no_locker')}</span>
              )}
              {can('attendance.checkin') && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<LogOut className="size-4" />}
                  loading={out.isPending && out.variables === v.id}
                  onClick={() => out.mutate(v.id)}
                >
                  {t('admin.inside.checkout')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
