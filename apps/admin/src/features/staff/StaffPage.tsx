import type {
  InviteStaffBody,
  RoleDto,
  RolesDto,
  StaffDto,
  TrainerAdminDto,
} from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, CardHeader, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Table';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useCan, useMe } from '@/lib/me';

type Tab = 'staff' | 'roles';

export function useRoleLabel() {
  const { t, i18n } = useTranslation();
  return (r: { key: string; name?: string | null }) =>
    r.name ?? (i18n.exists(`admin.roles.${r.key}`) ? t(`admin.roles.${r.key}`) : r.key);
}

/** Staff accounts and what each role may do. */
export function StaffPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('staff');
  return (
    <>
      <PageHeader title={t('admin.staff.title')} subtitle={t('admin.staff.subtitle')} />
      <Tabs
        tabs={[
          { value: 'staff', label: t('admin.staff.tab_staff') },
          { value: 'roles', label: t('admin.staff.tab_roles') },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="mt-4">{tab === 'staff' ? <StaffTab /> : <RolesTab />}</div>
    </>
  );
}

function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => api.get<RolesDto>('/admin/roles') });
}

function StaffTab() {
  const { t } = useTranslation();
  const me = useMe();
  const label = useRoleLabel();
  const q = useQuery({ queryKey: ['staff'], queryFn: () => api.get<StaffDto[]>('/admin/staff') });
  const [editing, setEditing] = useState<StaffDto | 'new' | null>(null);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <Card>
      <CardHeader
        title={t('admin.staff.tab_staff')}
        action={
          <Button
            size="sm"
            icon={<UserPlus className="size-4" />}
            onClick={() => setEditing('new')}
          >
            {t('admin.staff.add')}
          </Button>
        }
      />
      {q.isPending ? (
        <Skeleton className="m-4 h-40" />
      ) : (
        <ul className="divide-y divide-border-subtle text-sm">
          {q.data.map((s) => (
            <li
              key={s.userId}
              className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${s.deactivated ? 'opacity-50' : ''}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {s.firstName} {s.lastName}
                  {s.userId === me.data?.id && (
                    <span className="ms-2 text-xs font-normal text-text-secondary">
                      ({t('admin.staff.you')})
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-text-secondary">{s.email ?? '-'}</span>
              </span>
              <span className="flex min-w-0 flex-wrap gap-1">
                {s.roles.map((r) => (
                  <Badge key={r} tone={r === 'owner' ? 'accent' : 'neutral'}>
                    {label({ key: r, name: null })}
                  </Badge>
                ))}
                {s.trainerId && <Badge tone="info">{t('admin.staff.trainer_profile')}</Badge>}
                {s.deactivated && <Badge tone="danger">{t('admin.staff.deactivated')}</Badge>}
              </span>
              {s.userId !== me.data?.id && (
                <IconButton label={t('common.edit')} onClick={() => setEditing(s)}>
                  <Pencil className="size-4" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <StaffModal
          staff={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function StaffModal({ staff, onClose }: { staff?: StaffDto; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const label = useRoleLabel();
  const roles = useRoles();
  const trainers = useQuery({
    queryKey: ['trainers-admin'],
    queryFn: () => api.get<TrainerAdminDto[]>('/admin/trainers'),
  });
  const [email, setEmail] = useState('');
  const [first, setFirst] = useState(staff?.firstName ?? '');
  const [last, setLast] = useState(staff?.lastName ?? '');
  const [picked, setPicked] = useState<string[]>(staff?.roles ?? []);
  const [trainerId, setTrainerId] = useState(staff?.trainerId ?? '');
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['staff'] });
    void qc.invalidateQueries({ queryKey: ['roles'] });
    onClose();
  };
  const save = useMutation({
    mutationFn: () =>
      staff
        ? api.put(`/admin/staff/${staff.userId}`, { roles: picked, trainerId: trainerId || null })
        : api.post('/admin/staff', {
            email,
            firstName: first,
            lastName: last,
            roles: picked,
            trainerId: trainerId || null,
          } satisfies InviteStaffBody),
    onSuccess: () => {
      toast.success(t(staff ? 'admin.staff.saved' : 'admin.staff.invited'));
      done();
    },
  });
  const active = useMutation({
    mutationFn: (on: boolean) => api.post(`/admin/staff/${staff!.userId}/active`, { active: on }),
    onSuccess: done,
    onError: (e) => toast.error(t(e instanceof ApiError ? e.message : 'errors.internal')),
  });
  const valid =
    picked.length > 0 && (staff || (email.includes('@') && first.trim() && last.trim()));
  return (
    <Modal
      open
      onClose={onClose}
      title={staff ? `${staff.firstName} ${staff.lastName}` : t('admin.staff.add')}
      footer={
        <>
          {staff && (
            <Button
              variant="ghost"
              className="me-auto"
              loading={active.isPending}
              onClick={() => active.mutate(staff.deactivated)}
            >
              {staff.deactivated ? t('admin.staff.reactivate') : t('admin.staff.deactivate')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            {staff ? t('common.save') : t('admin.staff.invite')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!staff && (
          <>
            <Field label={t('admin.fields.email')} hint={t('admin.staff.invite_hint')} required>
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('admin.fields.first_name')} required>
                {(p) => (
                  <Input
                    {...p}
                    value={first}
                    maxLength={80}
                    onChange={(e) => setFirst(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t('admin.fields.last_name')} required>
                {(p) => (
                  <Input
                    {...p}
                    value={last}
                    maxLength={80}
                    onChange={(e) => setLast(e.target.value)}
                  />
                )}
              </Field>
            </div>
          </>
        )}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('admin.staff.roles')}</legend>
          <div className="flex flex-wrap gap-2">
            {(roles.data?.roles ?? []).map((r) => {
              const on = picked.includes(r.key);
              return (
                <label
                  key={r.key}
                  className={`flex cursor-pointer items-center gap-2 rounded-sm border px-2.5 py-1.5 text-sm ${on ? 'border-accent-500 bg-accent-tint' : 'border-border-subtle'}`}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-accent-500)]"
                    checked={on}
                    onChange={() =>
                      setPicked(on ? picked.filter((x) => x !== r.key) : [...picked, r.key])
                    }
                  />
                  {label(r)}
                </label>
              );
            })}
          </div>
        </fieldset>
        <Field label={t('admin.staff.trainer_link')} hint={t('admin.staff.trainer_link_hint')}>
          {(p) => (
            <Select {...p} value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
              <option value="">{t('admin.staff.no_trainer')}</option>
              {(trainers.data ?? [])
                .filter((x) => !x.archivedAt)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.firstName} {x.lastName}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        {save.error && (
          <p role="alert" className="text-sm text-status-danger">
            {t(save.error instanceof ApiError ? save.error.message : 'errors.internal')}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Permission matrix: rows = permissions, one role edited at a time (owner locked). */
function RolesTab() {
  const { t } = useTranslation();
  const can = useCan();
  const qc = useQueryClient();
  const label = useRoleLabel();
  const q = useRoles();
  const [selected, setSelected] = useState<string>('manager');
  const [draft, setDraft] = useState<string[] | null>(null);
  const [creating, setCreating] = useState(false);
  const editable = can('roles.manage');
  const role = q.data?.roles.find((r) => r.key === selected) ?? q.data?.roles[0];
  const perms = draft ?? role?.permissions ?? [];
  const save = useMutation({
    mutationFn: () => api.put(`/admin/roles/${role!.key}/permissions`, { permissions: perms }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['roles'] });
      setDraft(null);
      toast.success(t('admin.staff.saved'));
    },
    onError: (e) => toast.error(t(e instanceof ApiError ? e.message : 'errors.internal')),
  });
  const remove = useMutation({
    mutationFn: (key: string) => api.del(`/admin/roles/${key}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['roles'] });
      setSelected('manager');
    },
    onError: (e) => toast.error(t(e instanceof ApiError ? e.message : 'errors.internal')),
  });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data || !role) return <Skeleton className="h-64" />;
  const groups = Object.entries(
    q.data.permissions.reduce<Record<string, RolesDto['permissions']>>((acc, p) => {
      (acc[p.key.split('.')[0]!] ??= []).push(p);
      return acc;
    }, {}),
  );
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
      <Card>
        <CardHeader
          title={t('admin.staff.tab_roles')}
          action={
            editable ? (
              <IconButton label={t('admin.staff.new_role')} onClick={() => setCreating(true)}>
                <Plus className="size-4" />
              </IconButton>
            ) : undefined
          }
        />
        <ul className="divide-y divide-border-subtle text-sm">
          {q.data.roles.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => {
                  setSelected(r.key);
                  setDraft(null);
                }}
                className={`flex w-full items-center gap-2 px-4 py-2.5 text-start ${r.key === role.key ? 'bg-accent-tint font-semibold' : 'hover:bg-bg-surface2'}`}
              >
                {r.locked && <Lock className="size-3.5 shrink-0 text-text-secondary" aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{label(r)}</span>
                <span className="text-xs text-text-secondary tabular-nums">{r.users}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader
          title={label(role)}
          action={
            editable && !role.locked ? (
              <div className="flex gap-2">
                {!role.isSystem && (
                  <IconButton
                    label={t('admin.staff.delete_role')}
                    onClick={() => remove.mutate(role.key)}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                )}
                <Button
                  size="sm"
                  disabled={!draft}
                  loading={save.isPending}
                  onClick={() => save.mutate()}
                >
                  {t('common.save')}
                </Button>
              </div>
            ) : undefined
          }
        />
        {role.locked && (
          <p className="px-4 pt-3 text-xs text-text-secondary">{t('admin.staff.owner_locked')}</p>
        )}
        {!editable && (
          <p className="px-4 pt-3 text-xs text-text-secondary">{t('admin.staff.view_only')}</p>
        )}
        <div className="grid gap-4 p-4 md:grid-cols-2">
          {groups.map(([group, list]) => (
            <fieldset key={group} className="min-w-0 rounded-sm border border-border-subtle p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {t(`admin.permissions.groups.${group}`, { defaultValue: group })}
              </legend>
              <ul className="flex flex-col gap-1.5">
                {list.map((p) => {
                  const on = perms.includes(p.key);
                  return (
                    <li key={p.key}>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent-500)]"
                          checked={on}
                          disabled={!editable || role.locked}
                          onChange={() =>
                            setDraft(on ? perms.filter((x) => x !== p.key) : [...perms, p.key])
                          }
                        />
                        <span className="min-w-0 break-words">
                          {t(`admin.permissions.items.${p.key.replace('.', '_')}`, {
                            defaultValue: p.description,
                          })}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ))}
        </div>
      </Card>
      {creating && (
        <NewRoleModal
          roles={q.data.roles}
          onClose={() => setCreating(false)}
          onCreated={setSelected}
        />
      )}
    </div>
  );
}

function NewRoleModal({
  roles,
  onClose,
  onCreated,
}: {
  roles: RoleDto[];
  onClose: () => void;
  onCreated: (key: string) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const label = useRoleLabel();
  const [name, setName] = useState('');
  const [copyFrom, setCopyFrom] = useState('');
  const key =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'dj')
      .replace(/[^a-z]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || '';
  const save = useMutation({
    mutationFn: () =>
      api.post('/admin/roles', { key, name: name.trim(), copyFrom: copyFrom || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['roles'] });
      onCreated(key);
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.staff.new_role')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={key.length < 2} loading={save.isPending} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('admin.staff.role_name')} required>
          {(p) => (
            <Input {...p} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          )}
        </Field>
        <Field label={t('admin.staff.copy_from')}>
          {(p) => (
            <Select {...p} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">{t('admin.staff.empty_role')}</option>
              {roles
                .filter((r) => !r.locked)
                .map((r) => (
                  <option key={r.key} value={r.key}>
                    {label(r)}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        {save.error && (
          <p role="alert" className="text-sm text-status-danger">
            {t(save.error instanceof ApiError ? save.error.message : 'errors.internal')}
          </p>
        )}
      </div>
    </Modal>
  );
}
