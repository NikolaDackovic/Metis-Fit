-- GRIT DIGITAL CLUB - 037 F12-3: gyms register themselves; the platform owner approves them.
--
-- A signed-in person fills in "Open your gym": the gym is created as 'pending' with that person
-- as its owner. The owner can already set everything up in the admin; members, the public
-- directory and the app see the gym only after a platform admin approves it ('active').

create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
create policy platform_admins_api on public.platform_admins for all to grit_api using (true) with check (true);

alter table public.clubs
  add column address text check (address is null or length(address) <= 200),
  add column phone text check (phone is null or length(phone) <= 40),
  add column email text check (email is null or length(email) <= 200),
  add column suspended_reason text check (suspended_reason is null or length(suspended_reason) <= 300);

-- Starter set for a new gym: the system roles with the same permissions as the default gym,
-- the owner role for its founder, and the basic club profile settings.
create or replace function public.bootstrap_club(p_club uuid, p_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_template uuid := (select id from public.clubs where is_default);
  v_club public.clubs;
begin
  select * into v_club from public.clubs where id = p_club;
  if v_club.id is null then raise exception 'club not found'; end if;

  insert into public.roles (club_id, key, is_system)
  select p_club, r.key, r.is_system from public.roles r
  where r.club_id = v_template and r.is_system
  on conflict (club_id, key) do nothing;

  insert into public.role_permissions (club_id, role_id, permission_key)
  select p_club, nr.id, rp.permission_key
  from public.role_permissions rp
  join public.roles tr on tr.id = rp.role_id and tr.club_id = v_template and tr.is_system
  join public.roles nr on nr.club_id = p_club and nr.key = tr.key
  on conflict do nothing;

  insert into public.user_roles (club_id, user_id, role_id)
  select p_club, p_owner, r.id from public.roles r where r.club_id = p_club and r.key = 'owner'
  on conflict do nothing;
  insert into public.staff_profiles (club_id, user_id) values (p_club, p_owner)
  on conflict do nothing;

  insert into public.settings (club_id, key, value)
  select p_club, x.k, x.v from (values
    ('club.name', to_jsonb(v_club.name)),
    ('club.short_name', to_jsonb(left(v_club.name, 20))),
    ('club.phone', to_jsonb(v_club.phone)),
    ('club.email', to_jsonb(v_club.email)),
    ('club.address', to_jsonb(v_club.address)),
    ('club.map_visible', 'true'::jsonb)
  ) as x (k, v)
  where x.v is not null and x.v <> 'null'::jsonb
  on conflict (club_id, key) do nothing;
end;
$$;
revoke execute on function public.bootstrap_club(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_club(uuid, uuid) to grit_api;

-- The gyms a person belongs to (staff roles and/or membership), across all gyms. Runs as owner
-- because the isolation policies otherwise show only the current gym.
create or replace function public.my_clubs(p_user uuid)
returns table (id uuid, slug text, name text, city text, status text, roles text[], is_member boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, c.city, c.status,
         coalesce((select array_agg(distinct r.key order by r.key) from public.user_roles ur
                   join public.roles r on r.id = ur.role_id
                   where ur.user_id = p_user and r.club_id = c.id and r.key <> 'member'), '{}'),
         exists (select 1 from public.members m
                 where m.user_id = p_user and m.club_id = c.id and m.deactivated_at is null)
  from public.clubs c
  where c.status <> 'suspended'
    and (exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                 where ur.user_id = p_user and r.club_id = c.id and r.key <> 'member')
         or exists (select 1 from public.members m
                    where m.user_id = p_user and m.club_id = c.id and m.deactivated_at is null))
  order by c.is_default desc, c.name;
$$;
revoke execute on function public.my_clubs(uuid) from public, anon, authenticated;
grant execute on function public.my_clubs(uuid) to grit_api;

-- Members per gym for the platform overview (counts only, across gyms).
create or replace function public.club_member_counts()
returns table (club_id uuid, members bigint)
language sql stable security definer set search_path = '' as $$
  select m.club_id, count(*) from public.members m where m.anonymized_at is null group by m.club_id;
$$;
revoke execute on function public.club_member_counts() from public, anon, authenticated;
grant execute on function public.club_member_counts() to grit_api;
