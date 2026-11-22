-- GRIT DIGITAL CLUB - 046 F13-7: members rate a group class or a personal session they had
-- (1-5 stars, optional comment). One rating per booking / appointment. Owners see averages per
-- trainer and class type; the app shows a trainer's average once there are a few ratings.

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null default public.current_club_id() references public.clubs (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete cascade,
  appointment_id uuid references public.trainer_appointments (id) on delete cascade,
  trainer_id uuid references public.trainers (id) on delete set null,
  class_type_id uuid references public.class_types (id) on delete set null,
  stars smallint not null check (stars between 1 and 5),
  comment text check (comment is null or length(comment) <= 500),
  created_at timestamptz not null default now(),
  check (num_nonnulls(booking_id, appointment_id) = 1)
);
create unique index ratings_booking_uq on public.ratings (booking_id) where booking_id is not null;
create unique index ratings_appointment_uq on public.ratings (appointment_id) where appointment_id is not null;
create index ratings_trainer_idx on public.ratings (trainer_id, created_at desc);
create index ratings_club_idx on public.ratings (club_id, created_at desc);

alter table public.ratings enable row level security;
create policy ratings_api on public.ratings for all to grit_api using (true) with check (true);
create policy ratings_club on public.ratings as restrictive for all to grit_api, anon, authenticated
  using (club_id = public.current_club_id()) with check (club_id = public.current_club_id());
