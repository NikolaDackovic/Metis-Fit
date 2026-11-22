-- GRIT DIGITAL CLUB - 040 F13-3: "Bring a friend" (referrals).
-- Every member has a short personal code. A new member who enters a friend's code before their
-- first payment is linked to that friend; with the first recorded membership payment both get
-- loyalty points. The gym turns it on and sets the points (off by default: a business decision).

alter table public.loyalty_ledger drop constraint loyalty_ledger_reason_check;
alter table public.loyalty_ledger add constraint loyalty_ledger_reason_check
  check (reason in ('visit', 'payment', 'payment_void', 'redeem', 'adjust', 'referral'));

-- Unambiguous alphabet (no 0/O, 1/I/L): easy to read out loud and type.
alter table public.members
  add column referral_code text check (referral_code ~ '^[A-HJKMNP-Z2-9]{6}$');
create unique index members_referral_code_uq on public.members (club_id, referral_code)
  where referral_code is not null;

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null default public.current_club_id() references public.clubs (id) on delete cascade,
  referrer_id uuid not null references public.members (id) on delete cascade,
  friend_id uuid not null references public.members (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'rewarded')),
  referrer_points integer not null default 0,
  friend_points integer not null default 0,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  check (referrer_id <> friend_id)
);
-- A member can be brought by one friend only.
create unique index referrals_friend_uq on public.referrals (friend_id);
create index referrals_referrer_idx on public.referrals (referrer_id, created_at desc);

alter table public.referrals enable row level security;
create policy referrals_api on public.referrals for all to grit_api using (true) with check (true);
create policy referrals_club on public.referrals as restrictive for all to grit_api, anon, authenticated
  using (club_id = public.current_club_id()) with check (club_id = public.current_club_id());

-- With the friend's first recorded payment for a membership: points for both, once.
create or replace function public.referral_on_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  v_enabled boolean := coalesce(public.setting_text_for(new.club_id, 'referral.enabled'), 'false') = 'true';
  v_referrer integer := greatest(coalesce(public.setting_text_for(new.club_id, 'referral.points_referrer')::integer, 0), 0);
  v_friend integer := greatest(coalesce(public.setting_text_for(new.club_id, 'referral.points_friend')::integer, 0), 0);
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
    -- Tell the member who brought the friend (same rules as notify(): preferences, push state).
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
create trigger payments_referral after insert on public.payments
  for each row execute function public.referral_on_payment();
revoke execute on function public.referral_on_payment() from public, anon, authenticated;
