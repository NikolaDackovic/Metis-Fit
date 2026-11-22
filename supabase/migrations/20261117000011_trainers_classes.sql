-- GRIT DIGITAL CLUB — 011 trainers, group classes, bookings + waitlist, PT requests and PT sessions.
-- Business rules: docs/DECISIONS.md A15 (booking window 7 days, free cancel until 2 h before,
-- 3 no-shows / late cancels in 30 days → 7-day booking ban, FIFO waitlist with auto-promotion,
-- a group class does not consume an extra visit).

-- ── Trainers ─────────────────────────────────────────────────────────────────
-- A trainer profile exists independently of an app account (user_id is optional), so the owner
-- can publish the team before every trainer has a login.
create table public.trainers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles (id) on delete set null,
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  photo_path text,
  instagram text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  is_public boolean not null default false, -- shown in the app/site only with written consent
  offers_personal_training boolean not null default true,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trainers_updated_at before update on public.trainers
  for each row execute function public.set_updated_at();

create table public.trainer_translations (
  trainer_id uuid not null references public.trainers (id) on delete cascade,
  locale text not null check (locale in ('sr', 'en', 'ru', 'ar')),
  title text check (title is null or length(title) <= 80), -- e.g. "Personal & CrossFit Coach"
  bio text check (bio is null or length(bio) <= 2000),
  primary key (trainer_id, locale)
);

-- ── Class types (CrossFit, boks, kik-boks…) ──────────────────────────────────
create table public.class_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]{2,40}$'),
  zone_id uuid not null references public.zones (id) on delete restrict, -- membership must cover it
  color text not null default '#E54E26' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  default_duration_min smallint not null default 60 check (default_duration_min between 15 and 240),
  default_capacity smallint not null default 12 check (default_capacity between 1 and 200),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger class_types_updated_at before update on public.class_types
  for each row execute function public.set_updated_at();

create table public.class_type_translations (
  class_type_id uuid not null references public.class_types (id) on delete cascade,
  locale text not null check (locale in ('sr', 'en', 'ru', 'ar')),
  name text not null check (length(trim(name)) between 1 and 80),
  description text check (description is null or length(description) <= 2000),
  primary key (class_type_id, locale)
);

-- ── Weekly schedule template → generated sessions ────────────────────────────
create table public.class_series (
  id uuid primary key default gen_random_uuid(),
  class_type_id uuid not null references public.class_types (id) on delete restrict,
  trainer_id uuid references public.trainers (id) on delete set null,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: 1 = Monday
  start_time time not null,
  duration_min smallint not null check (duration_min between 15 and 240),
  capacity smallint not null check (capacity between 1 and 200),
  room_key text check (room_key is null or room_key ~ '^[a-z0-9_-]{1,40}$'), -- stable map key
  valid_from date not null,
  valid_until date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from)
);
create trigger class_series_updated_at before update on public.class_series
  for each row execute function public.set_updated_at();

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  class_type_id uuid not null references public.class_types (id) on delete restrict,
  series_id uuid references public.class_series (id) on delete set null,
  trainer_id uuid references public.trainers (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity smallint not null check (capacity between 1 and 200),
  room_key text check (room_key is null or room_key ~ '^[a-z0-9_-]{1,40}$'),
  note text check (note is null or length(note) <= 500), -- visible to members
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  cancelled_reason text,
  cancelled_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (status <> 'cancelled' or cancelled_reason is not null),
  unique (series_id, starts_at) -- idempotent generation from a series
);
create trigger classes_updated_at before update on public.classes
  for each row execute function public.set_updated_at();
create index classes_starts_idx on public.classes (starts_at);

-- ── Bookings (confirmed + waitlist in one table, FIFO by created_at) ─────────
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete restrict,
  member_id uuid not null references public.members (id) on delete restrict,
  status text not null check (status in ('confirmed', 'waitlisted', 'cancelled', 'attended', 'no_show')),
  source text not null default 'app' check (source in ('app', 'staff')),
  promoted_at timestamptz, -- moved from the waitlist to confirmed
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  late_cancel boolean not null default false, -- counts as a strike (DECISIONS A15)
  attendance_marked_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create trigger bookings_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();
-- created_at uses clock_timestamp(): the waitlist is FIFO by the moment the row was written under the
-- class lock, not by when the (possibly waiting) transaction started.
-- One live booking (confirmed / waitlisted / attended / no-show) per member and class.
create unique index bookings_one_per_class on public.bookings (class_id, member_id)
  where status <> 'cancelled';
create index bookings_class_status_idx on public.bookings (class_id, status, created_at);
create index bookings_member_idx on public.bookings (member_id, created_at desc);

-- ── Personal training ────────────────────────────────────────────────────────
create table public.pt_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  trainer_id uuid references public.trainers (id) on delete set null, -- null = any trainer
  goal text not null check (length(trim(goal)) between 3 and 1000),
  preferred_times text check (preferred_times is null or length(preferred_times) <= 300),
  status text not null default 'new' check (status in ('new', 'contacted', 'scheduled', 'closed', 'cancelled')),
  staff_note text check (staff_note is null or length(staff_note) <= 1000), -- internal
  handled_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger pt_requests_updated_at before update on public.pt_requests
  for each row execute function public.set_updated_at();
create index pt_requests_status_idx on public.pt_requests (status, created_at);
-- At most one open request per member (they can follow up on it instead of spamming).
create unique index pt_requests_one_open on public.pt_requests (member_id)
  where status in ('new', 'contacted');

-- A held PT session consumes one session of a personal_training membership (DECISIONS §4).
create table public.pt_sessions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id) on delete restrict,
  trainer_id uuid references public.trainers (id) on delete set null,
  held_on date not null,
  note text check (note is null or length(note) <= 500),
  recorded_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  check ((voided_at is null) = (void_reason is null))
);
create index pt_sessions_membership_idx on public.pt_sessions (membership_id, held_on desc);

-- ── Settings and permissions ─────────────────────────────────────────────────
insert into public.settings (key, value) values
  ('classes.booking_window_days', '7'),
  ('classes.cancel_cutoff_minutes', '120'),
  ('classes.strike_limit', '3'),
  ('classes.strike_window_days', '30'),
  ('classes.ban_days', '7'),
  ('classes.generate_ahead_days', '28')
on conflict (key) do nothing;

insert into public.permissions (key, description) values
  ('trainers.manage', 'Create and edit trainer profiles'),
  ('classes.manage', 'Manage class types, the weekly schedule and sessions'),
  ('classes.roster', 'View class rosters, book members in and mark attendance'),
  ('pt.manage', 'Handle personal-training requests and record PT sessions');

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r
join public.permissions p on p.key in ('trainers.manage', 'classes.manage', 'classes.roster', 'pt.manage')
where r.key in ('owner', 'manager');
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r
join public.permissions p on p.key in ('classes.roster', 'pt.manage')
where r.key in ('reception', 'trainer');

-- ── Session generation from weekly series (idempotent) ───────────────────────
-- Creates the sessions of every active series up to p_until (club time, Europe/Belgrade).
create or replace function public.generate_class_sessions(p_until date)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.classes (class_type_id, series_id, trainer_id, starts_at, ends_at, capacity, room_key)
  select s.class_type_id, s.id, s.trainer_id,
         (d::date + s.start_time) at time zone 'Europe/Belgrade',
         (d::date + s.start_time) at time zone 'Europe/Belgrade' + make_interval(mins => s.duration_min),
         s.capacity, s.room_key
  from public.class_series s
  join public.class_types ct on ct.id = s.class_type_id and ct.is_active
  cross join lateral generate_series(
    greatest(s.valid_from, public.club_today()),
    least(coalesce(s.valid_until, p_until), p_until),
    interval '1 day'
  ) as d
  where extract(isodow from d)::int = s.weekday
  on conflict (series_id, starts_at) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.generate_class_sessions(date) from public, anon, authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.trainers enable row level security;
alter table public.trainer_translations enable row level security;
alter table public.class_types enable row level security;
alter table public.class_type_translations enable row level security;
alter table public.class_series enable row level security;
alter table public.classes enable row level security;
alter table public.bookings enable row level security;
alter table public.pt_requests enable row level security;
alter table public.pt_sessions enable row level security;

revoke all on public.trainers, public.trainer_translations, public.class_types,
  public.class_type_translations, public.class_series, public.classes, public.bookings,
  public.pt_requests, public.pt_sessions from anon, authenticated;

-- Public: trainers who agreed to be shown (no account link), active class types, the schedule.
grant select (id, first_name, last_name, photo_path, instagram, offers_personal_training, sort_order)
  on public.trainers to anon, authenticated;
create policy trainers_public on public.trainers for select to anon, authenticated
  using (is_public and archived_at is null);
-- Policy helper: clients have no grant on trainers.is_public, so the check runs as definer.
create or replace function public.is_public_trainer(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trainers t where t.id = p_id and t.is_public and t.archived_at is null);
$$;
grant execute on function public.is_public_trainer(uuid) to anon, authenticated;
grant select on public.trainer_translations to anon, authenticated;
create policy trainer_translations_public on public.trainer_translations for select to anon, authenticated
  using (public.is_public_trainer(trainer_id));

grant select on public.class_types, public.class_type_translations to anon, authenticated;
create policy class_types_public on public.class_types for select to anon, authenticated using (is_active);
create policy class_type_translations_public on public.class_type_translations for select to anon, authenticated
  using (exists (select 1 from public.class_types c where c.id = class_type_id and c.is_active));

-- Schedule without staff attribution.
grant select (id, class_type_id, trainer_id, starts_at, ends_at, capacity, room_key, note, status)
  on public.classes to anon, authenticated;
create policy classes_public on public.classes for select to anon, authenticated using (true);

-- Own bookings and PT requests (writes go through the API, which enforces capacity and rules).
grant select (id, class_id, member_id, status, promoted_at, cancelled_at, late_cancel, created_at)
  on public.bookings to authenticated;
create policy bookings_self_read on public.bookings for select to authenticated
  using (member_id = public.current_member_id());

grant select (id, member_id, trainer_id, goal, preferred_times, status, created_at, updated_at)
  on public.pt_requests to authenticated;
create policy pt_requests_self_read on public.pt_requests for select to authenticated
  using (member_id = public.current_member_id());

grant select (id, membership_id, trainer_id, held_on, voided_at) on public.pt_sessions to authenticated;
create policy pt_sessions_self_read on public.pt_sessions for select to authenticated
  using (exists (select 1 from public.memberships ms
                 where ms.id = membership_id and ms.member_id = public.current_member_id()));
-- class_series has no client grants (staff only, through the API).
