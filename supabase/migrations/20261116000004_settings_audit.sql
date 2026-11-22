-- GRIT DIGITAL CLUB — 004 settings, opening hours, audit log.

create table public.settings (
  key text primary key check (key ~ '^[a-z_]+(\.[a-z_]+)+$'),
  value jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- Typed accessor with fallback, used by SQL business functions.
create or replace function public.setting_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (s.value #>> '{}')::integer from public.settings s where s.key = p_key), p_default);
$$;

-- Business defaults (docs/DECISIONS.md §5) and publicly known club data (docs/DECISIONS.md §1).
insert into public.settings (key, value) values
  ('membership.expiring_soon_days', '7'),
  ('membership.expiring_soon_visits', '2'),
  ('access.token_ttl_seconds', '60'),
  ('club.name', '"GRIT Fitness Center"'),
  ('club.tagline', '"A fitness center built around the full experience."'),
  ('club.phone', '"+381 62 1090 771"'),
  ('club.email', '"admin@gritgym.rs"'),
  ('club.website', '"https://gritgym.rs"'),
  ('club.address', '"Sarajevska, Beograd"'),
  ('club.instagram', '"https://www.instagram.com/grit.rs/"'),
  ('club.facebook', '"https://www.facebook.com/gritfitnessclub/"');

create table public.opening_hours (
  weekday smallint primary key check (weekday between 1 and 7), -- ISO: 1 = Monday
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  check (is_closed or (opens_at is not null and closes_at is not null and closes_at > opens_at))
);

create table public.opening_hours_exceptions (
  date date primary key,
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  note text,
  check (is_closed or (opens_at is not null and closes_at is not null and closes_at > opens_at))
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_roles text[] not null default '{}',
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null,
  entity_id uuid,
  diff jsonb,
  ip inet,
  user_agent text,
  request_id text,
  occurred_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, occurred_at desc);
create index audit_logs_occurred_idx on public.audit_logs (occurred_at desc);

create or replace function public.prevent_modification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% on % is not allowed (append-only table)', tg_op, tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.prevent_modification();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.prevent_modification();
