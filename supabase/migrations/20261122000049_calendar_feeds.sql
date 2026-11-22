-- GRIT DIGITAL CLUB - 049 F14-8: calendar subscription.
-- A member subscribes their phone calendar once (a secret link); booked group classes and
-- sessions with a trainer then appear there and update by themselves. Only a hash of the secret
-- is stored; turning the link off or making a new one stops the old link immediately.

create table public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null default public.current_club_id() references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (club_id, user_id)
);

alter table public.calendar_feeds enable row level security;
create policy calendar_feeds_api on public.calendar_feeds for all to grit_api using (true) with check (true);
create policy calendar_feeds_club on public.calendar_feeds as restrictive for all to grit_api, anon, authenticated
  using (club_id = public.current_club_id()) with check (club_id = public.current_club_id());
