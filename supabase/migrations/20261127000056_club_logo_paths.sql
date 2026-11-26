-- The public gym directory shows each gym's logo. Settings are isolated per gym, so this returns
-- only the logo paths of all gyms (nothing else) for the API.
create or replace function public.club_logo_paths()
returns table (club_id uuid, path text)
language sql stable security definer set search_path = '' as $$
  select s.club_id, s.value #>> '{}' from public.settings s where s.key = 'club.logo';
$$;
revoke execute on function public.club_logo_paths() from public, anon, authenticated;
grant execute on function public.club_logo_paths() to grit_api;
