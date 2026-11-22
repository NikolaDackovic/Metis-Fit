-- GRIT DIGITAL CLUB - 041 F13-3: "Bring a friend" is on by default with starting points
-- (200 for the member who refers, 100 for the new member). Every gym changes or turns it off in
-- the admin (Loyalty); a saved setting always wins over these defaults.
create or replace function public.referral_on_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  v_enabled boolean := coalesce(public.setting_text_for(new.club_id, 'referral.enabled'), 'true') = 'true';
  v_referrer integer := greatest(coalesce(public.setting_text_for(new.club_id, 'referral.points_referrer')::integer, 200), 0);
  v_friend integer := greatest(coalesce(public.setting_text_for(new.club_id, 'referral.points_friend')::integer, 100), 0);
begin
  if new.status <> 'recorded' or new.amount <= 0 or new.membership_id is null or not v_enabled then
    return new;
  end if;
  select * into r from public.referrals
   where friend_id = new.member_id and status = 'pending' for update;
  if not found then
    return new;
  end if;
  update public.referrals
     set status = 'rewarded', rewarded_at = now(),
         referrer_points = v_referrer, friend_points = v_friend
   where id = r.id;
  if v_referrer > 0 then
    insert into public.loyalty_ledger (club_id, member_id, points, reason, ref)
    values (new.club_id, r.referrer_id, v_referrer, 'referral', 'referral:' || r.id)
    on conflict (member_id, ref) where ref is not null do nothing;
    insert into public.notifications (club_id, user_id, kind, category, params, link, dedupe_key, push_status)
    select new.club_id, m.user_id, 'referral_rewarded', 'club',
           jsonb_build_object('name', f.first_name, 'points', v_referrer), '/membership',
           'referral:' || r.id,
           case when coalesce((select np.push_enabled from public.notification_preferences np
                               where np.user_id = m.user_id), true)
                 and exists (select 1 from public.push_tokens t where t.user_id = m.user_id)
                then 'pending' else 'none' end
    from public.members m, public.members f
    where m.id = r.referrer_id and f.id = r.friend_id and m.user_id is not null
      and coalesce((select np.club from public.notification_preferences np
                    where np.user_id = m.user_id), true)
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
  if v_friend > 0 then
    insert into public.loyalty_ledger (club_id, member_id, points, reason, ref)
    values (new.club_id, r.friend_id, v_friend, 'referral', 'referral_friend:' || r.id)
    on conflict (member_id, ref) where ref is not null do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.referral_on_payment() from public, anon, authenticated;
