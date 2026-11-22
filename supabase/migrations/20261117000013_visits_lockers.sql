-- GRIT DIGITAL CLUB — 013 visits (who is inside now), check-out, changing rooms and lockers.
-- Decisions (2026-11-17): the guest chooses a free locker in the app; the locker is released at
-- check-out. A visit opens automatically with every granted entry and closes when the member or
-- the desk checks out, or automatically after `visits.auto_close_hours` (members forget to check out).

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  attempt_id uuid references public.attendance_attempts (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by text check (ended_by in ('member', 'staff', 'auto')),
  ended_by_user uuid references public.profiles (id) on delete set null,
  locker_id uuid,
  locker_taken_at timestamptz,
  check ((ended_at is null) = (ended_by is null)),
  check (ended_at is null or ended_at >= started_at)
);
-- One open visit per member.
create unique index visits_one_open on public.visits (member_id) where ended_at is null;
create index visits_started_idx on public.visits (started_at desc);

-- ── Changing rooms and lockers ───────────────────────────────────────────────
create table public.changing_rooms (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]{2,40}$'),
  sort_order integer not null default 0,
  is_active boolean not null default true
);
create table public.changing_room_translations (
  changing_room_id uuid not null references public.changing_rooms (id) on delete cascade,
  locale text not null check (locale in ('sr', 'en', 'ru', 'ar')),
  name text not null,
  primary key (changing_room_id, locale)
);
-- Reference structure (the club has a men's and a women's changing room); lockers are added in the admin.
insert into public.changing_rooms (key, sort_order) values ('men', 10), ('women', 20);
insert into public.changing_room_translations (changing_room_id, locale, name)
select r.id, t.locale, t.name from public.changing_rooms r
join (values
  ('men', 'sr', 'Muška svlačionica'), ('men', 'en', 'Men''s changing room'), ('men', 'ru', 'Мужская раздевалка'),
  ('women', 'sr', 'Ženska svlačionica'), ('women', 'en', 'Women''s changing room'), ('women', 'ru', 'Женская раздевалка')
) as t(key, locale, name) on t.key = r.key;

create table public.lockers (
  id uuid primary key default gen_random_uuid(),
  changing_room_id uuid not null references public.changing_rooms (id) on delete restrict,
  number integer not null check (number between 1 and 9999),
  status text not null default 'available' check (status in ('available', 'out_of_service')),
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (changing_room_id, number)
);
alter table public.visits
  add constraint visits_locker_fk foreign key (locker_id) references public.lockers (id) on delete set null;
-- A locker can be held by one open visit at a time (concurrent picks: exactly one wins).
create unique index visits_one_per_locker on public.visits (locker_id)
  where ended_at is null and locker_id is not null;

insert into public.settings (key, value) values ('visits.auto_close_hours', '5')
on conflict (key) do nothing;

-- Closes visits nobody checked out of; their lockers become free again.
create or replace function public.close_stale_visits()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_hours integer := public.setting_int('visits.auto_close_hours', 5);
  v_count integer;
begin
  update public.visits
     set ended_at = started_at + make_interval(hours => v_hours), ended_by = 'auto'
   where ended_at is null and started_at < now() - make_interval(hours => v_hours);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Every granted entry opens a visit (QR, manual or override). Re-entry while inside keeps the visit.
create or replace function public.open_visit_on_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.result = 'granted' and new.member_id is not null then
    perform public.close_stale_visits();
    insert into public.visits (member_id, attempt_id, started_at)
    values (new.member_id, new.id, new.occurred_at)
    on conflict (member_id) where ended_at is null do nothing;
  end if;
  return new;
end;
$$;
create trigger attendance_opens_visit after insert on public.attendance_attempts
  for each row execute function public.open_visit_on_entry();
revoke execute on function public.close_stale_visits(), public.open_visit_on_entry()
  from public, anon, authenticated;

insert into public.permissions (key, description) values
  ('lockers.manage', 'Add lockers, take them out of service');
insert into public.role_permissions (role_id, permission_key)
select r.id, 'lockers.manage' from public.roles r where r.key in ('owner', 'manager', 'maintenance');

-- ── RLS: members see their own visits; locker occupancy only through the API (no names) ──
alter table public.visits enable row level security;
alter table public.changing_rooms enable row level security;
alter table public.changing_room_translations enable row level security;
alter table public.lockers enable row level security;
revoke all on public.visits, public.changing_rooms, public.changing_room_translations, public.lockers
  from anon, authenticated;
grant select (id, member_id, started_at, ended_at, ended_by, locker_id) on public.visits to authenticated;
create policy visits_self on public.visits for select to authenticated
  using (member_id = public.current_member_id());
grant select on public.changing_rooms, public.changing_room_translations, public.lockers to authenticated;
create policy changing_rooms_read on public.changing_rooms for select to authenticated using (is_active);
create policy changing_room_translations_read on public.changing_room_translations
  for select to authenticated using (true);
create policy lockers_read on public.lockers for select to authenticated using (true);
