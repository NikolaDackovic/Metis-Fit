-- GRIT DIGITAL CLUB - DEV/STAGING seed. NEVER run in production.
-- Plans and opening hours are PROVISIONAL (docs/DECISIONS.md §4, §6): owner will correct them in the admin.
-- Example data for local development and demos; the gym replaces it in the admin.

insert into public.opening_hours (weekday, opens_at, closes_at, is_closed) values
  (1, '07:00', '23:00', false), (2, '07:00', '23:00', false), (3, '07:00', '23:00', false),
  (4, '07:00', '23:00', false), (5, '07:00', '23:00', false),
  (6, '09:00', '21:00', false), (7, '09:00', '17:00', false)
on conflict (club_id, weekday) do nothing;

with plan_rows (sort_order, kind, price_rsd, duration_days, visit_limit, max_pauses, max_pause_days, zones, name_sr, name_en) as (
  values
    (10, 'unlimited',          5500,  30, null, 1, 30, array['gym'],              'Teretana - mesečna',        'Gym - monthly'),
    (20, 'visit_pack',         4500,  30, 12,   0, 0,  array['gym'],              'Teretana - 12 dolazaka',    'Gym - 12 visits'),
    (30, 'unlimited',          15000, 90, null, 2, 30, array['gym'],              'Teretana - 3 meseca',       'Gym - 3 months'),
    (40, 'visit_pack',         800,   1,  1,    0, 0,  array['gym'],              'Dnevni ulaz',               'Day pass'),
    (50, 'class_pack',         7000,  30, null, 1, 30, array['crossfit', 'gym'],  'CrossFit - mesečna',        'CrossFit - monthly'),
    (60, 'class_pack',         8000,  30, null, 1, 30, array['boxing'],           'Boks / kik-boks - mesečna', 'Boxing / kickboxing - monthly'),
    (70, 'personal_training',  24000, 45, 8,    0, 0,  array['gym', 'crossfit'],  'Personalni - 8 termina',    'Personal training - 8 sessions'),
    (80, 'personal_training',  33600, 60, 12,   0, 0,  array['gym', 'crossfit'],  'Personalni - 12 termina',   'Personal training - 12 sessions')
),
inserted as (
  insert into public.membership_plans
    (kind, price_amount, duration_days, visit_limit, max_pauses, max_pause_days, is_available, sort_order)
  select kind::public.plan_kind, price_rsd * 100, duration_days, visit_limit, max_pauses, max_pause_days, true, sort_order
  from plan_rows
  returning id, sort_order
),
tr as (
  insert into public.membership_plan_translations (plan_id, locale, name, description)
  select i.id, l.locale, l.name, null
  from inserted i
  join plan_rows p using (sort_order)
  cross join lateral (values ('sr', p.name_sr), ('en', p.name_en)) as l(locale, name)
  returning plan_id
)
insert into public.membership_plan_zones (plan_id, zone_id)
select i.id, z.id
from inserted i
join plan_rows p using (sort_order)
join public.zones z on z.key = any (p.zones);

-- Example members for local development (no app account).
insert into public.members (first_name, last_name, phone) values
  ('Marko', 'Petrović', '+381641234501'),
  ('Jelena', 'Jovanović', '+381641234502');

-- ── SCHEMATIC map (not an architectural plan!) - from the owner's verbal description ──────────
-- Every room is clearly flagged as schematic in the apps (map_versions.is_schematic = true).
-- Units are approximate "map units". The real layout is drawn later in the admin map editor.
do $$
declare
  v_draft uuid;
  v_floor uuid;
  v_room uuid;
  f record;
  r record;
begin
  insert into public.map_versions (version, status, is_schematic, note)
  values (1, 'draft', false, null) returning id into v_draft;

  for f in select * from (values
    ('ground', 0, 44, 24, 10, 'Prizemlje', 'Ground floor', 'Первый этаж'),
    ('level-1', -1, 44, 24, 20, 'Nivo -1', 'Level -1', 'Уровень -1'),
    ('level-2', -2, 44, 24, 30, 'Nivo -2', 'Level -2', 'Уровень -2')
  ) as t(key, level, width, height, sort_order, sr, en, ru) loop
    insert into public.floors (map_version_id, key, level, width, height, sort_order)
    values (v_draft, f.key, f.level, f.width, f.height, f.sort_order) returning id into v_floor;
    insert into public.floor_translations (floor_id, locale, name)
    values (v_floor, 'sr', f.sr), (v_floor, 'en', f.en), (v_floor, 'ru', f.ru);

    for r in select * from (values
      ('ground', 'entrance', 'entrance', 0, 9, 4, 6, false, 'Ulaz', 'Entrance', 'Вход'),
      ('ground', 'cafe', 'cafe', 4, 4, 14, 16, false, 'Kafić', 'Café', 'Кафе'),
      ('ground', 'garden', 'garden', 32, 2, 12, 20, false, 'Bašta', 'Garden', 'Сад'),
      ('ground', 'reception', 'reception', 18, 4, 7, 7, false, 'Recepcija', 'Reception', 'Ресепшн'),
      ('ground', 'lockers', 'lockers', 25, 4, 7, 7, false, 'Ormarići', 'Lockers', 'Шкафчики'),
      ('ground', 'changing', 'changing_room', 18, 11, 14, 9, false, 'Svlačionice', 'Changing rooms', 'Раздевалки'),
      ('ground', 'stairs-down', 'stairs', 14, 20, 4, 4, false, 'Stepenice', 'Stairs', 'Лестница'),
      ('level-1', 'toilet', 'toilet', 0, 0, 5, 5, false, 'Toalet', 'Toilet', 'Туалет'),
      ('level-1', 'stairs-1', 'stairs', 5, 0, 4, 5, false, 'Stepenice', 'Stairs', 'Лестница'),
      ('level-1', 'boxing', 'boxing', 18, 0, 14, 12, false, 'Boks / kik-boks', 'Boxing / kickboxing', 'Бокс / кикбоксинг'),
      ('level-1', 'gym', 'gym', 0, 7, 18, 17, false, 'Teretana', 'Gym', 'Тренажёрный зал'),
      ('level-1', 'stairs-2', 'stairs', 32, 0, 4, 5, false, 'Stepenice ka CrossFit-u', 'Stairs to CrossFit', 'Лестница к CrossFit'),
      ('level-2', 'crossfit', 'crossfit', 0, 0, 24, 18, false, 'CrossFit', 'CrossFit', 'CrossFit'),
      ('level-2', 'pool', 'pool', 24, 6, 20, 5, true, '„Bazen”', '“Pool”', '«Бассейн»')
    ) as t(floor, key, type, x, y, w, h, hidden, sr, en, ru) where t.floor = f.key loop
      insert into public.rooms (floor_id, key, type, shape, is_hidden, is_unavailable, unavailable_note)
      values (v_floor, r.key, r.type::public.room_type,
              jsonb_build_object('type', 'rect', 'x', r.x, 'y', r.y, 'w', r.w, 'h', r.h),
              r.hidden, r.hidden, case when r.hidden then 'U izgradnji' end)
      returning id into v_room;
      insert into public.room_translations (room_id, locale, name)
      values (v_room, 'sr', r.sr), (v_room, 'en', r.en), (v_room, 'ru', r.ru);
    end loop;
  end loop;
end $$;

-- Example equipment for local development (the gym adds its real inventory in the admin).
do $$
declare
  d record;
  v_eq uuid;
begin
  for d in select * from (values
    ('cardio', 'Traka za trčanje', 'Treadmill', 'Беговая дорожка', 'gym', 3, 10),
    ('strength_machines', 'Leg press', 'Leg press', 'Жим ногами', 'gym', 10, 18),
    ('boxing', 'Džak za boks', 'Heavy bag', 'Боксёрский мешок', 'boxing', 24, 5),
    ('crossfit', 'CrossFit rig', 'CrossFit rig', 'CrossFit-рама', 'crossfit', 10, 8)
  ) as t(category, sr, en, ru, room, x, y) loop
    insert into public.equipment (category_id, status)
    select id, 'available' from public.equipment_categories where key = d.category
    returning id into v_eq;
    insert into public.equipment_translations (equipment_id, locale, name, description, usage_instructions)
    values
      (v_eq, 'sr', d.sr, 'Ispravna i slobodna za korišćenje.', 'Pre početka podesi sedište i težinu; ako nisi siguran/na, pitaj trenera.'),
      (v_eq, 'en', d.en, 'Working and free to use.', 'Adjust the seat and weight before you start; if unsure, ask a trainer.'),
      (v_eq, 'ru', d.ru, 'Исправен и доступен.', 'Перед началом настройте сиденье и вес; если не уверены, спросите тренера.');
    insert into public.equipment_placements (room_id, equipment_id, x, y)
    select r.id, v_eq, d.x, d.y
    from public.rooms r
    join public.floors f on f.id = r.floor_id
    join public.map_versions v on v.id = f.map_version_id and v.status = 'draft'
    where r.key = d.room;
  end loop;
end $$;

select public.clone_map_version((select id from public.map_versions where status = 'draft'), 'published');
update public.map_versions set published_at = now() where status = 'published';

-- ── Group classes ────────────────────────────────────────────────────────────
-- Class types the club offers (CrossFit, boxing, kickboxing). Durations, capacities and the
-- weekly timetable below are [PROVIZORNO] until the owner enters the real schedule in the admin.
do $$
declare
  d record;
  v_id uuid;
begin
  for d in select * from (values
    ('crossfit', 'crossfit', '#E54E26', 60, 14, 10, 'CrossFit', 'CrossFit', 'Кроссфит',
       'Funkcionalni trening visokog intenziteta u grupi.',
       'High-intensity functional training in a group.',
       'Функциональная тренировка высокой интенсивности в группе.'),
    ('boxing', 'boxing', '#F5A524', 60, 12, 20, 'Boks', 'Boxing', 'Бокс',
       'Tehnika, rad na džaku i kondicija.',
       'Technique, bag work and conditioning.',
       'Техника, работа на мешке и физподготовка.'),
    ('kickboxing', 'boxing', '#3B82F6', 60, 12, 30, 'Kik-boks', 'Kickboxing', 'Кикбоксинг',
       'Udarci rukama i nogama, kombinacije i kondicija.',
       'Punches, kicks, combinations and conditioning.',
       'Удары руками и ногами, комбинации и физподготовка.')
  ) as t(key, zone, color, dur, cap, sort, sr, en, ru, dsr, den, dru) loop
    insert into public.class_types (key, zone_id, color, default_duration_min, default_capacity, sort_order)
    select d.key, z.id, d.color, d.dur, d.cap, d.sort from public.zones z where z.key = d.zone
    returning id into v_id;
    insert into public.class_type_translations (class_type_id, locale, name, description)
    values (v_id, 'sr', d.sr, d.dsr), (v_id, 'en', d.en, d.den), (v_id, 'ru', d.ru, d.dru);
  end loop;
end $$;

-- Trainers. Bojan Mačinković ("Personal & CrossFit Coach") is known from the club's public promo
-- material; the other trainers have example names and bios the owner corrects in the admin.
-- Photos are uploaded in the admin (Treneri → trainer → Dodaj fotografiju).
do $$
declare
  d record;
  v_id uuid;
begin
  for d in select * from (values
    (10, 'Bojan', 'Mačinković', true,
     'Personal & CrossFit Coach', 'Personal & CrossFit Coach', 'Персональный тренер и тренер по CrossFit',
     'Vodi CrossFit grupe i personalne treninge. Fokus na pravilnoj tehnici dizanja, snazi i kondiciji, uz plan prilagođen nivou svakog člana - od prvog treninga do takmičarske pripreme.',
     'Coaches CrossFit classes and personal training. Focus on sound lifting technique, strength and conditioning, with a plan adapted to each member''s level - from the first session to competition prep.',
     'Ведёт группы CrossFit и персональные тренировки. Делает упор на правильную технику, силу и выносливость, подбирая план под уровень каждого - от первой тренировки до подготовки к соревнованиям.'),
    (20, 'Stefan', 'Nikolić', true,
     'Trener boksa', 'Boxing coach', 'Тренер по боксу',
     'Bivši takmičar u boksu. Tehnika, rad na džaku i sparing za početnike i napredne, uz naglasak na kondiciji.',
     'Former competitive boxer. Technique, bag work and sparring for beginners and advanced, with a focus on conditioning.',
     'Бывший боксёр-спортсмен. Техника, работа на мешке и спарринги для новичков и продвинутых.'),
    (30, 'Luka', 'Marković', true,
     'Trener kik-boksa', 'Kickboxing coach', 'Тренер по кикбоксингу',
     'Kombinacije ruku i nogu, kondicija i samoodbrana. Treninzi prilagođeni svakom nivou, od prvog dolaska.',
     'Punch and kick combinations, conditioning and self-defence. Sessions adapted to every level from day one.',
     'Комбинации рук и ног, физподготовка и самооборона для любого уровня.'),
    (40, 'Ivana', 'Petrović', true,
     'Personalni trener', 'Personal trainer', 'Персональный тренер',
     'Planovi za snagu, oblikovanje tela i mršavljenje u teretani, sa praćenjem napretka kroz aplikaciju.',
     'Strength, body shaping and fat-loss plans in the gym, with progress tracked in the app.',
     'Программы на силу, форму тела и снижение веса с отслеживанием прогресса в приложении.')
  ) as t(sort, first_name, last_name, is_public, tsr, ten, tru, bsr, ben, bru) loop
    insert into public.trainers (first_name, last_name, is_public, sort_order)
    values (d.first_name, d.last_name, d.is_public, d.sort) returning id into v_id;
    insert into public.trainer_translations (trainer_id, locale, title, bio)
    values (v_id, 'sr', d.tsr, d.bsr), (v_id, 'en', d.ten, d.ben), (v_id, 'ru', d.tru, d.bru);
  end loop;
end $$;

-- [PROVIZORNO] weekly timetable: CrossFit Mon/Wed/Fri 08:00 and 19:00, boxing Tue/Thu 19:00,
-- kickboxing Tue/Thu 20:15, Saturday CrossFit 10:00.
insert into public.class_series (class_type_id, trainer_id, weekday, start_time, duration_min, capacity, room_key, valid_from)
select ct.id, tr.id, s.weekday, s.start_time::time, ct.default_duration_min, ct.default_capacity, s.room, public.club_today()
from (values
  ('crossfit', 'Mačinković', 1, '08:00', 'crossfit'), ('crossfit', 'Mačinković', 1, '19:00', 'crossfit'),
  ('crossfit', 'Mačinković', 3, '08:00', 'crossfit'), ('crossfit', 'Mačinković', 3, '19:00', 'crossfit'),
  ('crossfit', 'Mačinković', 5, '08:00', 'crossfit'), ('crossfit', 'Mačinković', 5, '19:00', 'crossfit'),
  ('crossfit', 'Mačinković', 6, '10:00', 'crossfit'),
  ('boxing', 'Nikolić', 2, '19:00', 'boxing'), ('boxing', 'Nikolić', 4, '19:00', 'boxing'),
  ('kickboxing', 'Marković', 2, '20:15', 'boxing'), ('kickboxing', 'Marković', 4, '20:15', 'boxing')
) as s(type_key, trainer, weekday, start_time, room)
join public.class_types ct on ct.key = s.type_key
join public.trainers tr on tr.last_name = s.trainer;

select public.generate_class_sessions(public.club_today() + 28);

-- [PROVIZORNO] lockers: 40 in the men's and 30 in the women's changing room until the real count is known.
insert into public.lockers (changing_room_id, number)
select r.id, n from public.changing_rooms r
cross join lateral generate_series(1, case r.key when 'men' then 40 else 30 end) as n;
