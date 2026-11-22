-- F7c: member food diary (calorie and macro tracking for members who train on their own).
-- Private like workouts: the member reads it through RLS, writes go through the API (member_id
-- comes from the token, IDs are client-generated so the app can add entries offline-first).

create table public.food_log_entries (
  id uuid primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  eaten_on date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null check (length(trim(name)) between 1 and 120),
  kcal integer not null check (kcal between 0 and 5000),
  protein_g numeric(5, 1) check (protein_g is null or protein_g between 0 and 500),
  carbs_g numeric(5, 1) check (carbs_g is null or carbs_g between 0 and 1000),
  fat_g numeric(5, 1) check (fat_g is null or fat_g between 0 and 500),
  created_at timestamptz not null default now()
);
create index food_log_member_day_idx on public.food_log_entries (member_id, eaten_on desc);

alter table public.food_log_entries enable row level security;
revoke all on public.food_log_entries from anon, authenticated;
grant select on public.food_log_entries to authenticated;
create policy food_log_self on public.food_log_entries for select to authenticated
  using (member_id = public.current_member_id());
