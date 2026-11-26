-- GRIT DIGITAL CLUB - 051: hide an alert for a while ("handled", "remind me later").
-- The desk can dismiss a row in the alert center (e.g. a debt after calling the member); it comes
-- back by itself after `until` if the reason is still there. The menu badge counts only what is
-- not dismissed.

create table public.alert_dismissals (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null default public.current_club_id() references public.clubs (id) on delete cascade,
  kind text not null check (kind in ('expiring', 'debts', 'inactive', 'birthdays', 'signups')),
  member_id uuid not null references public.members (id) on delete cascade,
  until date not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (club_id, kind, member_id)
);

alter table public.alert_dismissals enable row level security;
create policy alert_dismissals_api on public.alert_dismissals for all to grit_api using (true) with check (true);
create policy alert_dismissals_club on public.alert_dismissals as restrictive for all to grit_api, anon, authenticated
  using (club_id = public.current_club_id()) with check (club_id = public.current_club_id());
