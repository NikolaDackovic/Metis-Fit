import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/States';
import { RouteError } from './RouteError';
import { AttendancePage } from '@/features/checkin/AttendancePage';
import { CheckinPage } from '@/features/checkin/CheckinPage';
import { KioskPage } from '@/features/checkin/KioskPage';
import { RatingsPage } from '@/features/ratings/RatingsPage';
import { PtRequestsPage } from '@/features/classes/PtRequestsPage';
import { SchedulePage } from '@/features/classes/SchedulePage';
import { TrainersPage } from '@/features/classes/TrainersPage';
import { LockersPage } from '@/features/lockers/LockersPage';
import { AlertsPage } from '@/features/alerts/AlertsPage';
import { AnnouncementsPage } from '@/features/alerts/AnnouncementsPage';
import { LoyaltyPage } from '@/features/loyalty/LoyaltyPage';
import { PromosPage } from '@/features/loyalty/PromosPage';
import { ClubPage } from '@/features/club/ClubPage';
import { CafeMenuPage } from '@/features/cafe/CafeMenuPage';
import { CafeOrdersPage } from '@/features/cafe/CafeOrdersPage';
import { CafeSetupPage } from '@/features/cafe/CafeSetupPage';
import { EarningsPage } from '@/features/services/EarningsPage';
import { ServicesPage } from '@/features/services/ServicesPage';
import { SchedulePlanner } from '@/features/staff/SchedulePlanner';
import { StaffPage } from '@/features/staff/StaffPage';
import { MyShiftsPage } from '@/features/shifts/MyShiftsPage';
import { ShiftsPage } from '@/features/shifts/ShiftsPage';
import { OpenGymPage } from '@/features/clubs/OpenGymPage';
import { PlatformPage } from '@/features/clubs/PlatformPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { FinancePage } from '@/features/purchases/FinancePage';
import { BusinessPage } from '@/features/business/BusinessPage';
import { NutritionPage } from '@/features/nutrition/NutritionPage';
import { ClientsPage } from '@/features/workouts/ClientsPage';
import { ExercisesPage } from '@/features/workouts/ExercisesPage';
import { EquipmentPage } from '@/features/facility/EquipmentPage';
import { MaintenancePage } from '@/features/facility/MaintenancePage';
import { MemberDetailPage } from '@/features/members/MemberDetailPage';
import { MembersPage } from '@/features/members/MembersPage';
import { PaymentsPage } from '@/features/payments/PaymentsPage';
import { PlansPage } from '@/features/plans/PlansPage';
import { AppLayout } from '@/layouts/AppLayout';
import { AuthGate } from '@/layouts/AuthGate';
import { RequirePermission } from '@/layouts/RequirePermission';
import { HomeRedirect } from './HomeRedirect';

// Charts (recharts) and the map editor are heavy: load them on demand.
const MapEditorPage = lazy(() =>
  import('@/features/facility/MapEditorPage').then((m) => ({ default: m.MapEditorPage })),
);
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);

const router = createBrowserRouter([
  {
    element: <AuthGate />,
    errorElement: <RouteError />,
    children: [
      // Entry screen for a tablet at the door: full screen, no menu.
      {
        path: 'kiosk',
        element: (
          <RequirePermission permission="attendance.checkin">
            <KioskPage />
          </RequirePermission>
        ),
      },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomeRedirect /> },
          {
            path: 'dashboard',
            element: (
              <RequirePermission permission="reports.read">
                <Suspense fallback={<Skeleton className="h-96" />}>
                  <DashboardPage />
                </Suspense>
              </RequirePermission>
            ),
          },
          {
            path: 'checkin',
            element: (
              <RequirePermission permission="attendance.checkin">
                <CheckinPage />
              </RequirePermission>
            ),
          },
          {
            path: 'attendance',
            element: (
              <RequirePermission permission="attendance.read">
                <AttendancePage />
              </RequirePermission>
            ),
          },
          {
            path: 'members',
            element: (
              <RequirePermission permission="members.read">
                <MembersPage />
              </RequirePermission>
            ),
          },
          {
            path: 'members/:id',
            element: (
              <RequirePermission permission="members.read">
                <MemberDetailPage />
              </RequirePermission>
            ),
          },
          {
            path: 'payments',
            element: (
              <RequirePermission permission="payments.read">
                <PaymentsPage />
              </RequirePermission>
            ),
          },
          {
            path: 'plans',
            element: (
              <RequirePermission permission="plans.read">
                <PlansPage />
              </RequirePermission>
            ),
          },
          {
            path: 'schedule',
            element: (
              <RequirePermission permission="classes.roster">
                <SchedulePage />
              </RequirePermission>
            ),
          },
          {
            path: 'ratings',
            element: (
              <RequirePermission permission="reports.read">
                <RatingsPage />
              </RequirePermission>
            ),
          },
          {
            path: 'trainers',
            element: (
              <RequirePermission permission="classes.roster">
                <TrainersPage />
              </RequirePermission>
            ),
          },
          {
            path: 'lockers',
            element: (
              <RequirePermission permission="attendance.checkin">
                <LockersPage />
              </RequirePermission>
            ),
          },
          {
            path: 'alerts',
            element: (
              <RequirePermission permission="alerts.read">
                <AlertsPage />
              </RequirePermission>
            ),
          },
          {
            path: 'announcements',
            element: (
              <RequirePermission permission="notifications.send">
                <AnnouncementsPage />
              </RequirePermission>
            ),
          },
          {
            path: 'promos',
            element: (
              <RequirePermission permission="promos.manage">
                <PromosPage />
              </RequirePermission>
            ),
          },
          {
            path: 'loyalty',
            element: (
              <RequirePermission permission="loyalty.manage">
                <LoyaltyPage />
              </RequirePermission>
            ),
          },
          {
            path: 'club',
            element: (
              <RequirePermission permission="settings.manage">
                <ClubPage />
              </RequirePermission>
            ),
          },
          {
            path: 'cafe',
            element: (
              <RequirePermission permission="cafe.orders">
                <CafeOrdersPage />
              </RequirePermission>
            ),
          },
          {
            path: 'cafe/menu',
            element: (
              <RequirePermission permission="cafe.orders">
                <CafeMenuPage />
              </RequirePermission>
            ),
          },
          {
            path: 'cafe/setup',
            element: (
              <RequirePermission permission="cafe.manage">
                <CafeSetupPage />
              </RequirePermission>
            ),
          },
          {
            path: 'services',
            element: (
              <RequirePermission permission="services.sell">
                <ServicesPage />
              </RequirePermission>
            ),
          },
          {
            path: 'earnings',
            element: (
              <RequirePermission permission="earnings.read">
                <EarningsPage />
              </RequirePermission>
            ),
          },
          {
            path: 'my-earnings',
            element: (
              <RequirePermission permission="progress.view_clients">
                <EarningsPage mine />
              </RequirePermission>
            ),
          },
          {
            path: 'staff',
            element: (
              <RequirePermission permission="staff.manage">
                <StaffPage />
              </RequirePermission>
            ),
          },
          { path: 'open-gym', element: <OpenGymPage /> },
          { path: 'platform', element: <PlatformPage /> },
          {
            path: 'shifts',
            element: (
              <RequirePermission permission="shifts.view">
                <ShiftsPage />
              </RequirePermission>
            ),
          },
          {
            path: 'my-shifts',
            element: (
              <RequirePermission permission="shifts.own">
                <MyShiftsPage />
              </RequirePermission>
            ),
          },
          {
            path: 'my-schedule',
            element: (
              <RequirePermission permission="schedule.own">
                <SchedulePlanner mine />
              </RequirePermission>
            ),
          },
          {
            path: 'trainer-schedule',
            element: (
              <RequirePermission permission="classes.roster">
                <SchedulePlanner />
              </RequirePermission>
            ),
          },
          { path: 'settings', element: <SettingsPage /> },
          {
            path: 'business',
            element: (
              <RequirePermission permission="purchases.manage">
                <BusinessPage />
              </RequirePermission>
            ),
          },
          { path: 'purchases', element: <Navigate to="/business" replace /> },
          {
            path: 'finance',
            element: (
              <RequirePermission permission="finance.read">
                <FinancePage />
              </RequirePermission>
            ),
          },
          {
            path: 'nutrition',
            element: (
              <RequirePermission permission="nutrition.manage">
                <NutritionPage />
              </RequirePermission>
            ),
          },
          {
            path: 'exercises',
            element: (
              <RequirePermission permission="exercises.manage">
                <ExercisesPage />
              </RequirePermission>
            ),
          },
          {
            path: 'clients',
            element: (
              <RequirePermission permission="progress.view_clients">
                <ClientsPage />
              </RequirePermission>
            ),
          },
          {
            path: 'pt-requests',
            element: (
              <RequirePermission permission="pt.manage">
                <PtRequestsPage />
              </RequirePermission>
            ),
          },
          {
            path: 'equipment',
            element: (
              <RequirePermission permission="equipment.manage">
                <EquipmentPage />
              </RequirePermission>
            ),
          },
          {
            path: 'maintenance',
            element: (
              <RequirePermission permission="maintenance.manage">
                <MaintenancePage />
              </RequirePermission>
            ),
          },
          {
            path: 'map',
            element: (
              <RequirePermission permission="map.edit">
                <Suspense fallback={<Skeleton className="h-96" />}>
                  <MapEditorPage />
                </Suspense>
              </RequirePermission>
            ),
          },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
