import type { AnnouncementDto, CreateAnnouncementBody } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';

/** Staff → members messages (holiday hours, closures, news). Delivered to the app inbox and push. */
export function AnnouncementsPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['announcements'],
    queryFn: () => api.get<AnnouncementDto[]>('/admin/announcements'),
  });
  const [form, setForm] = useState<CreateAnnouncementBody>({
    title: '',
    body: '',
    audience: 'all',
  });
  const send = useMutation({
    mutationFn: () => api.post<{ id: string; recipients: number }>('/admin/announcements', form),
    onSuccess: (r) => {
      toast.success(t('admin.announcements.sent', { count: r.recipients }));
      setForm({ title: '', body: '', audience: form.audience });
      void qc.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
  const valid = form.title.trim().length > 0 && form.body.trim().length > 0;

  return (
    <>
      <PageHeader
        title={t('admin.announcements.title')}
        subtitle={t('admin.announcements.subtitle')}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader title={t('admin.announcements.new')} />
          <form
            className="flex flex-col gap-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid && window.confirm(t('admin.announcements.confirm'))) send.mutate();
            }}
          >
            <Field label={t('admin.announcements.form_title')}>
              {(p) => (
                <Input
                  {...p}
                  value={form.title}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              )}
            </Field>
            <Field label={t('admin.announcements.form_body')}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={5}
                  value={form.body}
                  maxLength={1000}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                />
              )}
            </Field>
            <Field label={t('admin.announcements.audience')}>
              {(p) => (
                <Select
                  {...p}
                  value={form.audience}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      audience: e.target.value as CreateAnnouncementBody['audience'],
                    })
                  }
                >
                  <option value="all">{t('admin.announcements.audience_all')}</option>
                  <option value="active">{t('admin.announcements.audience_active')}</option>
                  <option value="marketing">{t('admin.announcements.audience_marketing')}</option>
                </Select>
              )}
            </Field>
            <p className="text-xs text-text-secondary">{t('admin.announcements.confirm')}</p>
            {send.error && (
              <p role="alert" className="text-sm text-status-danger">
                {t(send.error instanceof ApiError ? send.error.message : 'errors.internal')}
              </p>
            )}
            <Button
              type="submit"
              disabled={!valid}
              loading={send.isPending}
              icon={<Send className="size-4" />}
            >
              {t('admin.announcements.send')}
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title={t('admin.nav.announcements')} />
          {q.isPending ? (
            <Skeleton className="m-4 h-40" />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : !q.data.length ? (
            <EmptyState icon={Megaphone} title={t('admin.announcements.empty')} />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {q.data.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 font-semibold">{a.title}</span>
                    <Badge tone={a.audience === 'all' ? 'neutral' : 'info'}>
                      {t(`admin.announcements.audience_${a.audience}`)}
                    </Badge>
                  </div>
                  <p className="whitespace-pre-line text-text-secondary">{a.body}</p>
                  <p className="text-xs text-text-muted">
                    {f.dateTime(a.createdAt)}
                    {a.createdByName ? ` · ${a.createdByName}` : ''} ·{' '}
                    {t('admin.announcements.recipients', { count: a.recipients })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
