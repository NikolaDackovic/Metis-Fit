-- GRIT DIGITAL CLUB - 052 F17-2: workout program templates.
-- A trainer writes a program once and assigns it to any number of clients; each client gets an
-- ordinary workout plan (a copy), which the trainer can still adjust for that person. A template
-- can be shared with every trainer of the gym. Days are stored as JSON (the same shape the plan
-- editor uses), validated by the API.

create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null default public.current_club_id() references public.clubs (id) on delete cascade,
  trainer_id uuid references public.trainers (id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 120),
  notes text check (notes is null or length(notes) <= 2000),
  days jsonb not null check (jsonb_typeof(days) = 'array'),
  shared boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger workout_templates_updated_at before update on public.workout_templates
  for each row execute function public.set_updated_at();
create index workout_templates_trainer_idx on public.workout_templates (trainer_id);

alter table public.workout_templates enable row level security;
create policy workout_templates_api on public.workout_templates for all to grit_api using (true) with check (true);
create policy workout_templates_club on public.workout_templates as restrictive for all to grit_api, anon, authenticated
  using (club_id = public.current_club_id()) with check (club_id = public.current_club_id());
