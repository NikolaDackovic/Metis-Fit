-- Staff accounts and roles managed from the admin, and the trainers' own schedule.
--
-- Custom roles: the owner can add roles (e.g. "Menadžer kafića") with any set of permissions.
-- System roles keep their keys (translated in the apps); custom roles carry their own name.
-- The owner role always has every permission and cannot be edited.
--
-- Trainer appointments: personal sessions, consultations, assessments, meetings… that a trainer
-- (or a manager) puts in the trainer's calendar. Together with the group classes the trainer
-- leads, they form "Moj raspored". A trainer cannot be double booked.

alter table public.roles add column name text check (name is null or length(trim(name)) between 1 and 60);

create table public.trainer_appointments (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers (id) on delete cascade,
  member_id uuid references public.members (id) on delete set null,
  kind text not null check (kind in ('pt', 'consultation', 'assessment', 'meeting', 'other')),
  title text check (title is null or length(title) <= 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text check (location is null or length(location) <= 80),
  note text check (note is null or length(note) <= 500),
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled', 'no_show')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '12 hours')
);
create trigger trainer_appointments_updated_at before update on public.trainer_appointments
  for each row execute function public.set_updated_at();
alter table public.trainer_appointments add constraint trainer_appointments_no_overlap
  exclude using gist (trainer_id with =, tstzrange(starts_at, ends_at) with &&)
  where (status <> 'cancelled');
create index trainer_appointments_member_idx on public.trainer_appointments (member_id, starts_at);

alter table public.trainer_appointments enable row level security;
revoke all on public.trainer_appointments from anon, authenticated;
-- Members see their own appointments through the API.

-- Trainers manage their own calendar; managers (trainers.manage) any trainer's.
insert into public.permissions (key, description) values
  ('schedule.own', 'See and plan my own schedule as a trainer');
insert into public.role_permissions (role_id, permission_key)
select r.id, 'schedule.own' from public.roles r where r.key in ('owner', 'manager', 'trainer');
