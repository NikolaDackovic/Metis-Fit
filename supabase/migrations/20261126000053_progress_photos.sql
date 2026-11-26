-- GRIT DIGITAL CLUB - 053 F18-1: progress photos.
-- Private body photos, so they never go to the public image bucket: the (already resized) image
-- and a small thumbnail are stored here and served only by the API, to the owner, and to their
-- active trainer only for photos the member marked as shared AND with progress sharing allowed.
-- Personal data of the account (like workouts and measurements): no club, deleted with the account.

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  taken_on date not null default current_date,
  pose text not null default 'front' check (pose in ('front', 'side', 'back', 'other')),
  weight_kg numeric(5, 1) check (weight_kg is null or weight_kg between 20 and 400),
  note text check (note is null or length(note) <= 300),
  shared boolean not null default false,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  image bytea not null check (octet_length(image) <= 1100000),
  thumb bytea not null check (octet_length(thumb) <= 150000),
  created_at timestamptz not null default now()
);
create index progress_photos_user_idx on public.progress_photos (user_id, taken_on desc, created_at desc);

alter table public.progress_photos enable row level security;
revoke all on public.progress_photos from anon, authenticated;
create policy progress_photos_api on public.progress_photos for all to grit_api using (true) with check (true);
