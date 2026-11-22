-- GRIT DIGITAL CLUB - 036 F12-2: personal data belongs to the account, not to a gym membership.
--
-- Workouts, measurements, goals, food log, activities and daily check-ins are written only by
-- the person (the /me routes), so each row has an account. They now hang on user_id: they stay
-- when the person changes gym, trains at home or belongs to several gyms. A trainer still sees a
-- client's progress only through the client's membership in the trainer's gym, with consent.
-- Deleting the account deletes this data (profiles cascade).

do $$
declare
  t text;
begin
  foreach t in array array['workout_sessions', 'body_measurements', 'member_goals',
                           'food_log_entries', 'activities', 'daily_checkins'] loop
    execute format('alter table public.%I add column user_id uuid references public.profiles (id) on delete cascade', t);
    execute format(
      'update public.%I x set user_id = m.user_id from public.members m where m.id = x.member_id', t);
    -- A row whose membership has no account any more (erased member) has no owner: drop it.
    execute format('delete from public.%I where user_id is null', t);
    execute format('alter table public.%I alter column user_id set not null', t);
  end loop;
end $$;

-- Policies that pointed at the membership are replaced by account ownership.
drop policy workout_sessions_self on public.workout_sessions;
drop policy workout_sets_self on public.workout_sets;
drop policy body_measurements_self on public.body_measurements;
drop policy member_goals_self on public.member_goals;
drop policy food_log_self on public.food_log_entries;
drop policy activities_self on public.activities;
drop policy daily_checkins_self on public.daily_checkins;

alter table public.daily_checkins drop constraint daily_checkins_pkey;

alter table public.workout_sessions drop column member_id;
alter table public.body_measurements drop column member_id;
alter table public.member_goals drop column member_id;
alter table public.food_log_entries drop column member_id;
alter table public.activities drop column member_id;
alter table public.daily_checkins drop column member_id;

alter table public.daily_checkins add primary key (user_id, day);
create index workout_sessions_user_idx on public.workout_sessions (user_id, started_at desc);
create index body_measurements_user_idx on public.body_measurements (user_id, measured_on desc);
create index member_goals_user_idx on public.member_goals (user_id, status);
create index food_log_user_day_idx on public.food_log_entries (user_id, eaten_on desc);
create index activities_user_idx on public.activities (user_id, done_on desc);

create policy workout_sessions_self on public.workout_sessions for select to authenticated
  using (user_id = auth.uid());
create policy workout_sets_self on public.workout_sets for select to authenticated
  using (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy body_measurements_self on public.body_measurements for select to authenticated
  using (user_id = auth.uid());
create policy member_goals_self on public.member_goals for select to authenticated
  using (user_id = auth.uid());
create policy food_log_self on public.food_log_entries for select to authenticated
  using (user_id = auth.uid());
create policy activities_self on public.activities for select to authenticated
  using (user_id = auth.uid());
create policy daily_checkins_self on public.daily_checkins for select to authenticated
  using (user_id = auth.uid());

-- Trainer access goes through the client's membership in the trainer's own gym (+ consent).
create or replace function public.trainer_can_view_progress(p_user uuid, p_member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_consent(p_member, 'progress_share_trainer')
     and exists (select 1 from public.trainer_clients tc
                 join public.trainers t on t.id = tc.trainer_id
                 join public.members m on m.id = tc.member_id
                 where t.user_id = p_user and t.archived_at is null
                   and t.club_id = public.current_club_id() and m.club_id = t.club_id
                   and tc.member_id = p_member and tc.status = 'active');
$$;
