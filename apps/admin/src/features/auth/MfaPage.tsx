import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { BrandMark } from '@/layouts/BrandMark';
import { ApiError } from '@/lib/api';
import { AUTH_MODE, mfaEnrollIfNeeded, mfaVerify, signOut } from '@/lib/auth';

/** Owner/manager must complete TOTP (aal2) before using admin routes (docs/SECURITY.md §2). */
export function MfaPage() {
  const { t } = useTranslation();
  const [enrollment, setEnrollment] = useState<{
    factorId: string;
    qrCode: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (AUTH_MODE !== 'supabase') return;
    mfaEnrollIfNeeded()
      .then(setEnrollment)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'errors.internal'));
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <BrandMark className="mx-auto mb-8 h-8" />
        <form
          className="grit-cut flex flex-col gap-4 rounded-md border border-border-subtle bg-bg-surface p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError(null);
            try {
              await mfaVerify(code.trim(), enrollment?.factorId);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'errors.internal');
            } finally {
              setLoading(false);
            }
          }}
        >
          <h1 className="text-lg font-bold">{t('admin.mfa.title')}</h1>
          <p className="text-sm text-text-secondary">
            {t(enrollment ? 'admin.mfa.enroll_hint' : 'admin.mfa.verify_hint')}
          </p>
          {enrollment && (
            <div className="flex flex-col items-center gap-2 rounded-sm bg-white p-4">
              <img src={enrollment.qrCode} alt={t('admin.mfa.qr_alt')} className="size-44" />
              <code className="text-xs break-all text-black">{enrollment.secret}</code>
            </div>
          )}
          <Field label={t('admin.mfa.code')} error={error ?? undefined}>
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="tabular text-center text-lg tracking-[0.5em]"
              />
            )}
          </Field>
          <Button type="submit" size="lg" loading={loading} disabled={code.length !== 6}>
            {t('admin.mfa.verify')}
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            {t('admin.nav.sign_out')}
          </Button>
        </form>
      </div>
    </div>
  );
}
