import type { RouteDef } from '../shared/route';
import { accessRoutes } from './access/access.routes';
import { clubRoutes } from './club/club.routes';
import { occupancyRoutes } from './occupancy/occupancy.routes';
import { pauseRoutes } from './pauses/pauses.routes';
import { referralRoutes } from './referrals/referrals.routes';
import { challengeRoutes } from './challenges/challenges.routes';
import { ratingRoutes } from './ratings/ratings.routes';
import { messageRoutes } from './messages/messages.routes';
import { availabilityRoutes } from './availability/availability.routes';
import { calendarRoutes } from './calendar/calendar.routes';
import { cafeRoutes } from './cafe/cafe.routes';
import { classesRoutes } from './classes/classes.routes';
import { notificationsRoutes } from './notifications/notifications.routes';
import { nutritionRoutes } from './nutrition/nutrition.routes';
import { visitsRoutes } from './visits/visits.routes';
import { wellbeingRoutes } from './wellbeing/wellbeing.routes';
import { workoutsRoutes } from './workouts/workouts.routes';
import { facilityRoutes } from './facility/facility.routes';
import { healthRoutes } from './health/health.routes';
import { meMembershipRoutes } from './me/me-membership.routes';
import { meRoutes } from './me/me.routes';
import { memberHistoryRoutes } from './members/member-history.routes';
import { membersRoutes } from './members/members.routes';
import { membershipsRoutes } from './memberships/memberships.routes';
import { paymentsRoutes } from './payments/payments.routes';
import { plansRoutes } from './plans/plans.routes';
import { promosRoutes } from './promos/promos.routes';
import { purchasesRoutes } from './purchases/purchases.routes';
import { joinRoutes } from './join/join.routes';
import { staffRoutes } from './staff/staff.routes';
import { servicesRoutes } from './services/services.routes';
import { publicRoutes } from './public/public.routes';
import { reportsRoutes } from './reports/reports.routes';
import { shiftsRoutes } from './shifts/shifts.routes';
import { clubsRoutes } from './clubs/clubs.routes';

/** Single registry of all API routes: mounted by app.ts, documented by openapi.ts, audited by tests. */
export const allRoutes: RouteDef[] = [
  ...healthRoutes,
  ...publicRoutes,
  ...meRoutes,
  ...meMembershipRoutes,
  ...membersRoutes,
  ...memberHistoryRoutes,
  ...membershipsRoutes,
  ...paymentsRoutes,
  ...plansRoutes,
  ...reportsRoutes,
  ...accessRoutes,
  ...facilityRoutes,
  ...classesRoutes,
  ...workoutsRoutes,
  ...visitsRoutes,
  ...nutritionRoutes,
  ...notificationsRoutes,
  ...promosRoutes,
  ...clubRoutes,
  ...occupancyRoutes,
  ...pauseRoutes,
  ...referralRoutes,
  ...challengeRoutes,
  ...ratingRoutes,
  ...messageRoutes,
  ...availabilityRoutes,
  ...calendarRoutes,
  ...wellbeingRoutes,
  ...cafeRoutes,
  ...servicesRoutes,
  ...staffRoutes,
  ...joinRoutes,
  ...purchasesRoutes,
  ...shiftsRoutes,
  ...clubsRoutes,
];
