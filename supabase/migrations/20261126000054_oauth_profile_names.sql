-- Sign-in with Google: the provider sends given_name/family_name (or one full_name) instead of
-- first_name/last_name. Use them so a Google account starts with a proper name too.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_locale text := coalesce(m ->> 'locale', 'sr');
  v_full text := trim(coalesce(m ->> 'full_name', m ->> 'name', ''));
  v_first text := coalesce(nullif(m ->> 'first_name', ''), nullif(m ->> 'given_name', ''));
  v_last text := coalesce(nullif(m ->> 'last_name', ''), nullif(m ->> 'family_name', ''));
begin
  if v_locale not in ('sr', 'en', 'ru', 'ar', 'es', 'de', 'fr', 'it', 'zh') then
    v_locale := 'sr';
  end if;
  if v_first is null and v_full <> '' then
    v_first := split_part(v_full, ' ', 1);
    v_last := coalesce(v_last, nullif(trim(substr(v_full, length(v_first) + 1)), ''));
  end if;
  insert into public.profiles (id, first_name, last_name, locale)
  values (new.id, left(coalesce(v_first, ''), 80), left(coalesce(v_last, ''), 80), v_locale)
  on conflict (id) do nothing;
  return new;
end;
$$;
