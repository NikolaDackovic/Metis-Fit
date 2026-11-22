import type { MemberDto, TrainerAdminDto, TrainerClientDto } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Eye, EyeOff, Plus, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Card, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useCan } from '@/lib/me';
import { AvailabilityField } from './AvailabilityField';
import { useTrainers } from './classes-utils';
import { squareJpeg } from './resize-image';

const LOCALES = ['sr', 'en', 'ru'] as const;

export function TrainersPage() {
  const { t } = useTranslation();
  const can = useCan();
  const q = useTrainers();
  const [editing, setEditing] = useState<TrainerAdminDto | 'new' | null>(null);
  const manage = can('trainers.manage');
  return (
    <>
      <PageHeader
        title={t('admin.trainers.title')}
        subtitle={t('admin.trainers.subtitle')}
        actions={
          manage && (
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              {t('admin.trainers.new')}
            </Button>
          )
        }
      />
      <Card>
        {q.isPending ? (
          <TableSkeleton rows={4} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title={t('admin.trainers.empty')}
            description={t('admin.trainers.consent_hint')}
          />
        ) : (
          <ul className="grid gap-px bg-border-subtle sm:grid-cols-2 xl:grid-cols-3">
            {q.data.map((tr) => (
              <li key={tr.id} className="bg-bg-surface">
                <button
                  type="button"
                  disabled={!manage}
                  onClick={() => setEditing(tr)}
                  className="flex h-full w-full items-start gap-3 p-4 text-start enabled:hover:bg-bg-surface2"
                  style={{ opacity: tr.archivedAt ? 0.5 : 1 }}
                >
                  <Avatar trainer={tr} className="size-14" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {tr.firstName} {tr.lastName}
                    </span>
                    <span className="block truncate text-sm text-text-secondary">
                      {tr.title ?? '-'}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {tr.archivedAt ? (
                        <Badge>{t('admin.trainers.archived')}</Badge>
                      ) : tr.isPublic ? (
                        <Badge tone="success">
                          <Eye className="size-3" aria-hidden /> {t('admin.trainers.public')}
                        </Badge>
                      ) : (
                        <Badge>
                          <EyeOff className="size-3" aria-hidden /> {t('admin.trainers.hidden')}
                        </Badge>
                      )}
                      {tr.offersPersonalTraining && (
                        <Badge tone="accent">{t('admin.trainers.pt')}</Badge>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && (
        <TrainerModal
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function TrainerModal({
  existing,
  onClose,
}: {
  existing: TrainerAdminDto | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState(existing?.firstName ?? '');
  const [lastName, setLastName] = useState(existing?.lastName ?? '');
  const [instagram, setInstagram] = useState(existing?.instagram ?? '');
  const [isPublic, setIsPublic] = useState(existing?.isPublic ?? false);
  const [pt, setPt] = useState(existing?.offersPersonalTraining ?? true);
  const [lang, setLang] = useState<(typeof LOCALES)[number]>(
    (LOCALES as readonly string[]).includes(i18n.language)
      ? (i18n.language as (typeof LOCALES)[number])
      : 'sr',
  );
  const [tr, setTr] = useState(() =>
    Object.fromEntries(
      LOCALES.map((l) => [
        l,
        {
          title: existing?.translations[l]?.title ?? '',
          bio: existing?.translations[l]?.bio ?? '',
        },
      ]),
    ),
  );
  const save = useMutation({
    mutationFn: (extra: { archived?: boolean } = {}) => {
      const body = {
        firstName,
        lastName,
        instagram: instagram || null,
        isPublic,
        offersPersonalTraining: pt,
        translations: Object.fromEntries(
          LOCALES.map((l) => [l, { title: tr[l]!.title || null, bio: tr[l]!.bio || null }]),
        ),
        ...extra,
      };
      return existing
        ? api.patch(`/admin/trainers/${existing.id}`, body)
        : api.post('/admin/trainers', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['trainers'] });
      toast.success(t('admin.trainers.saved'));
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? `${existing.firstName} ${existing.lastName}` : t('admin.trainers.new')}
      footer={
        <>
          {existing && (
            <Button
              variant={existing.archivedAt ? 'secondary' : 'danger'}
              className="me-auto"
              onClick={() => save.mutate({ archived: !existing.archivedAt })}
            >
              {existing.archivedAt ? t('admin.trainers.restore') : t('admin.trainers.archive')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            disabled={!firstName.trim() || !lastName.trim()}
            onClick={() => save.mutate({})}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {existing && <PhotoField trainer={existing} />}
        <Field label={t('admin.fields.first_name')} required>
          {(p) => <Input {...p} value={firstName} onChange={(e) => setFirstName(e.target.value)} />}
        </Field>
        <Field label={t('admin.fields.last_name')} required>
          {(p) => <Input {...p} value={lastName} onChange={(e) => setLastName(e.target.value)} />}
        </Field>
        <Field label="Instagram" hint={t('admin.trainers.instagram_hint')}>
          {(p) => (
            <Input
              {...p}
              value={instagram}
              placeholder="@"
              onChange={(e) => setInstagram(e.target.value)}
            />
          )}
        </Field>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pt}
              onChange={(e) => setPt(e.target.checked)}
              className="size-4 accent-accent-500"
            />
            {t('admin.trainers.offers_pt')}
          </label>
        </div>
        <div className="sm:col-span-2">
          <div role="tablist" className="mb-3 flex gap-1">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={lang === l}
                onClick={() => setLang(l)}
                className={
                  lang === l
                    ? 'h-8 rounded-sm border border-accent-500 bg-accent-tint px-3 text-xs font-semibold'
                    : 'h-8 rounded-sm border border-border-subtle px-3 text-xs font-semibold text-text-secondary'
                }
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="grid gap-4">
            <Field label={t('admin.trainers.title_field')} hint={t('admin.trainers.title_hint')}>
              {(p) => (
                <Input
                  {...p}
                  value={tr[lang]!.title}
                  onChange={(e) =>
                    setTr({ ...tr, [lang]: { ...tr[lang]!, title: e.target.value } })
                  }
                />
              )}
            </Field>
            <Field label={t('admin.trainers.bio')}>
              {(p) => (
                <Textarea
                  {...p}
                  value={tr[lang]!.bio}
                  maxLength={2000}
                  onChange={(e) => setTr({ ...tr, [lang]: { ...tr[lang]!, bio: e.target.value } })}
                />
              )}
            </Field>
          </div>
        </div>
        <label className="flex items-start gap-2 rounded-sm border border-border-subtle p-3 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="mt-0.5 size-4 accent-accent-500"
          />
          <span>
            <span className="block font-semibold">{t('admin.trainers.show_public')}</span>
            <span className="text-text-secondary">{t('admin.trainers.consent_hint')}</span>
          </span>
        </label>
        {existing && !existing.archivedAt && pt && <AvailabilityField trainerId={existing.id} />}
        {existing && !existing.archivedAt && <ClientsField trainer={existing} />}
        {save.error && (
          <p role="alert" className="text-sm text-status-danger sm:col-span-2">
            {t(save.error instanceof ApiError ? save.error.message : 'errors.internal')}
          </p>
        )}
      </div>
    </Modal>
  );
}

function Avatar({ trainer, className }: { trainer: TrainerAdminDto; className?: string }) {
  return trainer.photoUrl ? (
    <img
      src={trainer.photoUrl}
      alt=""
      className={`${className} shrink-0 rounded-full object-cover`}
      loading="lazy"
    />
  ) : (
    <span
      className={`${className} grid shrink-0 place-items-center rounded-full bg-accent-tint font-display text-sm text-accent-400`}
      aria-hidden
    >
      {trainer.firstName.replace(/\[.*?\]\s*/, '').charAt(0)}
      {trainer.lastName.charAt(0)}
    </span>
  );
}

/** Upload / replace / remove the photo. The image is cropped to a square in the browser. */
function PhotoField({ trainer }: { trainer: TrainerAdminDto }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [current, setCurrent] = useState(trainer);
  const upload = useMutation({
    mutationFn: async (file: File) =>
      api.put<TrainerAdminDto>(`/admin/trainers/${trainer.id}/photo`, {
        image: await squareJpeg(file),
      }),
    onSuccess: (d) => {
      setCurrent(d);
      void qc.invalidateQueries({ queryKey: ['trainers'] });
      toast.success(t('admin.trainers.photo_saved'));
    },
  });
  const remove = useMutation({
    mutationFn: () => api.del<TrainerAdminDto>(`/admin/trainers/${trainer.id}/photo`),
    onSuccess: (d) => {
      setCurrent(d);
      void qc.invalidateQueries({ queryKey: ['trainers'] });
    },
  });
  const error = upload.error ?? remove.error;
  return (
    <div className="flex items-center gap-4 sm:col-span-2">
      <Avatar trainer={current} className="size-20" />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border border-border-strong bg-bg-surface2 px-3 text-sm font-semibold focus-within:outline-2 focus-within:outline-accent-400 hover:bg-bg-elevated">
            <Camera className="size-4" aria-hidden />
            {upload.isPending
              ? t('admin.trainers.photo_uploading')
              : current.photoUrl
                ? t('admin.trainers.photo_change')
                : t('admin.trainers.photo_add')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={upload.isPending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = '';
              }}
            />
          </label>
          {current.photoUrl && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {t('admin.trainers.photo_remove')}
            </Button>
          )}
        </div>
        <p className="text-xs text-text-secondary">{t('admin.trainers.photo_hint')}</p>
        {error && (
          <p role="alert" className="text-xs text-status-danger">
            {t(error instanceof ApiError ? error.message : 'errors.internal')}
          </p>
        )}
      </div>
    </div>
  );
}

/** Members assigned to this trainer. Assigning does not reveal anything: the member decides. */
function ClientsField({ trainer }: { trainer: TrainerAdminDto }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const key = ['trainer-clients', trainer.id];
  const clients = useQuery({
    queryKey: key,
    queryFn: () => api.get<TrainerClientDto[]>(`/admin/trainers/${trainer.id}/clients`),
  });
  const term = q.trim();
  const search = useQuery({
    queryKey: ['members', 'search', term],
    queryFn: () => api.get<MemberDto[]>('/admin/members', { q: term, pageSize: 5 }),
    enabled: term.length >= 2,
  });
  const add = useMutation({
    mutationFn: (memberId: string) =>
      api.post<TrainerClientDto[]>(`/admin/trainers/${trainer.id}/clients`, { memberId }),
    onSuccess: (d) => {
      qc.setQueryData(key, d);
      setQ('');
    },
    onError: (e) => toast.error(t(e instanceof ApiError ? e.message : 'errors.internal')),
  });
  const end = useMutation({
    mutationFn: (id: string) => api.post<TrainerClientDto[]>(`/admin/trainer-clients/${id}/end`),
    onSuccess: (d) => qc.setQueryData(key, d),
  });
  const ids = new Set((clients.data ?? []).map((c) => c.memberId));
  return (
    <div className="sm:col-span-2">
      <p className="mb-1 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        {t('admin.clients.title')}
      </p>
      <p className="mb-2 text-xs text-text-secondary">{t('admin.clients.assign_hint')}</p>
      <ul className="mb-2 divide-y divide-border-subtle rounded-sm border border-border-subtle">
        {(clients.data ?? []).length === 0 && (
          <li className="px-3 py-2 text-sm text-text-secondary">{t('admin.clients.none')}</li>
        )}
        {clients.data?.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              {c.firstName} {c.lastName}
            </span>
            <Badge tone={c.sharesProgress ? 'success' : 'neutral'}>
              {c.sharesProgress ? t('admin.clients.shares') : t('admin.clients.private')}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              loading={end.isPending && end.variables === c.id}
              onClick={() => end.mutate(c.id)}
            >
              {t('admin.clients.end')}
            </Button>
          </li>
        ))}
      </ul>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('admin.classes.search_member')}
        aria-label={t('admin.clients.add')}
      />
      {term.length >= 2 &&
        search.data
          ?.filter((m) => !ids.has(m.id))
          .map((m) => (
            <div key={m.id} className="flex items-center gap-2 px-1 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {m.firstName} {m.lastName}{' '}
                <span className="text-text-secondary">{m.memberNumber}</span>
              </span>
              <Button size="sm" variant="secondary" onClick={() => add.mutate(m.id)}>
                {t('admin.clients.add')}
              </Button>
            </div>
          ))}
    </div>
  );
}
