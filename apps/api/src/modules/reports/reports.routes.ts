import { sql } from 'kysely';
import { dashboardDto, dashboardQuery, type DashboardDto } from '@grit/validation';
import { withStaffTx } from '../../database/tx';
import { access, defineRoute } from '../../shared/route';

/**
 * Dashboard numbers come only from real rows. Nothing is estimated or padded:
 * an empty club shows zeros/empty series, which the admin renders as empty states.
 */
export const reportsRoutes = [
  defineRoute({
    method: 'get',
    path: '/admin/reports/dashboard',
    access: access.can('reports.read'),
    summary: 'Dashboard KPIs and daily series for a date range (Europe/Belgrade days)',
    tags: ['Reports'],
    query: dashboardQuery,
    response: dashboardDto,
    handler: async ({ query, deps }) => {
      const data = await withStaffTx(deps.db, async (tx): Promise<DashboardDto> => {
        const kpis = await sql<{
          today: string;
          active: number;
          expiring: number;
          expired30: number;
          new_members: number;
          checkins_today: number;
        }>`
          with cs as (
            select cs.* from public.member_current_status cs
            join public.members m on m.id = cs.member_id and m.deactivated_at is null
          )
          select
            public.club_today()::text as today,
            (select count(*) from cs where status in ('active', 'expiring_soon'))::int as active,
            (select count(*) from cs where status = 'expiring_soon')::int as expiring,
            (select count(*) from cs where status = 'expired'
               and end_date >= public.club_today() - 30)::int as expired30,
            (select count(*) from public.members
               where (created_at at time zone 'Europe/Belgrade')::date between ${query.from}::date and ${query.to}::date)::int
              as new_members,
            (select count(*) from public.attendance_attempts
               where result = 'granted'
                 and (occurred_at at time zone 'Europe/Belgrade')::date = public.club_today())::int as checkins_today
        `
          .execute(tx)
          .then((r) => r.rows[0]!);

        const byMethod = await sql<{ method: string; amount: number; count: number }>`
          select method::text, sum(amount)::int as amount, count(*)::int as count
          from public.payments
          where status = 'recorded'
            and (paid_at at time zone 'Europe/Belgrade')::date between ${query.from}::date and ${query.to}::date
          group by method order by amount desc
        `.execute(tx);

        const daily = await sql<{ date: string; checkins: number; revenue: number }>`
          select d::date::text as date,
            (select count(*) from public.attendance_attempts a
               where a.result = 'granted' and (a.occurred_at at time zone 'Europe/Belgrade')::date = d::date)::int as checkins,
            (select coalesce(sum(p.amount), 0) from public.payments p
               where p.status = 'recorded' and (p.paid_at at time zone 'Europe/Belgrade')::date = d::date)::int as revenue
          from generate_series(${query.from}::date, ${query.to}::date, interval '1 day') d
          order by d
        `.execute(tx);

        const expiring = await sql<{
          member_id: string;
          member_name: string;
          plan_name: string | null;
          end_date: string | null;
          visits_remaining: number | null;
        }>`
          select cs.member_id, m.first_name || ' ' || m.last_name as member_name, t.name as plan_name,
                 cs.end_date::text, cs.visits_remaining
          from public.member_current_status cs
          join public.members m on m.id = cs.member_id and m.deactivated_at is null
          left join public.membership_plan_translations t on t.plan_id = cs.plan_id and t.locale = 'sr'
          where cs.status = 'expiring_soon'
          order by cs.end_date nulls last, member_name
          limit 10
        `.execute(tx);

        return {
          range: { from: query.from, to: query.to },
          today: kpis.today,
          activeMembers: kpis.active,
          expiringSoon: kpis.expiring,
          expiredLast30Days: kpis.expired30,
          newMembers: kpis.new_members,
          checkinsToday: kpis.checkins_today,
          revenue: {
            total: byMethod.rows.reduce((s, r) => s + r.amount, 0),
            currency: 'RSD',
            byMethod: byMethod.rows,
          },
          daily: daily.rows,
          expiringList: expiring.rows.map((r) => ({
            memberId: r.member_id,
            memberName: r.member_name,
            planName: r.plan_name ?? '-',
            endDate: r.end_date,
            visitsRemaining: r.visits_remaining,
          })),
        };
      });
      return { data };
    },
  }),
];
