-- GRIT DIGITAL CLUB — 012 exercise library, workout log (offline sync), progress, trainer clients.
-- Privacy (BUSINESS_RULES §10): workouts, measurements and goals are private by default. A trainer sees
-- a member's progress only while trainer_clients.status = 'active' AND the member's latest
-- 'progress_share_trainer' consent is granted. Consent can be withdrawn at any time.

-- ── Muscle groups (reference data) ───────────────────────────────────────────
create table public.muscle_groups (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z_]{2,40}$'),
  sort_order integer not null default 0
);
create table public.muscle_group_translations (
  muscle_group_id uuid not null references public.muscle_groups (id) on delete cascade,
  locale text not null check (locale in ('sr', 'en', 'ru', 'ar')),
  name text not null,
  primary key (muscle_group_id, locale)
);

-- ── Exercises ────────────────────────────────────────────────────────────────
create type public.exercise_tracking as enum ('weight_reps', 'reps', 'time', 'distance_time');
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]{2,60}$'),
  category text not null check (category in ('strength', 'crossfit', 'cardio', 'boxing', 'mobility')),
  tracking public.exercise_tracking not null default 'weight_reps',
  equipment_category_id uuid references public.equipment_categories (id) on delete set null,
  video_url text check (video_url is null or video_url ~ '^https://'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger exercises_updated_at before update on public.exercises
  for each row execute function public.set_updated_at();
create table public.exercise_translations (
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  locale text not null check (locale in ('sr', 'en', 'ru', 'ar')),
  name text not null check (length(trim(name)) between 1 and 80),
  instructions text check (instructions is null or length(instructions) <= 3000),
  primary key (exercise_id, locale)
);
create table public.exercise_muscle_groups (
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  muscle_group_id uuid not null references public.muscle_groups (id) on delete restrict,
  is_primary boolean not null default true,
  primary key (exercise_id, muscle_group_id)
);
-- Which machines in the club an exercise is done on (equipment ↔ exercise, F5 link).
create table public.equipment_exercises (
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  primary key (equipment_id, exercise_id)
);

-- ── Workout log ──────────────────────────────────────────────────────────────
-- IDs are generated on the device, so an offline workout synced twice is stored once (idempotent).
create table public.workout_sessions (
  id uuid primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  note text check (note is null or length(note) <= 1000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create trigger workout_sessions_updated_at before update on public.workout_sessions
  for each row execute function public.set_updated_at();
create index workout_sessions_member_idx on public.workout_sessions (member_id, started_at desc);

create table public.workout_sets (
  id uuid primary key,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  set_index smallint not null check (set_index between 0 and 500),
  reps smallint check (reps is null or reps between 0 and 1000),
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg between 0 and 1000),
  duration_s integer check (duration_s is null or duration_s between 0 and 86400),
  distance_m integer check (distance_m is null or distance_m between 0 and 1000000),
  rpe numeric(3, 1) check (rpe is null or rpe between 1 and 10),
  completed_at timestamptz not null
);
create index workout_sets_session_idx on public.workout_sets (session_id, set_index);
create index workout_sets_exercise_idx on public.workout_sets (exercise_id);

-- ── Measurements and goals ───────────────────────────────────────────────────
create table public.body_measurements (
  id uuid primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5, 2) check (weight_kg is null or weight_kg between 20 and 400),
  body_fat_pct numeric(4, 1) check (body_fat_pct is null or body_fat_pct between 2 and 75),
  waist_cm numeric(5, 1) check (waist_cm is null or waist_cm between 30 and 250),
  chest_cm numeric(5, 1) check (chest_cm is null or chest_cm between 30 and 250),
  hips_cm numeric(5, 1) check (hips_cm is null or hips_cm between 30 and 250),
  arm_cm numeric(5, 1) check (arm_cm is null or arm_cm between 10 and 100),
  thigh_cm numeric(5, 1) check (thigh_cm is null or thigh_cm between 20 and 150),
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now()
);
create index body_measurements_member_idx on public.body_measurements (member_id, measured_on desc);

create table public.member_goals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in ('body_weight', 'exercise_weight', 'workouts_per_week', 'custom')),
  title text check (title is null or length(title) <= 120),
  exercise_id uuid references public.exercises (id) on delete set null,
  start_value numeric(7, 2),
  target_value numeric(7, 2),
  target_date date,
  status text not null default 'active' check (status in ('active', 'achieved', 'abandoned')),
  achieved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'exercise_weight' or exercise_id is not null),
  check (kind = 'custom' or target_value is not null),
  check (kind <> 'custom' or title is not null)
);
create trigger member_goals_updated_at before update on public.member_goals
  for each row execute function public.set_updated_at();
create index member_goals_member_idx on public.member_goals (member_id, status);

-- ── Trainer ↔ client ─────────────────────────────────────────────────────────
create table public.trainer_clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  check ((status = 'ended') = (ended_at is not null))
);
create unique index trainer_clients_one_active on public.trainer_clients (trainer_id, member_id)
  where status = 'active';

-- Latest consent wins (member_consents is an append-only history).
create or replace function public.has_consent(p_member uuid, p_type public.consent_type)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select c.granted from public.member_consents c
                   where c.member_id = p_member and c.type = p_type
                   order by c.recorded_at desc limit 1), false);
$$;

-- A staff user may see a member's progress only as that member's active trainer, with consent.
create or replace function public.trainer_can_view_progress(p_user uuid, p_member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_consent(p_member, 'progress_share_trainer')
     and exists (select 1 from public.trainer_clients tc
                 join public.trainers t on t.id = tc.trainer_id
                 where t.user_id = p_user and t.archived_at is null
                   and tc.member_id = p_member and tc.status = 'active');
$$;
revoke execute on function public.has_consent(uuid, public.consent_type),
  public.trainer_can_view_progress(uuid, uuid) from public, anon, authenticated;

insert into public.permissions (key, description) values
  ('exercises.manage', 'Edit the exercise library'),
  ('progress.view_clients', 'View progress of own clients who consented (trainers)');
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r
join public.permissions p on p.key in ('exercises.manage', 'progress.view_clients')
where r.key in ('owner', 'manager', 'trainer');

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.muscle_groups enable row level security;
alter table public.muscle_group_translations enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_translations enable row level security;
alter table public.exercise_muscle_groups enable row level security;
alter table public.equipment_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;
alter table public.body_measurements enable row level security;
alter table public.member_goals enable row level security;
alter table public.trainer_clients enable row level security;
revoke all on public.muscle_groups, public.muscle_group_translations, public.exercises,
  public.exercise_translations, public.exercise_muscle_groups, public.equipment_exercises,
  public.workout_sessions, public.workout_sets, public.body_measurements, public.member_goals,
  public.trainer_clients from anon, authenticated;

-- Public library.
grant select on public.muscle_groups, public.muscle_group_translations, public.exercises,
  public.exercise_translations, public.exercise_muscle_groups, public.equipment_exercises
  to anon, authenticated;
create policy muscle_groups_public on public.muscle_groups for select to anon, authenticated using (true);
create policy muscle_group_translations_public on public.muscle_group_translations
  for select to anon, authenticated using (true);
create policy exercises_public on public.exercises for select to anon, authenticated using (is_active);
create policy exercise_translations_public on public.exercise_translations
  for select to anon, authenticated using (true);
create policy exercise_muscles_public on public.exercise_muscle_groups
  for select to anon, authenticated using (true);
create policy equipment_exercises_public on public.equipment_exercises
  for select to anon, authenticated using (true);

-- Own private data (read via RLS; writes go through the API which derives member_id from the token).
grant select on public.workout_sessions, public.workout_sets, public.body_measurements,
  public.member_goals to authenticated;
create policy workout_sessions_self on public.workout_sessions for select to authenticated
  using (member_id = public.current_member_id());
create policy workout_sets_self on public.workout_sets for select to authenticated
  using (exists (select 1 from public.workout_sessions s
                 where s.id = session_id and s.member_id = public.current_member_id()));
create policy body_measurements_self on public.body_measurements for select to authenticated
  using (member_id = public.current_member_id());
create policy member_goals_self on public.member_goals for select to authenticated
  using (member_id = public.current_member_id());
-- trainer_clients: staff only (through the API).

-- ── Starter library (reference content; the club edits it in the admin) ─────
insert into public.muscle_groups (key, sort_order) values
  ('chest', 10), ('back', 20), ('shoulders', 30), ('biceps', 40), ('triceps', 50), ('forearms', 60),
  ('core', 70), ('glutes', 80), ('quads', 90), ('hamstrings', 100), ('calves', 110),
  ('full_body', 120), ('cardio', 130);
insert into public.muscle_group_translations (muscle_group_id, locale, name)
select g.id, t.locale, t.name from public.muscle_groups g
join (values
  ('chest', 'sr', 'Grudi'), ('chest', 'en', 'Chest'), ('chest', 'ru', 'Грудь'),
  ('back', 'sr', 'Leđa'), ('back', 'en', 'Back'), ('back', 'ru', 'Спина'),
  ('shoulders', 'sr', 'Ramena'), ('shoulders', 'en', 'Shoulders'), ('shoulders', 'ru', 'Плечи'),
  ('biceps', 'sr', 'Biceps'), ('biceps', 'en', 'Biceps'), ('biceps', 'ru', 'Бицепс'),
  ('triceps', 'sr', 'Triceps'), ('triceps', 'en', 'Triceps'), ('triceps', 'ru', 'Трицепс'),
  ('forearms', 'sr', 'Podlaktice'), ('forearms', 'en', 'Forearms'), ('forearms', 'ru', 'Предплечья'),
  ('core', 'sr', 'Trup (core)'), ('core', 'en', 'Core'), ('core', 'ru', 'Кор'),
  ('glutes', 'sr', 'Gluteus'), ('glutes', 'en', 'Glutes'), ('glutes', 'ru', 'Ягодицы'),
  ('quads', 'sr', 'Prednja loža'), ('quads', 'en', 'Quads'), ('quads', 'ru', 'Квадрицепсы'),
  ('hamstrings', 'sr', 'Zadnja loža'), ('hamstrings', 'en', 'Hamstrings'), ('hamstrings', 'ru', 'Бицепс бедра'),
  ('calves', 'sr', 'Listovi'), ('calves', 'en', 'Calves'), ('calves', 'ru', 'Икры'),
  ('full_body', 'sr', 'Celo telo'), ('full_body', 'en', 'Full body'), ('full_body', 'ru', 'Всё тело'),
  ('cardio', 'sr', 'Kardio'), ('cardio', 'en', 'Cardio'), ('cardio', 'ru', 'Кардио')
) as t(key, locale, name) on t.key = g.key;

do $$
declare
  d record;
  v_id uuid;
  m text;
  i integer;
begin
  for d in select * from (values
    ('back_squat', 'strength', 'weight_reps', 'racks_benches', array['quads','glutes','core'],
      'Čučanj sa šipkom', 'Back squat', 'Приседания со штангой',
      'Šipka na gornjem delu leđa, stopala u širini ramena. Spusti se dok kukovi ne budu ispod kolena, leđa prava, pa se odgurni kroz cela stopala.',
      'Bar on the upper back, feet shoulder-width. Sit down until the hips are below the knees, keep the back neutral, drive up through the whole foot.',
      'Штанга на верхней части спины, стопы на ширине плеч. Опуститесь, пока таз не окажется ниже колен, спина ровная, вставайте через всю стопу.'),
    ('front_squat', 'strength', 'weight_reps', 'racks_benches', array['quads','core','glutes'],
      'Prednji čučanj', 'Front squat', 'Фронтальные приседания',
      'Šipka na prednjem delu ramena, laktovi visoko. Trup ostaje uspravan tokom celog pokreta.',
      'Bar on the front of the shoulders, elbows high. Keep the torso upright throughout.',
      'Штанга на передней части плеч, локти высоко. Корпус остаётся вертикальным.'),
    ('deadlift', 'strength', 'weight_reps', 'free_weights', array['hamstrings','glutes','back'],
      'Mrtvo dizanje', 'Deadlift', 'Становая тяга',
      'Šipka iznad sredine stopala, leđa prava. Podigni šipku guranjem poda nogama, šipka ostaje uz telo.',
      'Bar over mid-foot, flat back. Push the floor away, keep the bar close to the body.',
      'Штанга над серединой стопы, спина прямая. Отталкивайтесь ногами от пола, штанга идёт вдоль тела.'),
    ('romanian_deadlift', 'strength', 'weight_reps', 'free_weights', array['hamstrings','glutes'],
      'Rumunsko mrtvo dizanje', 'Romanian deadlift', 'Румынская тяга',
      'Blago savijena kolena, kukovi idu unazad dok ne osetiš istezanje zadnje lože.',
      'Soft knees, push the hips back until you feel the hamstrings stretch.',
      'Колени слегка согнуты, отводите таз назад до растяжения задней поверхности бедра.'),
    ('bench_press', 'strength', 'weight_reps', 'racks_benches', array['chest','triceps','shoulders'],
      'Bench pres', 'Bench press', 'Жим лёжа',
      'Lopatice skupljene, stopala na podu. Spusti šipku do sredine grudi i potisni je nazad.',
      'Shoulder blades retracted, feet on the floor. Lower the bar to mid-chest and press it back up.',
      'Лопатки сведены, стопы на полу. Опустите штангу к середине груди и выжмите вверх.'),
    ('incline_dumbbell_press', 'strength', 'weight_reps', 'free_weights', array['chest','shoulders','triceps'],
      'Kosi potisak bučicama', 'Incline dumbbell press', 'Жим гантелей на наклонной',
      'Klupa na 30–45°. Bučice spuštaj kontrolisano do visine grudi.',
      'Bench at 30–45°. Lower the dumbbells under control to chest level.',
      'Скамья под 30–45°. Опускайте гантели подконтрольно до уровня груди.'),
    ('overhead_press', 'strength', 'weight_reps', 'free_weights', array['shoulders','triceps','core'],
      'Potisak iznad glave', 'Overhead press', 'Жим стоя',
      'Stegni stomak i gluteus, potisni šipku pravo iznad glave bez zabacivanja leđa.',
      'Brace the core and glutes, press the bar straight overhead without arching.',
      'Напрягите пресс и ягодицы, выжимайте штангу вверх без прогиба в пояснице.'),
    ('pull_up', 'strength', 'reps', 'racks_benches', array['back','biceps'],
      'Zgib', 'Pull-up', 'Подтягивания',
      'Iz punog visa povuci se dok brada ne pređe šipku, spuštaj se kontrolisano.',
      'From a dead hang, pull until the chin clears the bar, lower under control.',
      'Из виса подтянитесь, пока подбородок не окажется над перекладиной, опускайтесь подконтрольно.'),
    ('barbell_row', 'strength', 'weight_reps', 'free_weights', array['back','biceps'],
      'Veslanje šipkom', 'Barbell row', 'Тяга штанги в наклоне',
      'Trup nagnut, leđa prava. Povuci šipku ka stomaku skupljajući lopatice.',
      'Hinge forward with a flat back, pull the bar to the stomach squeezing the shoulder blades.',
      'Наклон вперёд, спина прямая. Тяните штангу к животу, сводя лопатки.'),
    ('lat_pulldown', 'strength', 'weight_reps', 'strength_machines', array['back','biceps'],
      'Lat mašina', 'Lat pulldown', 'Тяга верхнего блока',
      'Povuci šipku do gornjeg dela grudi, laktovi ka dole i unazad.',
      'Pull the bar to the upper chest, elbows down and back.',
      'Тяните рукоять к верхней части груди, локти вниз и назад.'),
    ('seated_cable_row', 'strength', 'weight_reps', 'strength_machines', array['back','biceps'],
      'Veslanje na sajli', 'Seated cable row', 'Тяга нижнего блока',
      'Uspravan trup, povuci ručku ka stomaku i zadrži lopatice skupljene sekund.',
      'Tall torso, pull the handle to the stomach and hold the squeeze for a second.',
      'Корпус ровный, тяните рукоять к животу и задержитесь на секунду.'),
    ('leg_press', 'strength', 'weight_reps', 'strength_machines', array['quads','glutes'],
      'Nožna presa', 'Leg press', 'Жим ногами',
      'Leđa na naslonu, spuštaj platformu dok kolena ne budu pod 90°, ne zaključavaj kolena gore.',
      'Back on the pad, lower until the knees reach 90°, do not lock the knees at the top.',
      'Спина прижата, опускайте платформу до 90° в коленях, не выпрямляйте колени до замка.'),
    ('walking_lunge', 'strength', 'weight_reps', 'free_weights', array['quads','glutes'],
      'Iskoraci', 'Walking lunge', 'Выпады в ходьбе',
      'Dugačak korak napred, zadnje koleno skoro do poda, trup uspravan.',
      'Long step forward, back knee almost to the floor, torso upright.',
      'Широкий шаг вперёд, заднее колено почти касается пола, корпус ровный.'),
    ('hip_thrust', 'strength', 'weight_reps', 'racks_benches', array['glutes','hamstrings'],
      'Hip thrust', 'Hip thrust', 'Ягодичный мост со штангой',
      'Gornji deo leđa na klupi, podigni kukove dok telo ne bude ravno, stegni gluteus na vrhu.',
      'Upper back on the bench, drive the hips up to a straight line, squeeze the glutes at the top.',
      'Верх спины на скамье, поднимите таз до прямой линии, сожмите ягодицы вверху.'),
    ('leg_curl', 'strength', 'weight_reps', 'strength_machines', array['hamstrings'],
      'Pregib nogu', 'Leg curl', 'Сгибание ног',
      'Savij noge do kraja i spuštaj ih polako.', 'Curl fully and lower slowly.', 'Согните ноги полностью и медленно опустите.'),
    ('leg_extension', 'strength', 'weight_reps', 'strength_machines', array['quads'],
      'Opružanje nogu', 'Leg extension', 'Разгибание ног',
      'Opruži noge do kraja, kratka pauza, kontrolisan povratak.', 'Extend fully, short pause, controlled return.', 'Разогните ноги полностью, пауза, подконтрольное возвращение.'),
    ('calf_raise', 'strength', 'weight_reps', 'strength_machines', array['calves'],
      'Podizanje na prste', 'Calf raise', 'Подъёмы на носки',
      'Puna amplituda: duboko istezanje dole, pauza gore.', 'Full range: deep stretch at the bottom, pause at the top.', 'Полная амплитуда: растяжение внизу, пауза вверху.'),
    ('biceps_curl', 'strength', 'weight_reps', 'free_weights', array['biceps','forearms'],
      'Pregib za biceps', 'Biceps curl', 'Сгибание на бицепс',
      'Laktovi uz telo, bez zamaha.', 'Elbows by the sides, no swinging.', 'Локти прижаты, без раскачки.'),
    ('triceps_pushdown', 'strength', 'weight_reps', 'strength_machines', array['triceps'],
      'Opružanje na sajli', 'Triceps pushdown', 'Разгибание на блоке',
      'Laktovi mirni uz telo, opruži ruke do kraja.', 'Elbows fixed at the sides, extend fully.', 'Локти неподвижны, разгибайте руки полностью.'),
    ('dip', 'strength', 'reps', 'racks_benches', array['triceps','chest'],
      'Propadanja', 'Dip', 'Отжимания на брусьях',
      'Spusti se dok ramena ne budu u visini laktova, pa se potisni gore.', 'Lower until the shoulders are level with the elbows, then press up.', 'Опуститесь до уровня плеч с локтями и выжмите себя вверх.'),
    ('push_up', 'strength', 'reps', null, array['chest','triceps','core'],
      'Sklekovi', 'Push-up', 'Отжимания',
      'Telo u pravoj liniji, grudi skoro do poda.', 'Body in a straight line, chest almost to the floor.', 'Тело прямое, грудь почти касается пола.'),
    ('plank', 'mobility', 'time', null, array['core'],
      'Plank', 'Plank', 'Планка',
      'Oslonac na podlakticama, kukovi u liniji sa ramenima, stegnut stomak.', 'On the forearms, hips in line with the shoulders, braced core.', 'Упор на предплечьях, таз на одной линии с плечами, пресс напряжён.'),
    ('kettlebell_swing', 'crossfit', 'weight_reps', 'crossfit', array['glutes','hamstrings','core'],
      'Zamah girjom', 'Kettlebell swing', 'Махи гирей',
      'Pokret iz kukova, ne iz ruku. Girja leti do visine grudi.', 'Hinge from the hips, not the arms. The bell floats to chest height.', 'Движение от таза, а не руками. Гиря поднимается до груди.'),
    ('thruster', 'crossfit', 'weight_reps', 'crossfit', array['full_body','quads','shoulders'],
      'Thruster', 'Thruster', 'Трастер',
      'Prednji čučanj koji prelazi u potisak iznad glave jednim pokretom.', 'A front squat flowing into an overhead press in one motion.', 'Фронтальный присед, переходящий в жим над головой одним движением.'),
    ('wall_ball', 'crossfit', 'reps', 'crossfit', array['full_body','quads','shoulders'],
      'Wall ball', 'Wall ball', 'Броски мяча в стену',
      'Čučanj sa loptom i izbačaj do mete na zidu, uhvati loptu i odmah ponovi.', 'Squat with the ball and throw it to the target, catch and go straight into the next rep.', 'Присед с мячом и бросок в цель на стене, поймайте и сразу повторите.'),
    ('burpee', 'crossfit', 'reps', null, array['full_body','cardio'],
      'Burpi', 'Burpee', 'Бёрпи',
      'Grudi do poda, ustani i skoči sa pljeskom iznad glave.', 'Chest to the floor, stand up and jump with a clap overhead.', 'Грудь к полу, встаньте и прыгните с хлопком над головой.'),
    ('box_jump', 'crossfit', 'reps', 'crossfit', array['quads','glutes','calves'],
      'Skok na kutiju', 'Box jump', 'Запрыгивания на тумбу',
      'Mekano doskoči na celo stopalo i potpuno se uspravi gore.', 'Land softly on the whole foot and stand tall on top.', 'Мягко приземлитесь на всю стопу и полностью выпрямитесь.'),
    ('power_clean', 'crossfit', 'weight_reps', 'free_weights', array['full_body','back','quads'],
      'Nabačaj (power clean)', 'Power clean', 'Взятие на грудь',
      'Eksplozivno opruži kukove i kolena, podvuci se pod šipku i uhvati je na ramenima.', 'Explosively extend hips and knees, pull under and catch the bar on the shoulders.', 'Взрывное разгибание таза и коленей, подсед и приём штанги на плечи.'),
    ('rowing', 'cardio', 'distance_time', 'cardio', array['cardio','back','full_body'],
      'Veslanje (ergometar)', 'Rowing (erg)', 'Гребля (тренажёр)',
      'Redosled: noge, trup, ruke — pa obrnuto pri povratku.', 'Sequence: legs, body, arms — and the reverse on the recovery.', 'Порядок: ноги, корпус, руки — и обратно при возврате.'),
    ('treadmill_run', 'cardio', 'distance_time', 'cardio', array['cardio'],
      'Trčanje na traci', 'Treadmill run', 'Бег на дорожке',
      'Počni zagrevanjem od 5 minuta laganim tempom.', 'Start with a 5-minute easy warm-up.', 'Начните с 5-минутной лёгкой разминки.'),
    ('assault_bike', 'cardio', 'time', 'cardio', array['cardio','full_body'],
      'Air bike', 'Air bike', 'Аэробайк',
      'Guraj i vuci rukama dok okrećeš pedale; intervali su najefikasniji.', 'Push and pull with the arms while pedalling; intervals work best.', 'Работайте руками и ногами одновременно; лучше всего интервалы.'),
    ('jump_rope', 'cardio', 'time', 'functional', array['cardio','calves'],
      'Preskakanje vijače', 'Jump rope', 'Скакалка',
      'Mali, brzi skokovi sa prednjeg dela stopala, rotacija iz ručnih zglobova.', 'Small, quick hops on the balls of the feet, turn the rope from the wrists.', 'Маленькие быстрые прыжки на носках, вращение кистями.'),
    ('heavy_bag_rounds', 'boxing', 'time', 'boxing', array['full_body','shoulders','cardio'],
      'Rad na džaku', 'Heavy bag rounds', 'Работа на мешке',
      'Rundi po 3 minuta: kombinacije, kretanje oko džaka i gard uvek gore.', '3-minute rounds: combinations, move around the bag, guard always up.', 'Раунды по 3 минуты: комбинации, движение вокруг мешка, защита всегда поднята.'),
    ('shadow_boxing', 'boxing', 'time', null, array['full_body','cardio'],
      'Senka (shadow boxing)', 'Shadow boxing', 'Бой с тенью',
      'Tehnika bez partnera: udarci, odbrana i rad nogu ispred ogledala.', 'Technique without a partner: punches, defence and footwork in front of a mirror.', 'Техника без партнёра: удары, защита и работа ног перед зеркалом.')
  ) as t(key, category, tracking, eq, muscles, sr, en, ru, isr, ien, iru) loop
    insert into public.exercises (key, category, tracking, equipment_category_id)
    values (d.key, d.category, d.tracking::public.exercise_tracking,
            (select id from public.equipment_categories where key = d.eq))
    returning id into v_id;
    insert into public.exercise_translations (exercise_id, locale, name, instructions)
    values (v_id, 'sr', d.sr, d.isr), (v_id, 'en', d.en, d.ien), (v_id, 'ru', d.ru, d.iru);
    i := 0;
    foreach m in array d.muscles loop
      insert into public.exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
      select v_id, g.id, i = 0 from public.muscle_groups g where g.key = m;
      i := i + 1;
    end loop;
  end loop;
end $$;
