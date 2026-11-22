-- GRIT DIGITAL CLUB - 039 F13-2: membership pause ("freeze").
-- A member asks in the app, staff with `memberships.pause` approve (or enter a pause directly).
-- An approved pause moves the end date by its length; while it runs the membership shows as
-- "paused" and gives no entry. Limits per plan: max_pauses (count) and max_pause_days (total
-- days per membership); 0 means pausing is not offered for that plan.

alter table public.membership_pauses
  add column decided_at timestamptz,
  add column decision_note text check (decision_note is null or length(decision_note) <= 300),
  add constraint membership_pauses_reason_len check (reason is null or length(reason) <= 300);

-- Two live pauses of one membership never overlap (concurrent requests: exactly one wins).
alter table public.membership_pauses
  add constraint membership_pauses_no_overlap exclude using gist (
    membership_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  ) where (status in ('requested', 'approved'));

create index membership_pauses_requested_idx on public.membership_pauses (created_at)
  where status = 'requested';

-- "Paused" is computed from an approved pause covering today (no job has to flip a state).
-- Same columns as before (the view was created with ms.* of that time).
create or replace view public.membership_overview with (security_invoker = true) as
select
  ms.id, ms.member_id, ms.plan_id, ms.state, ms.start_date, ms.end_date, ms.visit_limit,
  ms.visits_used, ms.price_amount, ms.currency, ms.cancelled_reason, ms.sold_by, ms.created_at,
  ms.updated_at,
  case
    when ms.state = 'active' and exists (
      select 1 from public.membership_pauses mp
      where mp.membership_id = ms.id and mp.status = 'approved'
        and public.club_today() between mp.starts_on and mp.ends_on)
      then 'paused'
    else public.membership_display_status(ms.state, ms.start_date, ms.end_date, ms.visit_limit, ms.visits_used)
  end as display_status,
  case when ms.end_date is null then null else ms.end_date - public.club_today() end as days_left,
  case when ms.visit_limit is null then null else ms.visit_limit - ms.visits_used end as visits_remaining,
  coalesce((
    select sum(p.amount)::integer from public.payments p
    where p.membership_id = ms.id and p.status = 'recorded'
  ), 0) as paid_amount
from public.memberships ms;

-- Deciding on pauses is front-desk work (the plan sets the limits): reception may do it too.
-- The owner can take it away per role in Staff and permissions.
insert into public.role_permissions (club_id, role_id, permission_key)
select r.club_id, r.id, 'memberships.pause' from public.roles r where r.key = 'reception'
on conflict do nothing;
