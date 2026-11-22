import { ShieldOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/States';
import { useCan } from '@/lib/me';

/** Hides pages the user cannot use. This is UX only - the API enforces permissions itself. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const can = useCan();
  const { t } = useTranslation();
  if (!can(permission)) {
    return <EmptyState icon={ShieldOff} title={t('errors.auth.forbidden')} />;
  }
  return <>{children}</>;
}
