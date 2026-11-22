-- GRIT DIGITAL CLUB — 006 QR access tokens and attendance attempts (docs/SECURITY.md §5).

create table public.access_tokens (
  jti uuid primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  device_id uuid,
  check (expires_at > issued_at)
);
create index access_tokens_expires_idx on public.access_tokens (expires_at);
create index access_tokens_member_idx on public.access_tokens (member_id, issued_at desc);

create type public.attempt_result as enum ('granted', 'denied');
create type public.attempt_source as enum ('qr', 'manual', 'override', 'backfill');

create table public.attendance_attempts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members (id) on delete set null,
  jti uuid,
  source public.attempt_source not null,
  result public.attempt_result not null,
  reason_code text not null check (reason_code ~ '^[A-Z_]+$'),
  membership_id uuid references public.memberships (id) on delete set null,
  consumed_visit boolean not null default false,
  terminal_id text,
  override_reason text,
  performed_by uuid references public.profiles (id) on delete set null,
  occurred_at timestamptz not null default now(),
  check (source <> 'override' or length(trim(coalesce(override_reason, ''))) >= 5),
  check (result = 'granted' or not consumed_visit)
);
create index attendance_occurred_idx on public.attendance_attempts (occurred_at desc);
create index attendance_member_idx on public.attendance_attempts (member_id, occurred_at desc);

create trigger attendance_attempts_immutable before update or delete on public.attendance_attempts
  for each row execute function public.prevent_modification();

create view public.attendance with (security_invoker = true) as
  select * from public.attendance_attempts where result = 'granted';
