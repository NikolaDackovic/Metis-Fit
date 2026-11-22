import { ShieldOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { LoginPage } from '@/features/auth/LoginPage';
import { MfaPage } from '@/features/auth/MfaPage';
import { signOut, useAuth } from '@/lib/auth';
import { OpenGymForm } from '@/features/clubs/OpenGymPage';
import { currentClub, staffClubs, switchClub, useMyClubs } from '@/lib/current-club';
import { useMe } from '@/lib/me';
import { BrandMark } from './BrandMark';

export function AuthGate() {
  const status = useAuth((s) => s.status);
  const me = useMe();
  const clubs = useMyClubs();
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);
  const noAccessHere = Boolean(me.data && me.data.permissions.length === 0);
  const elsewhere = staffClubs(clubs.data).find((c) => c.slug !== currentClub());
  // Works in another gym (e.g. just opened one): go there instead of showing "no access".
  useEffect(() => {
    if (noAccessHere && elsewhere) switchClub(elsewhere.slug);
  }, [noAccessHere, elsewhere]);

  if (status === 'loading') return <Splash />;
  if (status === 'signedOut') return <LoginPage />;
  if (status === 'mfaRequired') return <MfaPage />;
  if (me.isPending) return <Splash />;
  if (me.isError) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;

  // The platform owner may have no role in this gym but still manages the platform.
  if (me.data.permissions.length === 0 && me.data.isPlatformAdmin) return <Outlet />;
  if (me.data.permissions.length === 0 && (clubs.isPending || elsewhere)) return <Splash />;
  // Members without staff permissions have no business in the admin panel - unless they open a gym.
  if (me.data.permissions.length === 0) {
    if (opening)
      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <OpenGymForm onCancel={() => setOpening(false)} />
        </div>
      );
    return (
      <div className="flex min-h-screen items-center justify-center">
        <EmptyState
          icon={ShieldOff}
          title={t('admin.auth.no_staff_access')}
          description={t('admin.auth.no_staff_access_hint')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setOpening(true)}>{t('admin.clubs.open_new')}</Button>
              <Button variant="secondary" onClick={() => void signOut()}>
                {t('admin.nav.sign_out')}
              </Button>
            </div>
          }
        />
      </div>
    );
  }
  return <Outlet />;
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center" aria-busy>
      <BrandMark className="h-8 animate-pulse" />
    </div>
  );
}
