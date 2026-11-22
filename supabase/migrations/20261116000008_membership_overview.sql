-- GRIT DIGITAL CLUB — 008 membership overview views (single source for computed status).
-- security_invoker: RLS of the underlying tables applies to whoever queries the view.

-- Lower rank = "better" status when a member holds several memberships.
create or replace function public.membership_status_rank(p_status text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'active' then 1
    when 'expiring_soon' then 2
    when 'paused' then 3
    when 'pending' then 4
    when 'expired' then 5
    when 'cancelled' then 6
    else 7
  end;
$$;

create view public.membership_overview with (security_invoker = true) as
select
  ms.*,
  public.membership_display_status(ms.state, ms.start_date, ms.end_date, ms.visit_limit, ms.visits_used)
    as display_status,
  case when ms.end_date is null then null else ms.end_date - public.club_today() end as days_left,
  case when ms.visit_limit is null then null else ms.visit_limit - ms.visits_used end as visits_remaining,
  coalesce((
    select sum(p.amount)::integer from public.payments p
    where p.membership_id = ms.id and p.status = 'recorded'
  ), 0) as paid_amount
from public.memberships ms;

-- One row per member: their best non-cancelled membership, or status 'none'.
create view public.member_current_status with (security_invoker = true) as
select distinct on (m.id)
  m.id as member_id,
  coalesce(o.display_status, 'none') as status,
  o.id as membership_id,
  o.plan_id,
  o.end_date,
  o.visits_remaining
from public.members m
left join public.membership_overview o on o.member_id = m.id and o.state <> 'cancelled'
order by m.id, public.membership_status_rank(o.display_status), o.end_date desc nulls last;

grant execute on function public.membership_status_rank(text) to authenticated;
grant select on public.membership_overview to authenticated;
