import type { ClubAdminDto, ClubPhotoDto, ClubProfileBody } from '@grit/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ImagePlus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { accentPalette, isDarkEnough } from '@grit/design-tokens';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Card, CardHeader, ErrorState, PageHeader, Skeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { fitImage } from '../classes/resize-image';
import { BusyCard } from './BusyCard';

const LOCALES = ['sr', 'en', 'ru', 'ar'] as const;
type Lang = (typeof LOCALES)[number];
const KEY = ['admin-club'];

/** Club profile: everything club-specific in the apps (name, contact, logo, photos) lives here. */
export function ClubPage() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: KEY, queryFn: () => api.get<ClubAdminDto>('/admin/club') });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <>
      <PageHeader title={t('admin.club.title')} subtitle={t('admin.club.subtitle')} />
      {!q.data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ProfileCard data={q.data} />
          <div className="flex flex-col gap-4">
            <MediaCard data={q.data} />
            <HoursCard data={q.data} />
            <BusyCard />
          </div>
          <div className="xl:col-span-2">
            <GalleryCard photos={q.data.photos} />
          </div>
        </div>
      )}
    </>
  );
}

function useSave<T>(fn: (v: T) => Promise<ClubAdminDto>, message = 'admin.club.saved') {
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (d) => {
      qc.setQueryData(KEY, d);
      // Apps and the admin itself read the public profile (logo, name, photos).
      void qc.invalidateQueries({ queryKey: ['public-club'] });
      toast.success(t(message));
    },
    onError: (e) => toast.error(t(e instanceof ApiError ? e.message : 'errors.internal')),
  });
}

function LangTabs({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="flex gap-1" role="tablist">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          role="tab"
          aria-selected={l === value}
          onClick={() => onChange(l)}
          className={`rounded-sm px-2.5 py-1 text-xs font-semibold uppercase ${l === value ? 'bg-accent-tint text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function ProfileCard({ data }: { data: ClubAdminDto }) {
  const { t } = useTranslation();
  const [f, setF] = useState(data.profile);
  const [lang, setLang] = useState<Lang>('sr');
  useEffect(() => setF(data.profile), [data.profile]);
  const save = useSave((b: ClubProfileBody) => api.put<ClubAdminDto>('/admin/club', b));
  const text = (k: 'phone' | 'email' | 'address' | 'website' | 'instagram' | 'facebook') => ({
    value: f[k] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }),
  });

  return (
    <Card>
      <CardHeader title={t('admin.club.profile')} />
      <form
        className="grid gap-4 p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ ...f, tagline: f.tagline } as ClubProfileBody);
        }}
      >
        <Field label={t('admin.club.name')} required>
          {(p) => (
            <Input
              {...p}
              value={f.name}
              maxLength={80}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          )}
        </Field>
        <Field label={t('admin.club.short_name')} hint={t('admin.club.short_name_hint')} required>
          {(p) => (
            <Input
              {...p}
              value={f.shortName}
              maxLength={24}
              onChange={(e) => setF({ ...f, shortName: e.target.value })}
            />
          )}
        </Field>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{t('admin.club.tagline')}</span>
            <LangTabs value={lang} onChange={setLang} />
          </div>
          <Input
            aria-label={`${t('admin.club.tagline')} (${lang})`}
            dir={lang === 'ar' ? 'rtl' : undefined}
            value={f.tagline[lang] ?? ''}
            maxLength={200}
            onChange={(e) => setF({ ...f, tagline: { ...f.tagline, [lang]: e.target.value } })}
          />
        </div>
        <Field label={t('admin.club.phone')}>
          {(p) => <Input {...p} {...text('phone')} maxLength={40} />}
        </Field>
        <Field label={t('admin.club.email')}>
          {(p) => <Input {...p} type="email" {...text('email')} />}
        </Field>
        <Field label={t('admin.club.address')} className="sm:col-span-2">
          {(p) => <Input {...p} {...text('address')} maxLength={200} />}
        </Field>
        <Field label={t('admin.club.website')}>
          {(p) => <Input {...p} {...text('website')} placeholder="https://" />}
        </Field>
        <Field label="Instagram">
          {(p) => <Input {...p} {...text('instagram')} placeholder="https://" />}
        </Field>
        <Field label="Facebook">
          {(p) => <Input {...p} {...text('facebook')} placeholder="https://" />}
        </Field>
        <div className="flex flex-col gap-3 rounded-sm border border-border-subtle p-3 sm:col-span-2">
          <p className="text-sm font-semibold">{t('admin.club.colors')}</p>
          <p className="text-xs text-text-secondary">{t('admin.club.colors_hint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['accentColor', t('admin.club.accent_color'), '#E54E26'],
                ['backgroundColor', t('admin.club.background_color'), '#080808'],
              ] as const
            ).map(([k, label, fallback]) => (
              <div key={k} className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={label}
                  value={f[k] ?? fallback}
                  onChange={(e) => setF({ ...f, [k]: e.target.value.toUpperCase() })}
                  className="h-10 w-12 shrink-0 cursor-pointer rounded-sm border border-border-subtle bg-transparent"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{label}</p>
                  <p className="text-xs text-text-secondary tabular-nums">
                    {f[k] ?? `${fallback} (${t('admin.club.default_color')})`}
                  </p>
                </div>
                {f[k] && (
                  <Button size="sm" variant="ghost" onClick={() => setF({ ...f, [k]: null })}>
                    {t('admin.club.reset')}
                  </Button>
                )}
              </div>
            ))}
          </div>
          {f.backgroundColor && !isDarkEnough(f.backgroundColor) && (
            <p role="alert" className="text-xs text-status-warning">
              {t('validation.background_too_light')}
            </p>
          )}
          <div
            className="flex items-center gap-3 rounded-sm p-3"
            style={{ background: f.backgroundColor ?? '#080808' }}
            aria-hidden
          >
            <span
              className="rounded-sm px-3 py-1.5 text-sm font-semibold"
              style={{
                background: f.accentColor ?? '#E54E26',
                color: accentPalette(f.accentColor ?? '#E54E26').onAccent,
              }}
            >
              {t('admin.club.preview_button')}
            </span>
            <span className="text-sm text-white">{t('admin.club.preview_text')}</span>
          </div>
        </div>
        <div className="flex items-end justify-end sm:col-span-2">
          <Button
            type="submit"
            loading={save.isPending}
            disabled={!f.name.trim() || !f.shortName.trim()}
          >
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function pick(accept = 'image/jpeg,image/png,image/webp'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

function MediaCard({ data }: { data: ClubAdminDto }) {
  const { t } = useTranslation();
  const upload = useSave(async ({ slot, file }: { slot: 'logo' | 'login_image'; file: File }) =>
    api.put<ClubAdminDto>(`/admin/club/media/${slot}`, {
      image: await fitImage(
        file,
        slot === 'logo' ? 800 : 1920,
        slot === 'logo' ? 'image/png' : 'image/jpeg',
      ),
    }),
  );
  const reset = useSave((slot: 'logo' | 'login_image') =>
    api.del<ClubAdminDto>(`/admin/club/media/${slot}`),
  );
  const slots = [
    {
      slot: 'logo' as const,
      label: t('admin.club.logo'),
      hint: t('admin.club.logo_hint'),
      url: data.logoUrl,
    },
    // The sign-in screens use the same photo for every gym (platform look), so no upload here.
  ];
  return (
    <Card>
      <CardHeader title={t('admin.club.branding')} />
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        {slots.map((s) => (
          <div key={s.slot} className="flex flex-col gap-2">
            <span className="text-sm font-semibold">{s.label}</span>
            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-sm border border-border-subtle bg-bg-surface2">
              {s.url ? (
                <img
                  src={s.url}
                  alt=""
                  className={
                    s.slot === 'logo'
                      ? 'max-h-16 max-w-[80%] object-contain'
                      : 'size-full object-cover'
                  }
                />
              ) : (
                <span className="text-xs text-text-secondary">{t('admin.club.default_logo')}</span>
              )}
            </div>
            <p className="text-xs text-text-secondary">{s.hint}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<Upload className="size-4" />}
                loading={upload.isPending && upload.variables?.slot === s.slot}
                onClick={async () => {
                  const file = await pick(
                    s.slot === 'logo' ? 'image/png,image/webp,image/jpeg' : undefined,
                  );
                  if (file) upload.mutate({ slot: s.slot, file });
                }}
              >
                {t('admin.club.upload')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<RotateCcw className="size-4" />}
                loading={reset.isPending && reset.variables === s.slot}
                onClick={() => reset.mutate(s.slot)}
              >
                {t('admin.club.reset')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function HoursCard({ data }: { data: ClubAdminDto }) {
  const { t } = useTranslation();
  const [days, setDays] = useState(data.openingHours);
  useEffect(() => setDays(data.openingHours), [data.openingHours]);
  const save = useSave(() =>
    api.put<ClubAdminDto>('/admin/club/hours', {
      days: days.map((d) => ({
        ...d,
        opensAt: d.isClosed ? null : d.opensAt,
        closesAt: d.isClosed ? null : d.closesAt,
      })),
    }),
  );
  const set = (i: number, patch: Partial<(typeof days)[number]>) =>
    setDays(days.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <Card>
      <CardHeader
        title={t('admin.club.hours')}
        action={
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate(undefined)}>
            {t('common.save')}
          </Button>
        }
      />
      <ul className="divide-y divide-border-subtle">
        {days.map((d, i) => (
          <li key={d.weekday} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
            <span className="w-28 font-semibold">{t(`admin.club.weekday.${d.weekday}`)}</span>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-accent-500)]"
                checked={d.isClosed}
                onChange={(e) =>
                  set(i, {
                    isClosed: e.target.checked,
                    opensAt: d.opensAt ?? '07:00',
                    closesAt: d.closesAt ?? '22:00',
                  })
                }
              />
              {t('admin.club.closed')}
            </label>
            {!d.isClosed && (
              <span className="flex items-center gap-2">
                <Input
                  type="time"
                  aria-label={t('admin.club.opens')}
                  value={d.opensAt ?? ''}
                  onChange={(e) => set(i, { opensAt: e.target.value })}
                  className="w-28"
                />
                -
                <Input
                  type="time"
                  aria-label={t('admin.club.closes')}
                  value={d.closesAt ?? ''}
                  onChange={(e) => set(i, { closesAt: e.target.value })}
                  className="w-28"
                />
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function GalleryCard({ photos }: { photos: ClubPhotoDto[] }) {
  const { t } = useTranslation();
  const [lang, setLang] = useState<Lang>('sr');
  const add = useSave(async (file: File) =>
    api.post<ClubAdminDto>('/admin/club/media/photos', {
      image: await fitImage(file, 1600),
      captions: {},
    }),
  );
  const update = useSave((p: { id: string; captions: Record<string, string>; sortOrder: number }) =>
    api.put<ClubAdminDto>(`/admin/club/photos/${p.id}`, {
      captions: p.captions,
      sortOrder: p.sortOrder,
    }),
  );
  const remove = useSave(
    (id: string) => api.del<ClubAdminDto>(`/admin/club/photos/${id}`),
    'admin.club.photo_removed',
  );
  const swap = (i: number, j: number) => {
    const a = photos[i]!;
    const b = photos[j]!;
    // Distinct positions even when the stored ones are equal.
    update.mutate({ id: a.id, captions: a.captions, sortOrder: j * 10 + (j > i ? 5 : -5) });
    update.mutate({ id: b.id, captions: b.captions, sortOrder: i * 10 });
  };
  return (
    <Card>
      <CardHeader
        title={t('admin.club.gallery')}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <LangTabs value={lang} onChange={setLang} />
            <Button
              size="sm"
              icon={<ImagePlus className="size-4" />}
              loading={add.isPending}
              onClick={async () => {
                const f = await pick();
                if (f) add.mutate(f);
              }}
            >
              {t('admin.club.add_photo')}
            </Button>
          </div>
        }
      />
      <p className="px-4 pt-3 text-xs text-text-secondary">{t('admin.club.gallery_hint')}</p>
      <ul className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((p, i) => (
          <PhotoItem
            key={p.id}
            photo={p}
            lang={lang}
            first={i === 0}
            last={i === photos.length - 1}
            onCaption={(captions) => update.mutate({ id: p.id, captions, sortOrder: p.sortOrder })}
            onUp={() => swap(i, i - 1)}
            onDown={() => swap(i, i + 1)}
            onRemove={() => {
              if (window.confirm(t('admin.club.remove_photo_confirm'))) remove.mutate(p.id);
            }}
          />
        ))}
      </ul>
    </Card>
  );
}

function PhotoItem({
  photo,
  lang,
  first,
  last,
  onCaption,
  onUp,
  onDown,
  onRemove,
}: {
  photo: ClubPhotoDto;
  lang: Lang;
  first: boolean;
  last: boolean;
  onCaption: (c: Record<string, string>) => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [caption, setCaption] = useState(photo.captions[lang] ?? '');
  const saved = useRef(photo.captions[lang] ?? '');
  useEffect(() => {
    setCaption(photo.captions[lang] ?? '');
    saved.current = photo.captions[lang] ?? '';
  }, [photo.captions, lang]);
  return (
    <li className="flex flex-col gap-2 rounded-sm border border-border-subtle p-2">
      <img
        src={photo.url}
        alt={caption}
        className="aspect-video w-full rounded-xs object-cover"
        loading="lazy"
      />
      <Input
        aria-label={`${t('admin.club.caption')} (${lang})`}
        placeholder={t('admin.club.caption')}
        dir={lang === 'ar' ? 'rtl' : undefined}
        value={caption}
        maxLength={80}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => {
          if (caption.trim() !== saved.current)
            onCaption({ ...photo.captions, [lang]: caption.trim() });
        }}
      />
      <div className="flex justify-end gap-1">
        <IconButton label={t('admin.club.move_up')} disabled={first} onClick={onUp}>
          <ArrowUp className="size-4" />
        </IconButton>
        <IconButton label={t('admin.club.move_down')} disabled={last} onClick={onDown}>
          <ArrowDown className="size-4" />
        </IconButton>
        <IconButton label={t('admin.club.remove_photo')} onClick={onRemove}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </li>
  );
}
