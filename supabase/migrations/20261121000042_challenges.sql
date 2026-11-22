-- GRIT DIGITAL CLUB - 042 F13-4: challenges ("12 visits this month").
-- A challenge counts one thing (gym visit days, attended group classes or logged workouts) over a
-- repeating period (this week / this month). Reaching the target gives loyalty points once per
-- period. Gyms edit them in the admin; every gym starts with three (changeable) challenges.

alter table public.loyalty_ledger drop constraint loyalty_ledger_reason_check;
alter table public.loyalty_ledger add constraint loyalty_ledger_reason_check
  check (reason in ('visit', 'payment', 'payment_void', 'redeem', 'adjust', 'referral', 'challenge'));

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null default public.current_club_id() references public.clubs (id) on delete cascade,
  kind text not null check (kind in ('visits', 'classes', 'workouts')),
  period text not null check (period in ('week', 'month')),
  target integer not null check (target between 1 and 100),
  reward_points integer not null default 0 check (reward_points between 0 and 100000),
  -- Optional own name; without it the apps name the challenge from kind, target and period.
  title text check (title is null or length(title) between 2 and 80),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger challenges_updated_at before update on public.challenges
  for each row execute function public.set_updated_at();
create index challenges_club_idx on public.challenges (club_id, sort_order);

alter table public.challenges enable row level security;
create policy challenges_api on public.challenges for all to grit_api using (true) with check (true);
create policy challenges_club on public.challenges as restrictive for all to grit_api, anon, authenticated
  using (club_id = public.current_club_id()) with check (club_id = public.current_club_id());

-- Starting challenges for every gym (existing and new).
create or replace function public.default_challenges(p_club uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.challenges (club_id, kind, period, target, reward_points, sort_order)
  values (p_club, 'visits', 'week', 3, 30, 1),
         (p_club, 'visits', 'month', 12, 150, 2),
         (p_club, 'classes', 'month', 4, 100, 3);
$$;
revoke execute on function public.default_challenges(uuid) from public, anon, authenticated;

select public.default_challenges(id) from public.clubs;

create or replace function public.clubs_default_challenges()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.default_challenges(new.id);
  return new;
end;
$$;
create trigger clubs_challenges after insert on public.clubs
  for each row execute function public.clubs_default_challenges();
revoke execute on function public.clubs_default_challenges() from public, anon, authenticated;
