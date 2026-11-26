import type { MemberListItemDto, TrainerClientDto, WorkoutTemplateDto } from '@grit/validation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useCan } from '@/lib/me';
import { PlanEditor } from './WorkoutPlansPanel';

/**
 * F17-2 program templates: write a program once, give it to many clients (each gets their own
 * copy, adjustable per person). Shared templates are visible to every trainer of the gym.
 */
export function TemplatesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<WorkoutTemplateDto | 'new' | null>(null);
  const [assigning, setAssigning] = useState<WorkoutTemplateDto | null>(null);
  const q = useQuery({
    queryKey: ['workout-templates'],
    queryFn: () => api.get<WorkoutTemplateDto[]>('/admin/workout-templates'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/workout-templates/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['workout-templates'] }),
  });

  return (
    <>
      <PageHeader
        title={t('admin.templates.title')}
        subtitle={t('admin.templates.subtitle')}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            {t('admin.templates.new')}
          </Button>
        }
      />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <Skeleton className="h-48" />
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title={t('admin.templates.empty')}
            description={t('admin.templates.empty_hint')}
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border-subtle">
            {q.data.map((tpl) => (
              <li key={tpl.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{tpl.title}</p>
                  <p className="truncate text-xs text-text-secondary">
                    {tpl.days.map((d) => `${d.title} (${d.items.length})`).join(' · ')}
                    {tpl.trainerName ? ` · ${tpl.trainerName}` : ''}
                  </p>
                </div>
                {tpl.shared && <Badge tone="accent">{t('admin.templates.shared')}</Badge>}
                <Button
                  size="sm"
                  icon={<Users className="size-4" />}
                  onClick={() => setAssigning(tpl)}
                >
                  {t('admin.templates.assign')}
                </Button>
                {tpl.mine && (
                  <>
                    <IconButton label={t('common.edit')} onClick={() => setEditing(tpl)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton
                      label={t('common.delete')}
                      onClick={() => {
                        if (
                          window.confirm(t('admin.templates.delete_confirm', { title: tpl.title }))
                        )
                          remove.mutate(tpl.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {editing && (
        <PlanEditor
          existing={editing === 'new' ? null : editing}
          template={{
            id: editing === 'new' ? null : editing.id,
            shared: editing === 'new' ? false : editing.shared,
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {assigning && <AssignModal template={assigning} onClose={() => setAssigning(null)} />}
    </>
  );
}

/** Pick clients (a trainer: their clients; a manager: any member by search). */
function AssignModal({ template, onClose }: { template: WorkoutTemplateDto; onClose: () => void }) {
  const { t } = useTranslation();
  const can = useCan();
  const manager = can('trainers.manage');
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);
  const clients = useQuery({
    queryKey: ['my-clients'],
    queryFn: () => api.get<TrainerClientDto[]>('/admin/my-clients'),
    retry: false,
  });
  const search = useQuery({
    queryKey: ['members', { q: term, assign: true }],
    queryFn: () => api.page<MemberListItemDto[]>('/admin/members', { q: term, pageSize: 8 }),
    enabled: manager && term.length >= 2,
    placeholderData: keepPreviousData,
  });
  const toggle = (id: string, name: string) =>
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(id)) next.delete(id);
      else next.set(id, name);
      return next;
    });
  const assign = useMutation({
    mutationFn: () =>
      api.post<{ created: number }>(`/admin/workout-templates/${template.id}/assign`, {
        memberIds: [...picked.keys()],
      }),
    onSuccess: (r) => {
      toast.success(t('admin.templates.assigned', { n: r.created }));
      onClose();
    },
  });
  const rows: Array<{ id: string; name: string; sub?: string }> = [
    ...(clients.data ?? []).map((c) => ({ id: c.memberId, name: `${c.firstName} ${c.lastName}` })),
    ...(search.data?.items ?? [])
      .filter((m) => !(clients.data ?? []).some((c) => c.memberId === m.id))
      .map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}`, sub: m.memberNumber })),
  ];
  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.templates.assign_title', { title: template.title })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={assign.isPending}
            disabled={picked.size === 0}
            onClick={() => assign.mutate()}
          >
            {t('admin.templates.assign_n', { n: picked.size })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">{t('admin.templates.assign_hint')}</p>
        {manager && (
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('admin.members.search_placeholder')}
              aria-label={t('admin.members.search_placeholder')}
              className="ps-9"
            />
          </div>
        )}
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-secondary">
            {t('admin.templates.no_clients')}
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-border-subtle overflow-y-auto rounded-sm border border-border-subtle">
            {rows.map((r) => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-bg-surface2">
                  <input
                    type="checkbox"
                    checked={picked.has(r.id)}
                    onChange={() => toggle(r.id, r.name)}
                    className="size-4 accent-accent-500"
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                  {r.sub && <span className="text-xs text-text-muted">{r.sub}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        {assign.error && (
          <p role="alert" className="text-sm text-status-danger">
            {t(assign.error instanceof ApiError ? assign.error.message : 'errors.internal')}
          </p>
        )}
      </div>
    </Modal>
  );
}
