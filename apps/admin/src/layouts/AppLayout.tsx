import {
  LayoutGrid,
  X,
  CalendarCheck,
  CalendarDays,
  Timer,
  CalendarClock,
  Dumbbell,
  BookOpen,
  DoorClosed,
  Handshake,
  Salad,
  BellRing,
  ClipboardList,
  ConciergeBell,
  CalendarRange,
  ShieldCheck,
  HandCoins,
  Wallet,
  Coffee,
  QrCode,
  UtensilsCrossed,
  Building2,
  Gift,
  Globe,
  TicketPercent,
  HeartPulse,
  Megaphone,
  UserRound,
  Map as MapIcon,
  Wrench,
  CreditCard,
  ScanLine,
  LayoutDashboard,
  LogOut,
  Package,
  Landmark,
  ReceiptText,
  Settings,
  UserCircle2,
  Users,
  type LucideIcon,
  Star,
} from 'lucide-react';
import type { AlertsDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation } from 'react-router';
import { LanguageSelect } from '@/components/LanguageSelect';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/components/ui/cn';
import { Modal } from '@/components/ui/Modal';
import { AUTH_MODE, signOut } from '@/lib/auth';
import { alertCount } from '@/features/alerts/AlertsPage';
import { api } from '@/lib/api';
import { useCan, useMe } from '@/lib/me';
import { ClubSwitcher, PendingBanner } from '@/features/clubs/ClubSwitcher';
import { BrandMark } from './BrandMark';

/** Tabs in the phone bottom bar before "More". */
const PHONE_TABS = 4;

type NavGroup = 'front' | 'training' | 'cafe' | 'content' | 'business' | 'team' | 'club';
/** Grouped by who uses it: reception, trainers, content for the member app, the facility. */
const NAV: Array<{
  to: string;
  group?: NavGroup;
  label: string;
  icon: LucideIcon;
  permission: string;
  /** Hidden for users who have this permission (they see the full version instead). */
  hideWith?: string;
}> = [
  {
    to: '/dashboard',
    label: 'admin.nav.dashboard',
    icon: LayoutDashboard,
    permission: 'reports.read',
  },
  {
    to: '/alerts',
    group: 'front',
    label: 'admin.nav.alerts',
    icon: BellRing,
    permission: 'alerts.read',
  },
  {
    to: '/reception',
    group: 'front',
    label: 'admin.nav.reception',
    icon: ConciergeBell,
    permission: 'attendance.checkin',
  },
  {
    to: '/checkin',
    group: 'front',
    label: 'admin.nav.checkin',
    icon: ScanLine,
    permission: 'attendance.checkin',
  },
  {
    to: '/members',
    group: 'front',
    label: 'admin.nav.members',
    icon: Users,
    permission: 'members.read',
  },
  {
    to: '/lockers',
    group: 'front',
    label: 'admin.nav.lockers',
    icon: DoorClosed,
    permission: 'attendance.checkin',
  },
  {
    to: '/payments',
    group: 'front',
    label: 'admin.nav.payments',
    icon: CreditCard,
    permission: 'payments.read',
  },
  {
    to: '/attendance',
    group: 'front',
    label: 'admin.nav.attendance',
    icon: CalendarCheck,
    permission: 'attendance.read',
  },
  {
    to: '/services',
    group: 'front',
    label: 'admin.nav.services',
    icon: HandCoins,
    permission: 'services.sell',
  },
  {
    to: '/my-schedule',
    group: 'training',
    label: 'admin.nav.my_schedule',
    icon: CalendarRange,
    permission: 'schedule.own',
    hideWith: 'trainers.manage',
  },
  {
    to: '/schedule',
    group: 'training',
    label: 'admin.nav.schedule',
    icon: CalendarClock,
    permission: 'classes.roster',
  },
  {
    to: '/trainer-schedule',
    group: 'training',
    label: 'admin.nav.trainer_schedule',
    icon: CalendarRange,
    permission: 'classes.roster',
  },
  {
    to: '/pt-requests',
    group: 'training',
    label: 'admin.nav.pt',
    icon: Handshake,
    permission: 'pt.manage',
  },
  {
    to: '/ratings',
    group: 'training',
    label: 'admin.nav.ratings',
    icon: Star,
    permission: 'reports.read',
  },
  {
    to: '/trainers',
    group: 'training',
    label: 'admin.nav.trainers',
    icon: UserRound,
    permission: 'classes.roster',
  },
  {
    to: '/clients',
    group: 'training',
    label: 'admin.nav.clients',
    icon: HeartPulse,
    permission: 'progress.view_clients',
  },
  {
    to: '/workout-templates',
    group: 'training',
    label: 'admin.nav.templates',
    icon: ClipboardList,
    permission: 'progress.view_clients',
  },
  {
    to: '/earnings',
    group: 'training',
    label: 'admin.nav.earnings',
    icon: Wallet,
    permission: 'earnings.read',
  },
  {
    to: '/my-earnings',
    group: 'training',
    label: 'admin.nav.my_earnings',
    icon: Wallet,
    permission: 'progress.view_clients',
    hideWith: 'earnings.read',
  },
  {
    to: '/cafe',
    group: 'cafe',
    label: 'admin.nav.cafe_orders',
    icon: Coffee,
    permission: 'cafe.orders',
  },
  {
    to: '/cafe/menu',
    group: 'cafe',
    label: 'admin.nav.cafe_menu',
    icon: UtensilsCrossed,
    permission: 'cafe.orders',
  },
  {
    to: '/cafe/setup',
    group: 'cafe',
    label: 'admin.nav.cafe_setup',
    icon: QrCode,
    permission: 'cafe.manage',
  },
  {
    to: '/exercises',
    group: 'content',
    label: 'admin.nav.exercises',
    icon: BookOpen,
    permission: 'exercises.manage',
  },
  {
    to: '/announcements',
    group: 'content',
    label: 'admin.nav.announcements',
    icon: Megaphone,
    permission: 'notifications.send',
  },
  {
    to: '/promos',
    group: 'content',
    label: 'admin.nav.promos',
    icon: TicketPercent,
    permission: 'promos.manage',
  },
  {
    to: '/loyalty',
    group: 'content',
    label: 'admin.nav.loyalty',
    icon: Gift,
    permission: 'loyalty.manage',
  },
  {
    to: '/nutrition',
    group: 'content',
    label: 'admin.nav.nutrition',
    icon: Salad,
    permission: 'nutrition.manage',
  },
  {
    to: '/plans',
    group: 'content',
    label: 'admin.nav.plans',
    icon: Package,
    permission: 'plans.read',
  },
  {
    to: '/business',
    group: 'business',
    label: 'admin.nav.business',
    icon: ReceiptText,
    permission: 'purchases.manage',
  },
  {
    to: '/finance',
    group: 'business',
    label: 'admin.nav.finance',
    icon: Landmark,
    permission: 'finance.read',
  },
  {
    to: '/my-shifts',
    group: 'team',
    label: 'admin.nav.my_shifts',
    icon: Timer,
    permission: 'shifts.own',
  },
  {
    to: '/shifts',
    group: 'team',
    label: 'admin.nav.shifts',
    icon: CalendarDays,
    permission: 'shifts.view',
  },
  {
    to: '/equipment',
    group: 'club',
    label: 'admin.nav.equipment',
    icon: Dumbbell,
    permission: 'equipment.manage',
  },
  {
    to: '/maintenance',
    group: 'club',
    label: 'admin.nav.maintenance',
    icon: Wrench,
    permission: 'maintenance.manage',
  },
  {
    to: '/club',
    group: 'club',
    label: 'admin.nav.club',
    icon: Building2,
    permission: 'settings.manage',
  },
  { to: '/map', group: 'club', label: 'admin.nav.map', icon: MapIcon, permission: 'map.edit' },
  {
    to: '/platform',
    group: 'club',
    label: 'admin.nav.platform',
    icon: Globe,
    permission: 'platform', // shown to the platform owner only
  },
  {
    to: '/staff',
    group: 'club',
    label: 'admin.nav.staff',
    icon: ShieldCheck,
    permission: 'staff.manage',
  },
];

/**
 * Responsive shell:
 *  - ≥1024px: full sidebar with labels
 *  - 768-1023px (tablet): icon rail
 *  - <768px (phone): top bar + bottom tab bar (thumb-reachable), account in a sheet
 */
function useAlertCount(enabled: boolean) {
  const { i18n } = useTranslation();
  const q = useQuery({
    queryKey: ['alerts', i18n.language],
    queryFn: () => api.get<AlertsDto>('/admin/alerts', { locale: i18n.language }),
    enabled,
    refetchInterval: 5 * 60_000,
  });
  return enabled ? alertCount(q.data) : 0;
}

export function AppLayout() {
  const { t } = useTranslation();
  const can = useCan();
  const { data: me } = useMe();
  const items = NAV.filter(
    (n) =>
      (n.permission === 'platform' ? Boolean(me?.isPlatformAdmin) : can(n.permission)) &&
      !(n.hideWith && can(n.hideWith)),
  );
  const alerts = useAlertCount(can('alerts.read'));
  const [accountOpen, setAccountOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const inMore = !items.slice(0, PHONE_TABS).some((n) => pathname.startsWith(n.to));

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar / rail (tablet and desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col border-e border-border-subtle bg-bg-surface md:flex lg:w-56">
        <div className="flex h-16 shrink-0 items-center justify-center px-2 lg:justify-start lg:px-5">
          <BrandMark className="h-7 lg:hidden" markOnly />
          <BrandMark className="hidden h-7 lg:inline-flex" />
        </div>
        <ClubSwitcher />
        <nav
          aria-label={t('admin.nav.main')}
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2 [scrollbar-color:var(--color-border-strong)_transparent] [scrollbar-width:thin]"
        >
          {items.map(({ to, group, label, icon: Icon }, i) => (
            <Fragment key={to}>
              {group && group !== items[i - 1]?.group && (
                <p
                  className="mt-3 shrink-0 border-t border-border-subtle pt-3 text-center text-[10px] font-semibold uppercase tracking-wider text-text-muted lg:px-3 lg:text-start"
                  aria-hidden
                >
                  <span className="hidden lg:inline">{t(`admin.nav.group.${group}`)}</span>
                </p>
              )}
              <NavLink
                to={to}
                end={to === '/cafe'}
                title={t(label)}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-10 shrink-0 items-center justify-center gap-3 rounded-sm px-3 text-sm font-semibold transition-colors lg:justify-start',
                    isActive
                      ? 'bg-accent-tint text-text-primary before:absolute before:inset-y-2 before:start-0 before:w-[3px] before:rounded-full before:bg-accent-500'
                      : 'text-text-secondary hover:bg-bg-surface2 hover:text-text-primary',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={cn('size-[18px] shrink-0', isActive && 'text-accent-400')}
                      aria-hidden
                    />
                    <span className="sr-only lg:not-sr-only">{t(label)}</span>
                    {to === '/alerts' && alerts > 0 && (
                      <span className="absolute end-1 top-1 min-w-[18px] rounded-full bg-accent-500 px-1 text-center text-[10px] leading-[18px] font-bold text-on-accent lg:static lg:ms-auto">
                        {alerts > 99 ? '99+' : alerts}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            </Fragment>
          ))}
        </nav>
        {/* Slim footer: who is signed in, settings and sign out (language lives in Settings). */}
        <div className="flex shrink-0 items-center justify-center gap-1 border-t border-border-subtle px-2 py-2 lg:justify-start lg:px-3">
          <NavLink
            to="/settings"
            title={t('admin.nav.settings')}
            className={({ isActive }) =>
              cn(
                'flex min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-bg-surface2 lg:flex-1',
                isActive && 'bg-accent-tint',
              )
            }
          >
            <Settings className="size-[18px] shrink-0 text-text-secondary" aria-hidden />
            <span className="hidden min-w-0 lg:block">
              <span className="block truncate font-semibold">
                {me?.firstName} {me?.lastName}
              </span>
              {AUTH_MODE === 'dev' && (
                <span className="block truncate text-[10px] font-semibold uppercase text-status-warning">
                  {t('admin.login.dev_badge')}
                </span>
              )}
            </span>
          </NavLink>
          <button
            type="button"
            onClick={() => void signOut()}
            title={t('admin.nav.sign_out')}
            aria-label={t('admin.nav.sign_out')}
            className="hidden size-9 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-bg-surface2 hover:text-text-primary lg:flex"
          >
            <LogOut className="size-4 rtl:rotate-180" aria-hidden />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (phone) */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border-subtle bg-bg-base/90 px-4 backdrop-blur md:hidden">
          <BrandMark className="h-6" />
          <div className="flex items-center gap-2">
            {AUTH_MODE === 'dev' && <Badge tone="warning">DEV</Badge>}
            <button
              type="button"
              aria-label={t('admin.nav.account')}
              onClick={() => setAccountOpen(true)}
              className="flex size-10 items-center justify-center rounded-full text-text-secondary hover:text-text-primary"
            >
              <UserCircle2 className="size-6" />
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 pt-5 pb-28 md:px-6 md:py-8 lg:px-8">
          <div className="max-w-[1600px]">
            <PendingBanner />
            <Outlet />
          </div>
        </main>
      </div>

      {/* Bottom tab bar (phone) */}
      <nav
        aria-label={t('admin.nav.main')}
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border-subtle bg-bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {/* Phones: four thumb-reachable tabs, then "More" with everything else in desktop order. */}
        {items.slice(0, PHONE_TABS).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold',
                isActive
                  ? 'text-text-primary after:absolute after:top-0 after:h-[3px] after:w-8 after:rounded-b-full after:bg-accent-500'
                  : 'text-text-secondary',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('size-5', isActive && 'text-accent-400')} aria-hidden />
                {t(label)}
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          className={cn(
            'relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold',
            inMore
              ? 'text-text-primary after:absolute after:top-0 after:h-[3px] after:w-8 after:rounded-b-full after:bg-accent-500'
              : 'text-text-secondary',
          )}
        >
          <span className="relative">
            <LayoutGrid className={cn('size-5', inMore && 'text-accent-400')} aria-hidden />
            {alerts > 0 && (
              <span className="absolute -end-2 -top-1 size-2.5 rounded-full bg-accent-500" />
            )}
          </span>
          {t('admin.nav.more')}
        </button>
      </nav>

      {moreOpen && (
        <PhoneMenu
          items={items}
          alerts={alerts}
          onClose={() => setMoreOpen(false)}
          onAccount={() => {
            setMoreOpen(false);
            setAccountOpen(true);
          }}
        />
      )}

      <Modal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        title={t('admin.nav.account')}
        size="sm"
      >
        <AccountPanel />
      </Modal>
    </div>
  );
}

type NavItem = (typeof NAV)[number];

/** Phone "More": every admin page in the same order and groups as the desktop sidebar. */
function PhoneMenu({
  items,
  alerts,
  onClose,
  onAccount,
}: {
  items: NavItem[];
  alerts: number;
  onClose: () => void;
  onAccount: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('admin.nav.more')}
      className="fixed inset-0 z-40 flex flex-col bg-bg-base md:hidden"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle px-4">
        <span className="text-base font-bold">{t('admin.nav.more')}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="flex size-10 items-center justify-center rounded-full text-text-secondary hover:text-text-primary"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="-mx-3">
          <ClubSwitcher />
        </div>
        {items.map(({ to, group, label, icon: Icon }, i) => (
          <Fragment key={to}>
            {group && group !== items[i - 1]?.group && (
              <p className="mt-4 mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                {t(`admin.nav.group.${group}`)}
              </p>
            )}
            <NavLink
              to={to}
              end={to === '/cafe'}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex min-h-12 items-center gap-3 rounded-sm px-3 text-[15px] font-semibold',
                  isActive ? 'bg-accent-tint text-text-primary' : 'text-text-secondary',
                )
              }
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{t(label)}</span>
              {to === '/alerts' && alerts > 0 && (
                <span className="min-w-[20px] rounded-full bg-accent-500 px-1.5 text-center text-[11px] leading-5 font-bold text-on-accent">
                  {alerts > 99 ? '99+' : alerts}
                </span>
              )}
            </NavLink>
          </Fragment>
        ))}
        <div className="mt-4 border-t border-border-subtle pt-3">
          <NavLink
            to="/settings"
            onClick={onClose}
            className="flex min-h-12 items-center gap-3 rounded-sm px-3 text-[15px] font-semibold text-text-secondary"
          >
            <Settings className="size-5" aria-hidden />
            {t('admin.nav.settings')}
          </NavLink>
          <button
            type="button"
            onClick={onAccount}
            className="flex min-h-12 w-full items-center gap-3 rounded-sm px-3 text-[15px] font-semibold text-text-secondary"
          >
            <UserCircle2 className="size-5" aria-hidden />
            {t('admin.nav.account')}
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountPanel() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  return (
    <div className="flex flex-col gap-3">
      {AUTH_MODE === 'dev' && (
        <div>
          <Badge tone="warning">{t('admin.login.dev_badge')}</Badge>
        </div>
      )}
      <div>
        <p className="truncate text-sm font-semibold">
          {me?.firstName} {me?.lastName}
        </p>
        <p className="truncate text-xs text-text-secondary">
          {me?.roles.map((r) => t(`admin.roles.${r}`, { defaultValue: r })).join(', ')}
        </p>
      </div>
      <LanguageSelect className="h-9 text-sm" />
      <button
        type="button"
        onClick={() => void signOut()}
        className="flex h-10 items-center gap-2 rounded-sm px-2 text-sm text-text-secondary hover:bg-bg-surface2 hover:text-text-primary"
      >
        <LogOut className="size-4 rtl:rotate-180" aria-hidden />
        {t('admin.nav.sign_out')}
      </button>
    </div>
  );
}
