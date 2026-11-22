-- GRIT DIGITAL CLUB - 048 F14-4: when a trainer takes personal sessions.
-- Weekly windows (e.g. Monday 16:00-20:00) cut into slots of `slot_minutes`. Members see the free
-- slots (minus the trainer's appointments and classes) and book one; the appointment's no-overlap
-- constraint makes two bookings of the same slot impossible.

create table public.trainer_availability (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null default public.current_club_id() references public.clubs (id) on delete cascade,
  trainer_id uuid not null references public.trainers (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: 1 = Monday
  starts_at time not null,
  ends_at time not null,
  check (ends_at > starts_at)
);
create index trainer_availability_trainer_idx on public.trainer_availability (trainer_id, weekday);

alter table public.trainers
  add column slot_minutes smallint not null default 60 check (slot_minutes between 30 and 120);

alter table public.trainer_availability enable row level security;
create policy trainer_availability_api on public.trainer_availability for all to grit_api using (true) with check (true);
create policy trainer_availability_club on public.trainer_availability as restrictive for all to grit_api, anon, authenticated
  using (club_id = public.current_club_id()) with check (club_id = public.current_club_id());
