-- GRIT DIGITAL CLUB - 030 map background image per floor (Servio-style), and a switch that
-- hides the whole map from members.
-- The admin uploads a floor plan or photo as the floor background, then draws rooms and machines
-- on top of it. Rooms can be drawn filled, as outlines only, or as labels only (the picture
-- already shows the walls).

alter table public.floors
  add column background_path text
    check (background_path is null or background_path ~ '^(map|defaults)/[a-zA-Z0-9_.-]{1,120}$'),
  add column background_opacity numeric(3, 2) not null default 1
    check (background_opacity between 0.1 and 1),
  add column room_style text not null default 'filled'
    check (room_style in ('filled', 'outline', 'labels'));

-- "club.map_visible" lives in settings (club.* keys are public): false hides the map in the app.
insert into public.settings (key, value) values ('club.map_visible', 'true'::jsonb)
on conflict (key) do nothing;

-- The published map is a snapshot of the draft: copy the new columns too.
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
    insert into public.floors (map_version_id, key, level, width, height, sort_order,
                               background_path, background_opacity, room_style)
    values (v_new, f.key, f.level, f.width, f.height, f.sort_order,
            f.background_path, f.background_opacity, f.room_style)
    returning id into v_floor;
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
