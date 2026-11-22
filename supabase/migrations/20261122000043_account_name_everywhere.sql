-- GRIT DIGITAL CLUB - 043: the app account is the source of the person's name.
-- A person registers once in the app; every gym they belong to shows that name (and the app
-- profile photo, see member-photo.ts). Staff can still edit the gym's member row; the next change
-- the person makes in the app wins again.

-- 1. Now: linked members take the name from their account.
update public.members m
   set first_name = p.first_name,
       last_name = coalesce(nullif(btrim(p.last_name), ''), m.last_name)
  from public.profiles p
 where m.user_id = p.id
   and m.anonymized_at is null
   and nullif(btrim(p.first_name), '') is not null
   and (m.first_name, m.last_name) is distinct from (p.first_name, coalesce(nullif(btrim(p.last_name), ''), m.last_name));

-- 2. When the person changes the name in the app: every gym follows.
create or replace function public.profile_name_to_members()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if nullif(btrim(new.first_name), '') is not null
     and (new.first_name, new.last_name) is distinct from (old.first_name, old.last_name) then
    update public.members
       set first_name = new.first_name,
           last_name = coalesce(nullif(btrim(new.last_name), ''), last_name)
     where user_id = new.id and anonymized_at is null;
  end if;
  return new;
end;
$$;
create trigger profiles_name_to_members after update of first_name, last_name on public.profiles
  for each row execute function public.profile_name_to_members();

-- 3. When a member row gets linked to an account (link code, sign-up): it takes the account name.
create or replace function public.member_link_takes_account_name()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  if new.user_id is not null and new.user_id is distinct from old.user_id then
    select * into p from public.profiles where id = new.user_id;
    if found and nullif(btrim(p.first_name), '') is not null then
      new.first_name := p.first_name;
      new.last_name := coalesce(nullif(btrim(p.last_name), ''), new.last_name);
    end if;
  end if;
  return new;
end;
$$;
create trigger members_link_takes_account_name before update of user_id on public.members
  for each row execute function public.member_link_takes_account_name();

revoke execute on function public.profile_name_to_members(), public.member_link_takes_account_name()
  from public, anon, authenticated;
