import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { LanguageSelect } from '@/components/LanguageSelect';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { BrandMark } from '@/layouts/BrandMark';
import hall from '../../../../../assets/club/main-hall.jpg';
import { ApiError } from '@/lib/api';
import { AUTH_MODE, devSignIn, signInWithPassword } from '@/lib/auth';

const schema = z.object({
  email: z.email({ error: 'validation.invalid_email' }),
  password: z.string().min(1, { error: 'validation.required' }),
});

/** Accounts created by `pnpm db:dev` - local development only. */
const DEV_ACCOUNTS = ['vlasnik@grit.local', 'menadzer@grit.local', 'recepcija@grit.local'];

export function LoginPage() {
  const { t } = useTranslation();
  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4">
      {/* The admin is the gym's own tool: its logo and the gym photo, darkened for readability. */}
      <img
        src={hall}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full object-cover opacity-25"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-bg-base/60 via-bg-base/80 to-bg-base"
      />
      <div className="absolute end-4 top-4 w-32">
        <LanguageSelect className="h-9 text-sm" />
      </div>
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center gap-4">
          <BrandMark className="h-12" />
          <p className="text-xs font-semibold tracking-[0.3em] text-text-secondary uppercase">
            {t('admin.login.subtitle')}
          </p>
        </div>
        <div className="grit-cut rounded-md border border-border-subtle bg-bg-surface p-6">
          {AUTH_MODE === 'dev' ? <DevLogin /> : <PasswordLogin />}
        </div>
      </div>
    </div>
  );
}

function PasswordLogin() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await signInWithPassword(v.email, v.password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'errors.internal');
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-lg font-bold">{t('admin.login.title')}</h1>
      <Field label={t('admin.fields.email')} error={form.formState.errors.email?.message}>
        {(p) => <Input {...p} type="email" autoComplete="username" {...form.register('email')} />}
      </Field>
      <Field label={t('admin.login.password')} error={form.formState.errors.password?.message}>
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
          />
        )}
      </Field>
      {error && (
        <p role="alert" className="text-sm text-status-danger">
          {t(error)}
        </p>
      )}
      <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
        {t('admin.login.submit')}
      </Button>
    </form>
  );
}

function DevLogin() {
  const { t } = useTranslation();
  const [email, setEmail] = useState(DEV_ACCOUNTS[0]!);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
          await devSignIn(email);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'errors.internal');
        } finally {
          setLoading(false);
        }
      }}
    >
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">{t('admin.login.title')}</h1>
        <Badge tone="warning">{t('admin.login.dev_badge')}</Badge>
      </div>
      <p className="text-sm text-text-secondary">{t('admin.login.dev_hint')}</p>
      <Field label={t('admin.login.dev_account')}>
        {(p) => (
          <Select {...p} value={email} onChange={(e) => setEmail(e.target.value)}>
            {DEV_ACCOUNTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {error && (
        <p role="alert" className="text-sm text-status-danger">
          {t(error)}
        </p>
      )}
      <Button type="submit" size="lg" loading={loading}>
        {t('admin.login.submit')}
      </Button>
    </form>
  );
}
