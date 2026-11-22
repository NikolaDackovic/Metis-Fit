-- GRIT DIGITAL CLUB - 038 F12-6: background work per gym.
-- Scheduled jobs and the POS retry run outside any request, so they must say which gym each row
-- belongs to: notifications remember their gym (for the gym name in the text and the link), and
-- settings are read for an explicit gym.

alter table public.notifications
  add column club_id uuid references public.clubs (id) on delete cascade;
update public.notifications set club_id = (select id from public.clubs where is_default) where club_id is null;
alter table public.notifications alter column club_id set default public.current_club_id();
create index notifications_club_idx on public.notifications (club_id);

-- A setting of one gym, for code that runs outside a request (jobs).
create or replace function public.setting_int_for(p_club uuid, p_key text, p_default integer)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select (s.value #>> '{}')::integer from public.settings s
                   where s.club_id = p_club and s.key = p_key), p_default);
$$;
revoke execute on function public.setting_int_for(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.setting_int_for(uuid, text, integer) to grit_api;

-- Where an account is present, across all gyms (also suspended ones): member rows and staff roles.
-- Used for data export and erasure, which must cover every gym the person belongs to.
create or replace function public.account_presence(p_user uuid)
returns table (club_id uuid, club_name text, member_id uuid, is_staff boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, m.id,
         exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                 where ur.user_id = p_user and r.club_id = c.id and r.key <> 'member')
  from public.clubs c
  left join public.members m on m.club_id = c.id and m.user_id = p_user
  where m.id is not null
     or exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                where ur.user_id = p_user and r.club_id = c.id and r.key <> 'member')
  order by c.is_default desc, c.name;
$$;
revoke execute on function public.account_presence(uuid) from public, anon, authenticated;
grant execute on function public.account_presence(uuid) to grit_api;
