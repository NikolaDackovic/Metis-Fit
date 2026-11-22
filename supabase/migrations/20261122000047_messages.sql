-- GRIT DIGITAL CLUB - 047 F14-3: messages between a member and their trainer.
-- A conversation is a (trainer, member) pair; it can be used while the trainer-client link is
-- active (the history stays readable afterwards). New messages notify the other side.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null default public.current_club_id() references public.clubs (id) on delete cascade,
  trainer_id uuid not null references public.trainers (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  sender text not null check (sender in ('member', 'trainer')),
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_conversation_idx on public.messages (trainer_id, member_id, created_at desc);
create index messages_unread_idx on public.messages (trainer_id, member_id) where read_at is null;

alter table public.messages enable row level security;
create policy messages_api on public.messages for all to grit_api using (true) with check (true);
create policy messages_club on public.messages as restrictive for all to grit_api, anon, authenticated
  using (club_id = public.current_club_id()) with check (club_id = public.current_club_id());
