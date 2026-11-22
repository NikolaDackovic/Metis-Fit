-- GRIT DIGITAL CLUB — 002 identity, roles, permissions, staff.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '' check (length(first_name) <= 80),
  last_name text not null default '' check (length(last_name) <= 80),
  phone text check (phone is null or length(phone) between 6 and 20),
  locale text not null default 'sr' check (locale in ('sr', 'en', 'ru', 'ar')),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile automatically for every new auth user (names come from signup metadata).
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locale text := coalesce(new.raw_user_meta_data ->> 'locale', 'sr');
begin
  if v_locale not in ('sr', 'en', 'ru', 'ar') then
    v_locale := 'sr';
  end if;
  insert into public.profiles (id, first_name, last_name, locale)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'first_name', ''), 80),
    left(coalesce(new.raw_user_meta_data ->> 'last_name', ''), 80),
    v_locale
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z_]{2,40}$'),
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.permissions (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission_key)
);

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete restrict,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);
create index user_roles_role_idx on public.user_roles (role_id);

create table public.staff_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  job_title text,
  bio text,
  is_trainer boolean not null default false,
  public_profile boolean not null default false,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger staff_profiles_updated_at before update on public.staff_profiles
  for each row execute function public.set_updated_at();

-- Permission check used by RLS policies and the API.
create or replace function public.has_permission(p_user uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = p_user and rp.permission_key = p_permission
  );
$$;

-- System roles and permissions (reference data, required in every environment).
insert into public.roles (key, is_system) values
  ('owner', true), ('manager', true), ('reception', true), ('trainer', true),
  ('cafe_staff', true), ('maintenance', true), ('member', true);

insert into public.permissions (key, description) values
  ('members.read', 'View members and their profiles'),
  ('members.create', 'Create members'),
  ('members.update', 'Edit members, send invites, issue link codes'),
  ('members.deactivate', 'Deactivate members'),
  ('members.notes', 'Read and write internal member notes'),
  ('plans.read', 'View membership plans'),
  ('plans.manage', 'Create and edit membership plans'),
  ('memberships.create', 'Assign memberships'),
  ('memberships.cancel', 'Cancel memberships'),
  ('memberships.pause', 'Approve and manage pauses'),
  ('payments.read', 'View payments'),
  ('payments.create', 'Record payments'),
  ('payments.void', 'Void payments'),
  ('payments.refund', 'Refund payments'),
  ('payments.export', 'Export payments'),
  ('attendance.checkin', 'Validate QR codes and check members in'),
  ('attendance.override', 'Override a denied check-in'),
  ('attendance.read', 'View attendance history'),
  ('staff.manage', 'Manage staff accounts and their roles'),
  ('roles.manage', 'Change role permissions'),
  ('settings.manage', 'Change club settings and opening hours'),
  ('reports.read', 'View dashboard and reports'),
  ('audit.read', 'View the audit log');

-- owner: everything
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r cross join public.permissions p where r.key = 'owner';

-- manager: everything except role/permission management
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r cross join public.permissions p
where r.key = 'manager' and p.key <> 'roles.manage';

-- reception: day-to-day front desk (no void/refund/export, no settings, no reports)
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r
join public.permissions p on p.key in (
  'members.read', 'members.create', 'members.update', 'members.notes',
  'plans.read', 'memberships.create', 'payments.read', 'payments.create',
  'attendance.checkin', 'attendance.override', 'attendance.read'
)
where r.key = 'reception';

-- trainer: check-in for their sessions + member lookup (narrowed further in phase 6)
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r
join public.permissions p on p.key in ('members.read', 'attendance.checkin', 'attendance.read')
where r.key = 'trainer';
