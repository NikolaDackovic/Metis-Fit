-- GRIT DIGITAL CLUB - 032 offline access pass (QR without internet).
-- While online, the app keeps one spare QR token on the phone. It is valid for a few hours and,
-- like every QR, can be used once: the desk is online and consumes it atomically. Getting a new
-- offline pass revokes the previous unused one, so at most one exists per member.

alter table public.access_tokens
  add column kind text not null default 'live' check (kind in ('live', 'offline'));
create index access_tokens_offline on public.access_tokens (member_id)
  where kind = 'offline' and consumed_at is null;

insert into public.settings (key, value) values ('access.offline_pass_hours', '12'::jsonb)
on conflict (key) do nothing;
