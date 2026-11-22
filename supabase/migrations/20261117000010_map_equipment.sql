-- GRIT DIGITAL CLUB — 010 facility map (versioned), equipment registry, maintenance (docs/DATABASE.md §6).
-- Equipment is a registry independent from the map: deleting a room or a map version NEVER deletes equipment.

-- ── Map versions ─────────────────────────────────────────────────────────────
create table public.map_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  status text not null check (status in ('draft', 'published', 'archived')),
  revision integer not null default 1, -- optimistic lock for the draft editor
  is_schematic boolean not null default true, -- true = not an architectural plan (shown to users)
  note text,
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger map_versions_updated_at before update on public.map_versions
  for each row execute function public.set_updated_at();
create unique index map_versions_one_draft on public.map_versions ((true)) where status = 'draft';
create unique index map_versions_one_published on public.map_versions ((true)) where status = 'published';

create table public.floors (
  id uuid primary key default gen_random_uuid(),
  map_version_id uuid not null references public.map_versions (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_-]{1,40}$'),
  level smallint not null,
  width numeric(7, 2) not null default 40 check (width > 0),
  height numeric(7, 2) not null default 25 check (height > 0),
  sort_order integer not null default 0,
  unique (map_version_id, key)
);
create table public.floor_translations (
  floor_id uuid not null references public.floors (id) on delete cascade,
  locale text not null check (locale in ('sr', 'en', 'ru', 'ar')),
  name text not null check (length(trim(name)) between 1 and 80),
  primary key (floor_id, locale)
);

create type public.room_type as enum (
  'entrance', 'cafe', 'garden', 'reception', 'lockers', 'changing_room', 'toilet', 'stairs',
  'gym', 'crossfit', 'boxing', 'pool', 'studio', 'corridor', 'other'
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references public.floors (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_-]{1,40}$'), -- stable across versions (deep links, photos)
  type public.room_type not null,
  zone_id uuid references public.zones (id) on delete set null,
  -- Geometry in floor units: {"type":"rect","x":0,"y":0,"w":10,"h":6} (polygons may follow later)
  shape jsonb not null check (shape ->> 'type' in ('rect', 'polygon')),
  is_hidden boolean not null default false,
  unavailable_note text,
  is_unavailable boolean not null default false,
  unique (floor_id, key)
);
create table public.room_translations (
  room_id uuid not null references public.rooms (id) on delete cascade,
  locale text not null check (locale in ('sr', 'en', 'ru', 'ar')),
  name text not null check (length(trim(name)) between 1 and 80),
  description text check (description is null or length(description) <= 2000),
  primary key (room_id, locale)
);

-- ── Equipment registry ───────────────────────────────────────────────────────
create table public.equipment_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]{2,40}$'),
  sort_order integer not null default 0
);
create table public.equipment_category_translations (
  category_id uuid not null references public.equipment_categories (id) on delete cascade,
  locale text not null check (locale in ('sr', 'en', 'ru', 'ar')),
  name text not null,
  primary key (category_id, locale)
);
insert into public.equipment_categories (key, sort_order) values
  ('cardio', 10), ('strength_machines', 20), ('free_weights', 30), ('racks_benches', 40),
  ('crossfit', 50), ('boxing', 60), ('functional', 70), ('other', 99);
insert into public.equipment_category_translations (category_id, locale, name)
select c.id, t.locale, t.name from public.equipment_categories c
join (values
  ('cardio', 'sr', 'Kardio'), ('cardio', 'en', 'Cardio'), ('cardio', 'ru', 'Кардио'),
  ('strength_machines', 'sr', 'Sprave za snagu'), ('strength_machines', 'en', 'Strength machines'), ('strength_machines', 'ru', 'Силовые тренажёры'),
  ('free_weights', 'sr', 'Slobodni tegovi'), ('free_weights', 'en', 'Free weights'), ('free_weights', 'ru', 'Свободные веса'),
  ('racks_benches', 'sr', 'Rekovi i klupe'), ('racks_benches', 'en', 'Racks & benches'), ('racks_benches', 'ru', 'Стойки и скамьи'),
  ('crossfit', 'sr', 'CrossFit oprema'), ('crossfit', 'en', 'CrossFit equipment'), ('crossfit', 'ru', 'Оборудование CrossFit'),
  ('boxing', 'sr', 'Boks oprema'), ('boxing', 'en', 'Boxing equipment'), ('boxing', 'ru', 'Оборудование для бокса'),
  ('functional', 'sr', 'Funkcionalni trening'), ('functional', 'en', 'Functional training'), ('functional', 'ru', 'Функциональный тренинг'),
  ('other', 'sr', 'Ostalo'), ('other', 'en', 'Other'), ('other', 'ru', 'Другое')
) as t(key, locale, name) on t.key = c.key;

create type public.equipment_status as enum ('available', 'maintenance', 'out_of_service');

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.equipment_categories (id) on delete restrict,
  manufacturer text check (manufacturer is null or length(manufacturer) <= 80),
  model text check (model is null or length(model) <= 80),
  serial_number text check (serial_number is null or length(serial_number) <= 80),
  asset_tag text unique check (asset_tag is null or length(asset_tag) <= 40),
  purchased_on date,
  status public.equipment_status not null default 'available',
  video_url text check (video_url is null or video_url ~ '^https://'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger equipment_updated_at before update on public.equipment
  for each row execute function public.set_updated_at();
create index equipment_category_idx on public.equipment (category_id) where archived_at is null;

create table public.equipment_translations (
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  locale text not null check (locale in ('sr', 'en', 'ru', 'ar')),
  name text not null check (length(trim(name)) between 1 and 120),
  description text check (description is null or length(description) <= 2000),
  usage_instructions text check (usage_instructions is null or length(usage_instructions) <= 4000),
  safety_notes text check (safety_notes is null or length(safety_notes) <= 2000),
  primary key (equipment_id, locale)
);

create table public.equipment_placements (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  -- RESTRICT: an equipment row can never disappear because a map changed.
  equipment_id uuid not null references public.equipment (id) on delete restrict,
  x numeric(7, 2) not null,
  y numeric(7, 2) not null,
  unique (room_id, equipment_id)
);
create index equipment_placements_equipment_idx on public.equipment_placements (equipment_id);

-- ── Maintenance ──────────────────────────────────────────────────────────────
create type public.maintenance_status as enum ('open', 'in_progress', 'resolved', 'rejected');
create type public.maintenance_priority as enum ('low', 'normal', 'high', 'critical');

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid references public.equipment (id) on delete set null,
  room_key text,
  description text not null check (length(trim(description)) between 5 and 2000),
  source text not null check (source in ('member', 'staff')),
  reported_by uuid references public.profiles (id) on delete set null,
  status public.maintenance_status not null default 'open',
  priority public.maintenance_priority not null default 'normal',
  assigned_to uuid references public.profiles (id) on delete set null,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (equipment_id is not null or room_key is not null)
);
create trigger maintenance_requests_updated_at before update on public.maintenance_requests
  for each row execute function public.set_updated_at();
create index maintenance_requests_status_idx on public.maintenance_requests (status, created_at desc);

create table public.equipment_service_log (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  serviced_on date not null,
  note text not null check (length(trim(note)) between 1 and 2000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ── Permissions ──────────────────────────────────────────────────────────────
insert into public.permissions (key, description) values
  ('map.edit', 'Edit the draft facility map'),
  ('map.publish', 'Publish a new map version'),
  ('equipment.manage', 'Create and edit equipment'),
  ('maintenance.manage', 'Triage and resolve maintenance requests');
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r
join public.permissions p on p.key in ('map.edit', 'map.publish', 'equipment.manage', 'maintenance.manage')
where r.key in ('owner', 'manager');
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r
join public.permissions p on p.key in ('equipment.manage', 'maintenance.manage')
where r.key = 'maintenance';
insert into public.role_permissions (role_id, permission_key)
select r.id, 'maintenance.manage' from public.roles r where r.key = 'reception';

insert into public.settings (key, value) values ('map.show_schematic_notice', 'true')
on conflict (key) do nothing;

-- ── RLS: public content = published map + active equipment ──────────────────
alter table public.map_versions enable row level security;
alter table public.floors enable row level security;
alter table public.floor_translations enable row level security;
alter table public.rooms enable row level security;
alter table public.room_translations enable row level security;
alter table public.equipment_categories enable row level security;
alter table public.equipment_category_translations enable row level security;
alter table public.equipment enable row level security;
alter table public.equipment_translations enable row level security;
alter table public.equipment_placements enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.equipment_service_log enable row level security;

revoke all on public.map_versions, public.floors, public.floor_translations, public.rooms,
  public.room_translations, public.equipment_categories, public.equipment_category_translations,
  public.equipment, public.equipment_translations, public.equipment_placements,
  public.maintenance_requests, public.equipment_service_log from anon, authenticated;

create or replace function public.is_published_floor(p_floor_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.floors f join public.map_versions v on v.id = f.map_version_id
                 where f.id = p_floor_id and v.status = 'published');
$$;
create or replace function public.is_public_room(p_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rooms r where r.id = p_room_id and not r.is_hidden
                 and public.is_published_floor(r.floor_id));
$$;
grant execute on function public.is_published_floor(uuid), public.is_public_room(uuid) to anon, authenticated;

grant select on public.map_versions, public.floors, public.floor_translations, public.rooms,
  public.room_translations, public.equipment_categories, public.equipment_category_translations,
  public.equipment_translations, public.equipment_placements to anon, authenticated;
-- Equipment: no serial numbers / asset tags / purchase dates for clients.
grant select (id, category_id, manufacturer, model, status, video_url, archived_at)
  on public.equipment to anon, authenticated;

create policy map_versions_public on public.map_versions for select to anon, authenticated
  using (status = 'published');
create policy floors_public on public.floors for select to anon, authenticated
  using (public.is_published_floor(id));
create policy floor_translations_public on public.floor_translations for select to anon, authenticated
  using (public.is_published_floor(floor_id));
create policy rooms_public on public.rooms for select to anon, authenticated
  using (public.is_public_room(id));
create policy room_translations_public on public.room_translations for select to anon, authenticated
  using (public.is_public_room(room_id));
create policy categories_public on public.equipment_categories for select to anon, authenticated using (true);
create policy category_translations_public on public.equipment_category_translations
  for select to anon, authenticated using (true);
create policy equipment_public on public.equipment for select to anon, authenticated
  using (archived_at is null);
create policy equipment_translations_public on public.equipment_translations for select to anon, authenticated
  using (exists (select 1 from public.equipment e where e.id = equipment_id and e.archived_at is null));
create policy placements_public on public.equipment_placements for select to anon, authenticated
  using (public.is_public_room(room_id));

-- Copies a map version (floors, rooms, translations, equipment placements) into a new version.
-- Used by "publish" (draft → new published) so the published map is an immutable snapshot.
create or replace function public.clone_map_version(p_source uuid, p_status text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_new uuid;
  f record;
  r record;
  v_floor uuid;
  v_room uuid;
begin
  insert into public.map_versions (version, status, is_schematic, note)
  select coalesce(max(version), 0) + 1, p_status, s.is_schematic, s.note
  from public.map_versions, (select is_schematic, note from public.map_versions where id = p_source) s
  group by s.is_schematic, s.note
  returning id into v_new;

  for f in select * from public.floors where map_version_id = p_source loop
    insert into public.floors (map_version_id, key, level, width, height, sort_order)
    values (v_new, f.key, f.level, f.width, f.height, f.sort_order) returning id into v_floor;
    insert into public.floor_translations (floor_id, locale, name)
    select v_floor, locale, name from public.floor_translations where floor_id = f.id;

    for r in select * from public.rooms where floor_id = f.id loop
      insert into public.rooms (floor_id, key, type, zone_id, shape, is_hidden, is_unavailable, unavailable_note)
      values (v_floor, r.key, r.type, r.zone_id, r.shape, r.is_hidden, r.is_unavailable, r.unavailable_note)
      returning id into v_room;
      insert into public.room_translations (room_id, locale, name, description)
      select v_room, locale, name, description from public.room_translations where room_id = r.id;
      insert into public.equipment_placements (room_id, equipment_id, x, y)
      select v_room, equipment_id, x, y from public.equipment_placements where room_id = r.id;
    end loop;
  end loop;
  return v_new;
end;
$$;
revoke execute on function public.clone_map_version(uuid, text) from public, anon, authenticated;
