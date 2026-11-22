import { Navigate } from 'react-router';
import { useCan, useMe } from '@/lib/me';

/** Owner/manager land on the dashboard; reception lands on the check-in desk. */
export function HomeRedirect() {
  const can = useCan();
  const { data: me } = useMe();
  if (me && me.permissions.length === 0 && me.isPlatformAdmin)
    return <Navigate to="/platform" replace />;
  const to = can('reports.read')
    ? '/dashboard'
    : can('attendance.checkin')
      ? '/checkin'
      : '/members';
  return <Navigate to={to} replace />;
}
