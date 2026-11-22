-- GRIT DIGITAL CLUB — 009 members can always see the plans they hold.
-- Public policies only expose plans that are on sale. A member whose plan was later
-- hidden must still see its name, type and zones in the app.

create or replace function public.member_holds_plan(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships ms
    where ms.plan_id = p_plan_id and ms.member_id = public.current_member_id()
  );
$$;
grant execute on function public.member_holds_plan(uuid) to authenticated;

create policy plans_member_read on public.membership_plans
  for select to authenticated using (public.member_holds_plan(id));
create policy plan_translations_member_read on public.membership_plan_translations
  for select to authenticated using (public.member_holds_plan(plan_id));
create policy plan_zones_member_read on public.membership_plan_zones
  for select to authenticated using (public.member_holds_plan(plan_id));
