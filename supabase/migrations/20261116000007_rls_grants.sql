-- GRIT DIGITAL CLUB — 007 Row Level Security and client grants (docs/DATABASE.md §9, docs/SECURITY.md §3).
-- Principle: RLS ON for every table, deny by default. Clients never write business tables;
-- the API runs member requests as role `authenticated` with JWT claims, so these policies also bind the API.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    -- Not FORCE: the API's privileged (owner) connection is used for staff operations,
    -- which are authorized in the API by permission guards and audited.
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;

grant usage on schema public to anon, authenticated;

-- Functions needed while evaluating policies / member queries.
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.club_today() to anon, authenticated;
grant execute on function public.setting_int(text, integer) to authenticated;
grant execute on function
  public.membership_display_status(public.membership_state, date, date, integer, integer, date)
  to authenticated;

-- ── Public content (anon + authenticated) ────────────────────────────────────
grant select on public.membership_plans, public.membership_plan_translations,
  public.membership_plan_zones, public.zones, public.opening_hours,
  public.opening_hours_exceptions, public.settings to anon, authenticated;

create policy plans_public_read on public.membership_plans
  for select to anon, authenticated using (is_available);
create policy plan_translations_public_read on public.membership_plan_translations
  for select to anon, authenticated
  using (exists (select 1 from public.membership_plans p where p.id = plan_id and p.is_available));
create policy plan_zones_public_read on public.membership_plan_zones
  for select to anon, authenticated
  using (exists (select 1 from public.membership_plans p where p.id = plan_id and p.is_available));
create policy zones_public_read on public.zones
  for select to anon, authenticated using (is_public);
create policy opening_hours_public_read on public.opening_hours
  for select to anon, authenticated using (true);
create policy opening_hours_exceptions_public_read on public.opening_hours_exceptions
  for select to anon, authenticated using (true);
create policy settings_public_read on public.settings
  for select to anon, authenticated using (key like 'club.%');

-- ── Own data (authenticated members) ─────────────────────────────────────────
grant select on public.profiles to authenticated;
grant update (first_name, last_name, phone, locale, avatar_path) on public.profiles to authenticated;
create policy profiles_self_read on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_self_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select (id, user_id, member_number, first_name, last_name, email, phone, date_of_birth,
  photo_path, notes_public, marketing_opt_in, deactivated_at, created_at, updated_at)
  on public.members to authenticated;
create policy members_self_read on public.members
  for select to authenticated using (user_id = auth.uid());

grant select on public.memberships to authenticated;
create policy memberships_self_read on public.memberships
  for select to authenticated using (member_id = public.current_member_id());

grant select on public.membership_pauses to authenticated;
create policy membership_pauses_self_read on public.membership_pauses
  for select to authenticated
  using (exists (select 1 from public.memberships ms
                 where ms.id = membership_id and ms.member_id = public.current_member_id()));

-- Members see their payments without internal notes or staff attribution.
grant select (id, member_id, membership_id, amount, currency, method, status, paid_at,
  discount_amount, refund_of) on public.payments to authenticated;
create policy payments_self_read on public.payments
  for select to authenticated using (member_id = public.current_member_id());

-- Members see only successful check-ins, without staff/terminal details.
grant select (id, member_id, source, result, occurred_at) on public.attendance_attempts to authenticated;
create policy attendance_self_read on public.attendance_attempts
  for select to authenticated
  using (member_id = public.current_member_id() and result = 'granted');

grant select, insert on public.member_consents to authenticated;
create policy consents_self_read on public.member_consents
  for select to authenticated using (member_id = public.current_member_id());
create policy consents_self_insert on public.member_consents
  for insert to authenticated
  with check (member_id = public.current_member_id() and source = 'app');

-- Everything else (roles, permissions, user_roles, staff_profiles, member_notes, member_link_codes,
-- access_tokens, audit_logs, plan time windows) has NO client grants: staff access goes through the API.
