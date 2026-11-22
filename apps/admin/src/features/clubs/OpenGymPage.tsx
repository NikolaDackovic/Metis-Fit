import type { MyClubDto } from '@grit/validation';
import { useMutation } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Card } from '@/components/ui/States';
import { api, ApiError } from '@/lib/api';
import { switchClub } from '@/lib/current-club';

/**
 * "Open your gym" (F12-3): anyone signed in can register a gym. It is created pending, with the
 * person as its owner; they can set everything up right away, members see it after approval.
 */
export function OpenGymForm({ onCancel }: { onCancel?: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: '',
    city: '',
    address: '',
    phone: '',
    email: '',
    slug: '',
  });
  const save = useMutation({
    mutationFn: () => api.post<MyClubDto>('/me/clubs', form),
    // Straight into the new gym's admin: the club profile is the first thing to fill in.
    onSuccess: (club) => switchClub(club.slug, '/club'),
  });
  const errors = save.error instanceof ApiError ? save.error.fieldErrors() : {};
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <Card className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-md bg-accent-tint text-accent-400">
          <Building2 className="size-5" />
        </span>
        <div>
          <h1 className="text-lg font-bold">{t('admin.open_gym.title')}</h1>
          <p className="text-sm text-text-secondary">{t('admin.open_gym.subtitle')}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t('admin.open_gym.name')}
          required
          className="sm:col-span-2"
          error={errors.name}
        >
          {(p) => <Input {...p} value={form.name} onChange={set('name')} autoFocus />}
        </Field>
        <Field label={t('admin.open_gym.city')} required error={errors.city}>
          {(p) => <Input {...p} value={form.city} onChange={set('city')} />}
        </Field>
        <Field label={t('admin.open_gym.address')} error={errors.address}>
          {(p) => <Input {...p} value={form.address} onChange={set('address')} />}
        </Field>
        <Field label={t('admin.fields.phone')} error={errors.phone}>
          {(p) => <Input {...p} type="tel" value={form.phone} onChange={set('phone')} />}
        </Field>
        <Field label={t('admin.fields.email')} error={errors.email}>
          {(p) => <Input {...p} type="email" value={form.email} onChange={set('email')} />}
        </Field>
        <Field
          label={t('admin.open_gym.slug')}
          hint={t('admin.open_gym.slug_hint')}
          className="sm:col-span-2"
          error={errors.slug}
        >
          {(p) => (
            <Input
              {...p}
              value={form.slug}
              placeholder="moja-teretana"
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
            />
          )}
        </Field>
      </div>
      <p className="rounded-sm bg-bg-surface2 px-3 py-2 text-sm text-text-secondary">
        {t('admin.open_gym.review_note')}
      </p>
      {save.error && !Object.keys(errors).length && (
        <p role="alert" className="text-sm text-status-danger">
          {t(save.error instanceof ApiError ? save.error.message : 'errors.internal')}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button
          loading={save.isPending}
          disabled={form.name.trim().length < 2 || form.city.trim().length < 2}
          onClick={() => save.mutate()}
        >
          {t('admin.open_gym.submit')}
        </Button>
      </div>
    </Card>
  );
}

export function OpenGymPage() {
  return (
    <div className="py-4">
      <OpenGymForm onCancel={() => window.history.back()} />
    </div>
  );
}
