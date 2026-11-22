-- GRIT DIGITAL CLUB - 033 "coaching" notifications: weekly report, training nudge, measurement
-- reminder. A separate category so a member can keep membership/class messages and switch the
-- healthy-life nudges off (Settings -> Notifications).

alter table public.notifications drop constraint notifications_category_check;
alter table public.notifications add constraint notifications_category_check
  check (category in ('membership', 'classes', 'club', 'marketing', 'coaching'));

alter table public.notification_preferences
  add column coaching boolean not null default true;
