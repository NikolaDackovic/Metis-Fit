-- Member self-tracking beyond the gym: activities done elsewhere (running, cycling, …) and a
-- daily check-in of habits (water, sleep, steps, mood, energy). Private like workouts: the
-- member reads them through RLS, writes go through the API (member_id from the token).

create table public.activities (
  id uuid primary key, -- client generated (offline-friendly, idempotent)
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in ('running', 'walking', 'cycling', 'swimming', 'hiking', 'yoga', 'team_sport', 'martial_arts', 'other')),
  done_on date not null,
  duration_min integer not null check (duration_min between 1 and 1440),
  distance_km numeric(6, 2) check (distance_km is null or distance_km between 0 and 1000),
  intensity text not null default 'moderate' check (intensity in ('light', 'moderate', 'hard')),
  kcal integer check (kcal is null or kcal between 0 and 10000), -- estimate (MET × weight × time)
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now()
);
create index activities_member_idx on public.activities (member_id, done_on desc);

create table public.daily_checkins (
  member_id uuid not null references public.members (id) on delete cascade,
  day date not null,
  water_ml integer check (water_ml is null or water_ml between 0 and 10000),
  sleep_h numeric(3, 1) check (sleep_h is null or sleep_h between 0 and 24),
  steps integer check (steps is null or steps between 0 and 100000),
  mood smallint check (mood is null or mood between 1 and 5),
  energy smallint check (energy is null or energy between 1 and 5),
  note text check (note is null or length(note) <= 300),
  updated_at timestamptz not null default now(),
  primary key (member_id, day)
);
create trigger daily_checkins_updated_at before update on public.daily_checkins
  for each row execute function public.set_updated_at();

alter table public.activities enable row level security;
alter table public.daily_checkins enable row level security;
revoke all on public.activities, public.daily_checkins from anon, authenticated;
grant select on public.activities, public.daily_checkins to authenticated;
create policy activities_self on public.activities for select to authenticated
  using (member_id = public.current_member_id());
create policy daily_checkins_self on public.daily_checkins for select to authenticated
  using (member_id = public.current_member_id());

insert into public.settings (key, value) values
  ('habits.water_goal_ml', '2500'),
  ('habits.sleep_goal_h', '8'),
  ('habits.steps_goal', '8000')
on conflict (key) do nothing;
