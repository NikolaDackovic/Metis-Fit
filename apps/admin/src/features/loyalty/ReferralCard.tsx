import type { AdminReferralsDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Card, CardHeader, Skeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';

const KEY = ['admin-referrals'];
const toInt = (s: string) => (s.trim() === '' ? 0 : Number(s));
const valid = (n: number) => Number.isInteger(n) && n >= 0 && n <= 100_000;

/** F13-3 "Bring a friend": on/off, points for both members, and who brought whom. */
export function ReferralCard() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<AdminReferralsDto>('/admin/referrals'),
  });
  const [enabled, setEnabled] = useState(false);
  const [mine, setMine] = useState('0');
  const [friend, setFriend] = useState('0');
  useEffect(() => {
    if (!q.data) return;
    setEnabled(q.data.settings.enabled);
    setMine(String(q.data.settings.pointsReferrer));
    setFriend(String(q.data.settings.pointsFriend));
  }, [q.data]);
  const ok = valid(toInt(mine)) && valid(toInt(friend));
  const save = useMutation({
    mutationFn: () =>
      api.put('/admin/referrals/settings', {
        enabled,
        pointsReferrer: toInt(mine),
        pointsFriend: toInt(friend),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      toast.success(t('admin.club.saved'));
    },
    onError: (e) => toast.error(t(e instanceof ApiError ? e.message : 'errors.internal')),
  });

  return (
    <Card>
      <CardHeader
        title={t('admin.referral.title')}
        action={
          <Button
            size="sm"
            loading={save.isPending}
            disabled={!q.data || !ok}
            onClick={() => save.mutate()}
          >
            {t('common.save')}
          </Button>
        }
      />
      {!q.data ? (
        <Skeleton className="m-4 h-32" />
      ) : (
        <div className="flex flex-col gap-4 p-4 text-sm">
          <p className="text-text-secondary">{t('admin.referral.hint')}</p>
          <label className="flex items-center gap-2 font-semibold">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-accent-500)]"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            {t('admin.referral.enabled')}
          </label>
          <div className="flex flex-wrap gap-3">
            <Field
              label={t('admin.referral.points_referrer')}
              error={valid(toInt(mine)) ? undefined : 'admin.referral.points_invalid'}
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  value={mine}
                  onChange={(e) => setMine(e.target.value)}
                  className="w-32"
                />
              )}
            </Field>
            <Field
              label={t('admin.referral.points_friend')}
              error={valid(toInt(friend)) ? undefined : 'admin.referral.points_invalid'}
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  value={friend}
                  onChange={(e) => setFriend(e.target.value)}
                  className="w-32"
                />
              )}
            </Field>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">{t('admin.referral.list')}</h3>
            {q.data.items.length === 0 ? (
              <p className="text-text-secondary">{t('admin.referral.empty')}</p>
            ) : (
              <ul className="divide-y divide-border-subtle rounded-md border border-border-subtle">
                {q.data.items.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate">
                      <Link
                        to={`/members/${r.referrer.id}`}
                        className="font-semibold hover:text-accent-400"
                      >
                        {r.referrer.name}
                      </Link>
                      <span className="text-text-secondary"> → </span>
                      <Link
                        to={`/members/${r.friend.id}`}
                        className="font-semibold hover:text-accent-400"
                      >
                        {r.friend.name}
                      </Link>
                    </span>
                    <span className="text-xs text-text-secondary">{f.date(r.createdAt)}</span>
                    <Badge tone={r.status === 'rewarded' ? 'success' : 'warning'}>
                      {r.status === 'rewarded'
                        ? t('admin.referral.rewarded', { a: r.referrerPoints, b: r.friendPoints })
                        : t('admin.referral.pending')}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
