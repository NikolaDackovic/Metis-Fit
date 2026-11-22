-- GRIT DIGITAL CLUB — 003 members, link codes, internal notes, consents.

create sequence public.member_number_seq start 1;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles (id) on delete set null,
  member_number text not null unique
    default ('G-' || lpad(nextval('public.member_number_seq')::text, 6, '0')),
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  email extensions.citext check (email is null or email::text ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or length(phone) between 6 and 20),
  date_of_birth date check (date_of_birth is null or date_of_birth > date '1900-01-01'),
  photo_path text,
  notes_public text check (notes_public is null or length(notes_public) <= 500),
  marketing_opt_in boolean not null default false,
  deactivated_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_contact_required check (email is not null or phone is not null)
);
create trigger members_updated_at before update on public.members
  for each row execute function public.set_updated_at();

create unique index members_email_active_uq on public.members (email)
  where email is not null and deactivated_at is null;
create index members_phone_idx on public.members (phone);
create index members_name_trgm_idx on public.members
  using gin ((lower(first_name || ' ' || last_name)) extensions.gin_trgm_ops);
create index members_created_at_idx on public.members (created_at desc);

create table public.member_link_codes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  attempts smallint not null default 0,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index member_link_codes_member_idx on public.member_link_codes (member_id, created_at desc);

create table public.member_notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  author_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index member_notes_member_idx on public.member_notes (member_id, created_at desc);

create type public.consent_type as enum
  ('terms', 'privacy', 'marketing', 'progress_share_trainer', 'photo_use');

-- Append-only history; the current consent is the latest row per (member, type).
create table public.member_consents (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  type public.consent_type not null,
  version text not null,
  granted boolean not null,
  source text not null check (source in ('app', 'reception')),
  recorded_at timestamptz not null default now()
);
create index member_consents_lookup_idx on public.member_consents (member_id, type, recorded_at desc);

-- Helper: the member row id of the currently authenticated user (used by RLS).
create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.members m where m.user_id = auth.uid();
$$;
