-- GRIT DIGITAL CLUB - 044: show staff when the map draft has changes members do not see yet.
-- The draft remembers the revision that was last published; a higher revision = unpublished changes.
alter table public.map_versions add column published_revision integer;
