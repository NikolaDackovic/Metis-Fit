-- GRIT DIGITAL CLUB - 031 staff shifts, absences, non-working days, time clock and hourly pay.
--
-- The club defines its own shifts (e.g. "Prva 07-15", "Druga 15-23", "Medjusmena"), then says
-- who works which shift on which weekdays from a date (optionally until a date):
--   employee 2: Mon-Wed first shift, Thu-Sat second shift  ->  two rows in staff_shift_rules.
-- The weekly table is computed from these rules, minus absences and closed days.
-- Staff clock in/out (staff_time_entries); hours x hourly rate gives the monthly payout overview.

create table public.shift_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 40),
  starts_at time not null,
  ends_at time not null, -- may be earlier than starts_at for a night shift (ends next day)
  color text not null default '#E54E26' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (starts_at <> ends_at)
);

create table public.staff_shift_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  shift_type_id uuid not null references public.shift_types (id) on delete cascade,
  weekdays smallint[] not null
    check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  valid_from date not null,
  valid_until date,
  note text check (note is null or length(note) <= 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from)
);
create index staff_shift_rules_user on public.staff_shift_rules (user_id);

create table public.staff_absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('vacation', 'sick', 'day_off', 'holiday', 'other')),
  starts_on date not null,
  ends_on date not null,
  note text check (note is null or length(note) <= 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index staff_absences_user on public.staff_absences (user_id, starts_on);

-- Holidays, slava, inventory day...: closed = nobody is scheduled that day.
create table public.club_closures (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  name text not null check (length(trim(name)) between 1 and 80),
  is_closed boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.staff_time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  clock_in timestamptz not null,
  clock_out timestamptz,
  source text not null default 'self' check (source in ('self', 'admin')),
  note text check (note is null or length(note) <= 200),
  edited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (clock_out is null or clock_out > clock_in),
  check (clock_out is null or clock_out - clock_in <= interval '24 hours')
);
-- At most one open (not clocked out) entry per person.
create unique index staff_time_entries_one_open on public.staff_time_entries (user_id)
  where clock_out is null;
create index staff_time_entries_month on public.staff_time_entries (user_id, clock_in);

create table public.staff_pay_rates (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  hourly_rate_minor bigint not null check (hourly_rate_minor between 0 and 100000000),
  currency text not null default 'RSD' check (currency ~ '^[A-Z]{3}$'),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Staff data: only the API (service role) reads and writes these; no client access.
alter table public.shift_types enable row level security;
alter table public.staff_shift_rules enable row level security;
alter table public.staff_absences enable row level security;
alter table public.club_closures enable row level security;
alter table public.staff_time_entries enable row level security;
alter table public.staff_pay_rates enable row level security;

insert into public.permissions (key, description) values
  ('shifts.manage', 'Plan the weekly shift schedule, absences and non-working days'),
  ('shifts.view', 'See the whole weekly shift table'),
  ('shifts.own', 'See own shifts and clock in / out'),
  ('payroll.read', 'See worked hours, hourly rates and monthly payout; correct time entries');
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join (values
  ('owner', 'shifts.manage'), ('owner', 'shifts.view'), ('owner', 'shifts.own'), ('owner', 'payroll.read'),
  ('manager', 'shifts.manage'), ('manager', 'shifts.view'), ('manager', 'shifts.own'), ('manager', 'payroll.read'),
  ('reception', 'shifts.view'), ('reception', 'shifts.own'),
  ('trainer', 'shifts.own'),
  ('cafe_staff', 'shifts.own'),
  ('maintenance', 'shifts.own')
) as p (role, key) on p.role = r.key;
