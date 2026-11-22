-- F8-1: notifications (in-app inbox + push), preferences, push tokens, staff announcements.
-- Messages are stored as a kind + params and rendered in the reader's language by the client,
-- so one notification works in sr/en/ru (and ar later). Every automatic notification carries a
-- dedupe key: the unique index makes sending idempotent, so a job that runs twice (or on two
-- servers) never sends a duplicate. All access goes through the API (no client grants).

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{2,40}$'),
  category text not null check (category in ('membership', 'classes', 'club', 'marketing')),
  params jsonb not null default '{}'::jsonb,
  link text check (link is null or link ~ '^/[a-z0-9/_-]{0,120}$'),
  dedupe_key text check (dedupe_key is null or length(dedupe_key) <= 200),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  push_status text not null default 'none' check (push_status in ('none', 'pending', 'sent', 'failed', 'skipped'))
);
create unique index notifications_dedupe_uq on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_push_pending_idx on public.notifications (created_at) where push_status = 'pending';

create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  push_enabled boolean not null default true,
  membership boolean not null default true,
  classes boolean not null default true,
  club boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create table public.push_tokens (
  token text primary key check (length(token) between 10 and 300),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- Staff announcements (e.g. "closed on the holiday"): one row here, one notification per recipient.
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null check (length(trim(body)) between 1 and 1000),
  audience text not null check (audience in ('all', 'active')),
  recipients integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_tokens enable row level security;
alter table public.announcements enable row level security;
revoke all on public.notifications, public.notification_preferences, public.push_tokens,
  public.announcements from anon, authenticated;

insert into public.permissions (key, description) values
  ('notifications.send', 'Send announcements to members'),
  ('alerts.read', 'See the alert center (renewals, debts, inactive members, birthdays, sign-ups)');
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r
join public.permissions p on p.key in ('notifications.send', 'alerts.read')
where r.key in ('owner', 'manager');
insert into public.role_permissions (role_id, permission_key)
select r.id, 'alerts.read' from public.roles r where r.key = 'reception';

-- inactive_days: no visit for this long with an active membership = passive member.
insert into public.settings (key, value) values
  ('alerts.inactive_days', '30'),
  ('alerts.expiring_days', '7'),
  ('notifications.class_reminder_hours', '2')
on conflict (key) do nothing;
