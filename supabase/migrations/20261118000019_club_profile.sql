-- Club profile editable in the admin: the apps stay the same, but name, slogan, contact, logo,
-- login photo and the photo gallery come from here instead of being built into the apps.
-- Photos are media keys (MediaStore); 'defaults/…' files are the bundled GRIT photos that the
-- API copies into the media folder on start, so a fresh install looks exactly like before.

create table public.club_photos (
  id uuid primary key default gen_random_uuid(),
  path text not null check (path ~ '^[a-z0-9/_.-]{3,200}$'),
  captions jsonb not null default '{}'::jsonb, -- { "sr": "Glavna sala", "en": "Main hall", ... }
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index club_photos_sort_idx on public.club_photos (sort_order, created_at);

alter table public.club_photos enable row level security;
revoke all on public.club_photos from anon, authenticated;
grant select on public.club_photos to anon, authenticated;
create policy club_photos_public_read on public.club_photos for select to anon, authenticated using (true);

insert into public.club_photos (path, sort_order, captions) values
  ('defaults/main-hall.jpg', 10, '{"sr": "Glavna sala", "en": "Main hall", "ru": "Главный зал", "ar": "القاعة الرئيسية"}'),
  ('defaults/plate-loaded.jpg', 20, '{"sr": "Mašine sa tegovima", "en": "Plate loaded machines", "ru": "Тренажёры со свободным весом", "ar": "أجهزة الأوزان الحرة المحمّلة"}'),
  ('defaults/free-weights.jpg', 30, '{"sr": "Slobodni tegovi", "en": "Free weights", "ru": "Свободные веса", "ar": "الأوزان الحرة"}'),
  ('defaults/cable-station.jpg', 40, '{"sr": "Sajla stanica", "en": "Cable station", "ru": "Блочная станция", "ar": "محطة الكابلات"}'),
  ('defaults/machines.jpg', 50, '{"sr": "Mašine", "en": "Machines", "ru": "Тренажёры", "ar": "الأجهزة"}'),
  ('defaults/leg-zone.jpg', 60, '{"sr": "Zona za noge", "en": "Leg zone", "ru": "Зона для ног", "ar": "منطقة الأرجل"}');

-- Short name used inside texts ("Your GRIT", "GRIT points"); logo and login photo as media keys
-- (null logo = the built-in GRIT logo).
insert into public.settings (key, value) values
  ('club.short_name', '"GRIT"'),
  ('club.logo', 'null'),
  ('club.login_image', '"defaults/main-hall.jpg"')
on conflict (key) do nothing;
