-- Uploaded images (gym logos, login photos, gallery, avatars, café items) kept in the database and
-- served by the API at /media/<key>. No external file storage or storage keys are needed.
create table public.media_objects (
  key text primary key check (key ~ '^[a-z0-9_-]+/[a-zA-Z0-9_.-]+$'),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  data bytea not null check (octet_length(data) <= 1100000),
  created_at timestamptz not null default now()
);
alter table public.media_objects enable row level security;
revoke all on public.media_objects from anon, authenticated;
create policy media_objects_api on public.media_objects for all to grit_api using (true) with check (true);
