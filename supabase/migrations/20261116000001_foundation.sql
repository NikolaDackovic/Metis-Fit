-- GRIT DIGITAL CLUB — 001 foundation: extensions, shared helpers.
-- Supabase installs extensions into the `extensions` schema; we do the same so
-- migrations behave identically on Supabase and on the local test Postgres.

create schema if not exists extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- Business "today" is always evaluated in the club's time zone.
create or replace function public.club_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Belgrade')::date;
$$;

-- Generic updated_at maintenance trigger.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Supabase grants ALL on new public tables to anon/authenticated by default.
-- GRIT exposes no table directly to clients unless a later migration grants it explicitly.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;
