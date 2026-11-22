-- GRIT DIGITAL CLUB - 034 F12-1a: clubs (multi-gym platform foundation).
-- Every table that belongs to one gym gets club_id. Existing rows belong to GRIT, the first club.
-- The column is added with a constant default (no UPDATE, so append-only triggers are untouched),
-- then the default switches to public.current_club_id(): inserts land in the request's club.
-- Account data (profiles, push tokens...), shared catalogs (exercises, muscle groups, equipment
-- categories) and personal data (workouts, measurements, food log...) stay without club_id;
-- personal data moves to the account in F12-2. See docs/F12_PLAN.md.

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null check (length(trim(name)) between 1 and 80),
  city text check (city is null or length(city) <= 80),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  is_default boolean not null default false,
  owner_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
create unique index clubs_one_default on public.clubs ((true)) where is_default;
alter table public.clubs enable row level security;
create policy clubs_public_active on public.clubs for select to anon, authenticated
  using (status = 'active');
grant select on public.clubs to anon, authenticated;

insert into public.clubs (slug, name, city, status, is_default, approved_at)
values ('grit', 'GRIT', 'Beograd', 'active', true, now());

--
-- The club of the current request (set by the API per transaction). Until every caller sets it
-- (F12-1b/c) it falls back to the default club, so a single-gym install behaves as before.
--
create or replace function public.current_club_id() returns uuid
language sql stable set search_path = '' as $$
  select coalesce(
    nullif(current_setting('app.club_id', true), '')::uuid,
    (select c.id from public.clubs c where c.is_default)
  )
$$;
grant execute on function public.current_club_id() to anon, authenticated;

do $$
declare
  t text;
  grit uuid := (select id from public.clubs where is_default);
begin
  foreach t in array array['access_tokens', 'announcements', 'attendance_attempts', 'bookings', 'business_document_lines', 'business_documents', 'cafe_categories', 'cafe_items', 'cafe_order_items', 'cafe_orders', 'cafe_stock_movements', 'cafe_tables', 'changing_room_translations', 'changing_rooms', 'class_series', 'class_type_translations', 'class_types', 'classes', 'club_closures', 'club_photos', 'equipment', 'equipment_exercises', 'equipment_placements', 'equipment_service_log', 'equipment_translations', 'floor_translations', 'floors', 'lockers', 'loyalty_ledger', 'loyalty_rewards', 'maintenance_requests', 'map_versions', 'member_consents', 'member_link_codes', 'member_notes', 'member_nutrition_plans', 'members', 'membership_pauses', 'membership_plan_time_windows', 'membership_plan_translations', 'membership_plan_zones', 'membership_plans', 'memberships', 'nutrition_plans', 'nutrition_template_translations', 'nutrition_templates', 'opening_hours', 'opening_hours_exceptions', 'partners', 'payments', 'promo_codes', 'promo_redemptions', 'pt_requests', 'pt_sessions', 'role_permissions', 'roles', 'room_translations', 'rooms', 'service_sales', 'services', 'settings', 'shift_types', 'staff_absences', 'staff_pay_rates', 'staff_profiles', 'staff_shift_rules', 'staff_time_entries', 'stock_count_lines', 'stock_counts', 'trainer_appointments', 'trainer_clients', 'trainer_service_rates', 'trainer_translations', 'trainers', 'user_roles', 'visits', 'workout_plan_days', 'workout_plan_items', 'workout_plans', 'zones'] loop
    execute format(
      'alter table public.%I add column club_id uuid not null default %L references public.clubs (id) on delete cascade',
      t, grit);
    execute format('alter table public.%I alter column club_id set default public.current_club_id()', t);
    execute format('create index %I on public.%I (club_id)', t || '_club_idx', t);
  end loop;
end $$;

-- ── Uniqueness per club ──────────────────────────────────────────────────────
-- Drops the unique / primary key constraint on exactly these columns, whatever its name.
create function pg_temp.drop_unique(p_table text, p_cols text[]) returns void
language plpgsql as $$
declare r record;
begin
  for r in
    select con.conname from pg_constraint con
    where con.conrelid = ('public.' || p_table)::regclass and con.contype in ('u', 'p')
      and (select array_agg(a.attname::text order by a.attname) from pg_attribute a
           where a.attrelid = con.conrelid and a.attnum = any (con.conkey))
          = (select array_agg(x order by x) from unnest(p_cols) x)
  loop
    execute format('alter table public.%I drop constraint %I', p_table, r.conname);
  end loop;
end $$;
select pg_temp.drop_unique('roles', array['key']);
alter table public.roles add constraint roles_club_key unique (club_id, key);

select pg_temp.drop_unique('members', array['member_number']);
alter table public.members add constraint members_club_number unique (club_id, member_number);
-- One account can be a member of several clubs (one member record per club).
select pg_temp.drop_unique('members', array['user_id']);
alter table public.members add constraint members_club_user unique (club_id, user_id);
drop index public.members_email_active_uq;
create unique index members_email_active_uq on public.members (club_id, email)
  where email is not null and deactivated_at is null;

select pg_temp.drop_unique('zones', array['key']);
alter table public.zones add constraint zones_club_key unique (club_id, key);

select pg_temp.drop_unique('map_versions', array['version']);
alter table public.map_versions add constraint map_versions_club_version unique (club_id, version);
drop index public.map_versions_one_draft;
drop index public.map_versions_one_published;
create unique index map_versions_one_draft on public.map_versions (club_id) where status = 'draft';
create unique index map_versions_one_published on public.map_versions (club_id) where status = 'published';

select pg_temp.drop_unique('equipment', array['asset_tag']);
alter table public.equipment add constraint equipment_club_asset_tag unique (club_id, asset_tag);

select pg_temp.drop_unique('class_types', array['key']);
alter table public.class_types add constraint class_types_club_key unique (club_id, key);

select pg_temp.drop_unique('changing_rooms', array['key']);
alter table public.changing_rooms add constraint changing_rooms_club_key unique (club_id, key);

select pg_temp.drop_unique('services', array['key']);
alter table public.services add constraint services_club_key unique (club_id, key);

select pg_temp.drop_unique('promo_codes', array['code']);
alter table public.promo_codes add constraint promo_codes_club_code unique (club_id, code);

drop index public.partners_tax_id_key;
create unique index partners_tax_id_key on public.partners (club_id, tax_id) where tax_id is not null;

select pg_temp.drop_unique('club_closures', array['day']);
alter table public.club_closures add constraint club_closures_club_day unique (club_id, day);

select pg_temp.drop_unique('settings', array['key']);
alter table public.settings add primary key (club_id, key);

select pg_temp.drop_unique('opening_hours', array['weekday']);
alter table public.opening_hours add primary key (club_id, weekday);

select pg_temp.drop_unique('opening_hours_exceptions', array['date']);
alter table public.opening_hours_exceptions add primary key (club_id, date);

select pg_temp.drop_unique('staff_profiles', array['user_id']);
alter table public.staff_profiles add primary key (club_id, user_id);

select pg_temp.drop_unique('staff_pay_rates', array['user_id']);
alter table public.staff_pay_rates add primary key (club_id, user_id);

select pg_temp.drop_unique('trainers', array['user_id']);
alter table public.trainers add constraint trainers_club_user unique (club_id, user_id);

drop index public.staff_time_entries_one_open;
create unique index staff_time_entries_one_open on public.staff_time_entries (club_id, user_id)
  where clock_out is null;

do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.nutrition_template_translations'::regclass and contype = 'f'
             and confrelid = 'public.nutrition_templates'::regclass
  loop
    execute format('alter table public.nutrition_template_translations drop constraint %I', r.conname);
  end loop;
end $$;
select pg_temp.drop_unique('nutrition_template_translations', array['goal', 'locale']);
select pg_temp.drop_unique('nutrition_templates', array['goal']);
alter table public.nutrition_templates add primary key (club_id, goal);
alter table public.nutrition_template_translations add primary key (club_id, goal, locale);
alter table public.nutrition_template_translations
  add constraint nutrition_template_translations_goal_fkey foreign key (club_id, goal)
  references public.nutrition_templates (club_id, goal) on delete cascade;
