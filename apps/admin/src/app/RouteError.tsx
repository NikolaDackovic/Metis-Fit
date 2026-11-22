import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router';
import { Button } from '@/components/ui/Button';

const RELOAD_KEY = 'grit.admin.chunk_reload';

/**
 * Route error screen. After a new version is deployed, an open tab may ask for a page file
 * that no longer exists ("Failed to fetch dynamically imported module"): reload once to get
 * the new version instead of showing an error.
 */
export function RouteError() {
  const { t } = useTranslation();
  const error = useRouteError() as Error | undefined;
  const stale = /dynamically imported module|Importing a module script failed|Loading chunk/i.test(
    String(error?.message ?? error),
  );
  useEffect(() => {
    if (!stale) return;
    try {
      if (sessionStorage.getItem(RELOAD_KEY)) return;
      sessionStorage.setItem(RELOAD_KEY, '1');
    } catch {
      /* no storage: reload anyway */
    }
    window.location.reload();
  }, [stale]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-bold">
        {t(stale ? 'admin.errors.new_version' : 'errors.internal')}
      </h1>
      <p className="max-w-sm text-sm text-text-secondary">{t('admin.errors.reload_hint')}</p>
      <Button
        onClick={() => {
          try {
            sessionStorage.removeItem(RELOAD_KEY);
          } catch {
            /* ignore */
          }
          window.location.assign('/');
        }}
      >
        {t('admin.errors.reload')}
      </Button>
    </div>
  );
}
