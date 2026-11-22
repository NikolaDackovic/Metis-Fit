-- Interface languages: Spanish, German, French, Italian and Chinese join sr, en, ru and ar.
-- Club content (plans, exercises, descriptions) stays in sr/en/ru/ar; other languages show English.
alter table public.profiles drop constraint profiles_locale_check;
alter table public.profiles add constraint profiles_locale_check
  check (locale in ('sr', 'en', 'ru', 'ar', 'es', 'de', 'fr', 'it', 'zh'));

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locale text := coalesce(new.raw_user_meta_data ->> 'locale', 'sr');
begin
  if v_locale not in ('sr', 'en', 'ru', 'ar', 'es', 'de', 'fr', 'it', 'zh') then
    v_locale := 'sr';
  end if;
  insert into public.profiles (id, first_name, last_name, locale)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'first_name', ''), 80),
    left(coalesce(new.raw_user_meta_data ->> 'last_name', ''), 80),
    v_locale
  );
  return new;
end;
$$;
