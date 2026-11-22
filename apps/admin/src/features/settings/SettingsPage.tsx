import { Building2, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LanguageGrid } from '@/components/LanguageSelect';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader } from '@/components/ui/States';
import { AUTH_MODE, signOut } from '@/lib/auth';
import { useCan, useMe } from '@/lib/me';

/** Personal settings of the signed-in staff member (language, account). */
export function SettingsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const { data: me } = useMe();
  return (
    <>
      <PageHeader title={t('admin.settings.title')} subtitle={t('admin.settings.subtitle')} />
      <div className="grid max-w-4xl items-start gap-4 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader title={t('admin.settings.language')} />
          <div className="flex flex-col gap-2 p-4">
            <LanguageGrid />
            <p className="text-xs text-text-secondary">{t('admin.settings.language_hint')}</p>
          </div>
        </Card>
        <Card>
          <CardHeader title={t('admin.settings.account')} />
          <div className="flex flex-col gap-3 p-4 text-sm">
            <div>
              <p className="font-semibold">
                {me?.firstName} {me?.lastName}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {me?.roles.map((r) => (
                  <Badge key={r} tone="neutral">
                    {t(`admin.roles.${r}`, { defaultValue: r })}
                  </Badge>
                ))}
                {AUTH_MODE === 'dev' && <Badge tone="warning">{t('admin.login.dev_badge')}</Badge>}
              </div>
            </div>
            <Button
              variant="secondary"
              icon={<LogOut className="size-4 rtl:rotate-180" />}
              onClick={() => void signOut()}
            >
              {t('admin.nav.sign_out')}
            </Button>
          </div>
        </Card>
        {can('settings.manage') && (
          <Card className="md:col-span-2">
            <Link to="/club" className="flex items-center gap-3 p-4 text-sm hover:bg-bg-surface2">
              <Building2 className="size-5 shrink-0 text-accent-400" aria-hidden />
              <span className="min-w-0">
                <span className="block font-semibold">{t('admin.nav.club')}</span>
                <span className="block text-text-secondary">{t('admin.settings.club_hint')}</span>
              </span>
            </Link>
          </Card>
        )}
      </div>
    </>
  );
}
