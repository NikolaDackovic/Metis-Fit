-- GRIT DIGITAL CLUB - 035 F12-1c: strict club isolation.
--
-- The API runs its privileged work as role grit_api, which does NOT bypass Row Level Security.
-- Every club table gets a RESTRICTIVE policy club_id = public.current_club_id() for grit_api,
-- anon and authenticated: whatever a query forgets, it can only ever see and write rows of the
-- request's club (app.club_id, set per transaction from the X-Club header).
-- Functions that run as owner (security definer) now look only at the current club.

-- ── Functions: current club only ─────────────────────────────────────────────
create or replace function public.setting_int(p_key text, p_default integer)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select (s.value #>> '{}')::integer from public.settings s
                   where s.club_id = public.current_club_id() and s.key = p_key), p_default);
$$;

create or replace function public.setting_text_for(p_club uuid, p_key text)
returns text language sql stable security definer set search_path = '' as $$
  select s.value #>> '{}' from public.settings s where s.club_id = p_club and s.key = p_key;
$$;
revoke execute on function public.setting_text_for(uuid, text) from public, anon, authenticated;

create or replace function public.has_permission(p_user uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.club_id = public.current_club_id()
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = p_user and rp.permission_key = p_permission
  );
$$;

-- One person can be a member of several clubs: "me" is the membership in the current club.
create or replace function public.current_member_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.id from public.members m
  where m.user_id = auth.uid() and m.club_id = public.current_club_id();
$$;

create or replace function public.loyalty_on_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_points integer := coalesce(public.setting_text_for(new.club_id, 'loyalty.points_per_visit')::integer, 10);
begin
  if new.result = 'granted' and new.member_id is not null and v_points > 0
     and coalesce(public.setting_text_for(new.club_id, 'loyalty.enabled'), 'true') = 'true' then
    insert into public.loyalty_ledger (club_id, member_id, points, reason, ref)
    values (new.club_id, new.member_id, v_points, 'visit',
            'visit:' || (new.occurred_at at time zone 'Europe/Belgrade')::date)
    on conflict (member_id, ref) where ref is not null do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.loyalty_on_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_per integer := greatest(coalesce(public.setting_text_for(new.club_id, 'loyalty.minor_per_point')::integer, 10000), 1);
  v_points integer;
begin
  if coalesce(public.setting_text_for(new.club_id, 'loyalty.enabled'), 'true') <> 'true' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.status = 'recorded' then
    v_points := trunc(new.amount::numeric / v_per)::integer; -- refunds (negative) take points back
    if v_points <> 0 then
      insert into public.loyalty_ledger (club_id, member_id, points, reason, ref)
      values (new.club_id, new.member_id, v_points, 'payment', 'payment:' || new.id)
      on conflict (member_id, ref) where ref is not null do nothing;
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'recorded' and new.status = 'voided' then
    insert into public.loyalty_ledger (club_id, member_id, points, reason, ref)
    select new.club_id, l.member_id, -l.points, 'payment_void', 'payment_void:' || new.id
    from public.loyalty_ledger l
    where l.member_id = new.member_id and l.ref = 'payment:' || new.id
    on conflict (member_id, ref) where ref is not null do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.pt_session_share()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_service uuid := (select id from public.services where club_id = new.club_id and key = 'pt_session');
  v_base integer;
begin
  if new.trainer_id is null or v_service is null then return new; end if;
  -- Value of one session = package price / number of sessions in the package.
  select case when ms.visit_limit > 0 then round(ms.price_amount::numeric / ms.visit_limit)::int
              else ms.price_amount end
    into v_base
  from public.memberships ms where ms.id = new.membership_id;
  new.trainer_share_amount := coalesce(public.trainer_share(new.trainer_id, v_service, coalesce(v_base, 0)), 0);
  return new;
end;
$$;

-- Only the e-mail of one account, for API code running as grit_api (no access to auth.users).
create or replace function public.account_email(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select u.email::text from auth.users u where u.id = p_user;
$$;
revoke execute on function public.account_email(uuid) from public, anon, authenticated;

-- ── The API role ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'grit_api') then
    create role grit_api nologin nobypassrls;
  end if;
end $$;
grant grit_api to current_user;
grant usage on schema public to grit_api;
grant select, insert, update, delete on all tables in schema public to grit_api;
grant usage, select on all sequences in schema public to grit_api;
grant execute on all functions in schema public to grit_api;
alter default privileges in schema public grant select, insert, update, delete on tables to grit_api;
alter default privileges in schema public grant usage, select on sequences to grit_api;
alter default privileges in schema public grant execute on functions to grit_api;
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    execute 'grant usage on schema extensions to grit_api';
  end if;
end $$;

-- ── Policies ─────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  -- grit_api may use every table that has RLS on (the API decides who may do what) ...
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('create policy %I on public.%I for all to grit_api using (true) with check (true)',
                   t || '_api', t);
  end loop;
  -- ... but club tables only within the current club, for every non-owner role.
  foreach t in array array['access_tokens', 'announcements', 'attendance_attempts', 'bookings', 'business_document_lines', 'business_documents', 'cafe_categories', 'cafe_items', 'cafe_order_items', 'cafe_orders', 'cafe_stock_movements', 'cafe_tables', 'changing_room_translations', 'changing_rooms', 'class_series', 'class_type_translations', 'class_types', 'classes', 'club_closures', 'club_photos', 'equipment', 'equipment_exercises', 'equipment_placements', 'equipment_service_log', 'equipment_translations', 'floor_translations', 'floors', 'lockers', 'loyalty_ledger', 'loyalty_rewards', 'maintenance_requests', 'map_versions', 'member_consents', 'member_link_codes', 'member_notes', 'member_nutrition_plans', 'members', 'membership_pauses', 'membership_plan_time_windows', 'membership_plan_translations', 'membership_plan_zones', 'membership_plans', 'memberships', 'nutrition_plans', 'nutrition_template_translations', 'nutrition_templates', 'opening_hours', 'opening_hours_exceptions', 'partners', 'payments', 'promo_codes', 'promo_redemptions', 'pt_requests', 'pt_sessions', 'role_permissions', 'roles', 'room_translations', 'rooms', 'service_sales', 'services', 'settings', 'shift_types', 'staff_absences', 'staff_pay_rates', 'staff_profiles', 'staff_shift_rules', 'staff_time_entries', 'stock_count_lines', 'stock_counts', 'trainer_appointments', 'trainer_clients', 'trainer_service_rates', 'trainer_translations', 'trainers', 'user_roles', 'visits', 'workout_plan_days', 'workout_plan_items', 'workout_plans', 'zones'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_api') then
      execute format('create policy %I on public.%I for all to grit_api using (true) with check (true)', t || '_api', t);
    end if;
    execute format(
      'create policy %I on public.%I as restrictive for all to grit_api, anon, authenticated
         using (club_id = public.current_club_id()) with check (club_id = public.current_club_id())',
      t || '_club', t);
  end loop;
end $$;

-- (clubs: the loop above already lets grit_api read every club, needed to resolve X-Club.)
