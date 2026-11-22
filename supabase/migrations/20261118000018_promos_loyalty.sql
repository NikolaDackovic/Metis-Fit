-- F8-2: promo codes and loyalty points.
--
-- Promo codes are applied by the front desk when a membership is sold: the membership price is
-- stored already discounted, and the redemption row records which code gave how much. Usage
-- limits are checked under a row lock on the code, so the last use cannot be taken twice.
--
-- Loyalty points live in an append-only ledger. Points for visits and payments are written by
-- triggers in the same transaction as the visit / payment, with a reference key that is unique
-- per member, so an entry can never be counted twice. A voided payment takes its points back.
-- All amounts and thresholds are [PROVIZORNO] settings the owner can change.

-- ── Promo codes ─────────────────────────────────────────────────────────────
create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code extensions.citext not null unique check (code::text ~ '^[A-Za-z0-9_-]{3,30}$'),
  kind text not null check (kind in ('percent', 'fixed')),
  -- percent: 1-100; fixed: amount in minor units (para)
  value integer not null check (value > 0),
  plan_ids uuid[], -- null = every plan
  valid_from date,
  valid_until date,
  max_uses integer check (max_uses is null or max_uses > 0),
  max_uses_per_member integer not null default 1 check (max_uses_per_member > 0),
  uses_count integer not null default 0 check (uses_count >= 0),
  is_active boolean not null default true,
  -- Shown to members in the app ("Akcije") with its title per language.
  is_public boolean not null default false,
  translations jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  check (max_uses is null or uses_count <= max_uses)
);
create trigger promo_codes_updated_at before update on public.promo_codes
  for each row execute function public.set_updated_at();

create table public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references public.promo_codes (id) on delete restrict,
  member_id uuid not null references public.members (id) on delete cascade,
  membership_id uuid not null unique references public.memberships (id) on delete cascade,
  code text not null, -- copied, so a member sees the code on their membership without reading promo_codes
  original_amount integer not null check (original_amount >= 0),
  discount_amount integer not null check (discount_amount >= 0),
  redeemed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index promo_redemptions_promo_idx on public.promo_redemptions (promo_id, member_id);

-- ── Loyalty ─────────────────────────────────────────────────────────────────
create table public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  cost_points integer not null check (cost_points > 0),
  translations jsonb not null default '{}'::jsonb, -- { "sr": { "name": "...", "description": "..." } }
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger loyalty_rewards_updated_at before update on public.loyalty_rewards
  for each row execute function public.set_updated_at();

create table public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  points integer not null check (points <> 0),
  reason text not null check (reason in ('visit', 'payment', 'payment_void', 'redeem', 'adjust')),
  ref text check (ref is null or length(ref) <= 120),
  reward_id uuid references public.loyalty_rewards (id) on delete set null,
  note text check (note is null or length(note) <= 300),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index loyalty_ledger_ref_uq on public.loyalty_ledger (member_id, ref) where ref is not null;
create index loyalty_ledger_member_idx on public.loyalty_ledger (member_id, created_at desc);

insert into public.settings (key, value) values
  ('loyalty.enabled', 'true'),
  ('loyalty.points_per_visit', '10'),
  -- one point per this many minor units paid (10000 para = 100 RSD)
  ('loyalty.minor_per_point', '10000'),
  -- tiers by points earned in the last 365 days
  ('loyalty.silver_points', '500'),
  ('loyalty.gold_points', '1500')
on conflict (key) do nothing;

create or replace function public.loyalty_on_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_points integer := public.setting_int('loyalty.points_per_visit', 10);
begin
  if new.result = 'granted' and new.member_id is not null and v_points > 0
     and coalesce((select (value)::text from public.settings where key = 'loyalty.enabled'), 'true') = 'true' then
    insert into public.loyalty_ledger (member_id, points, reason, ref)
    values (new.member_id, v_points, 'visit',
            'visit:' || (new.occurred_at at time zone 'Europe/Belgrade')::date)
    on conflict (member_id, ref) where ref is not null do nothing;
  end if;
  return new;
end;
$$;
create trigger attendance_loyalty after insert on public.attendance_attempts
  for each row execute function public.loyalty_on_entry();

create or replace function public.loyalty_on_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_per integer := greatest(public.setting_int('loyalty.minor_per_point', 10000), 1);
  v_points integer;
begin
  if coalesce((select (value)::text from public.settings where key = 'loyalty.enabled'), 'true') <> 'true' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.status = 'recorded' then
    v_points := trunc(new.amount::numeric / v_per)::integer; -- refunds (negative) take points back
    if v_points <> 0 then
      insert into public.loyalty_ledger (member_id, points, reason, ref)
      values (new.member_id, v_points, 'payment', 'payment:' || new.id)
      on conflict (member_id, ref) where ref is not null do nothing;
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'recorded' and new.status = 'voided' then
    insert into public.loyalty_ledger (member_id, points, reason, ref)
    select l.member_id, -l.points, 'payment_void', 'payment_void:' || new.id
    from public.loyalty_ledger l
    where l.member_id = new.member_id and l.ref = 'payment:' || new.id
    on conflict (member_id, ref) where ref is not null do nothing;
  end if;
  return new;
end;
$$;
create trigger payments_loyalty after insert or update of status on public.payments
  for each row execute function public.loyalty_on_payment();
revoke execute on function public.loyalty_on_entry(), public.loyalty_on_payment()
  from public, anon, authenticated;

-- [PROVIZORNO] starter rewards (the owner edits them in the admin).
insert into public.loyalty_rewards (cost_points, sort_order, translations) values
  (150, 10, '{"sr": {"name": "[PROVIZORNO] Proteinski šejk", "description": "Jedan šejk u kafiću kluba"},
              "en": {"name": "[PROVISIONAL] Protein shake", "description": "One shake at the club café"},
              "ru": {"name": "[ПРЕДВАРИТЕЛЬНО] Протеиновый коктейль", "description": "Один коктейль в кафе клуба"}}'),
  (300, 20, '{"sr": {"name": "[PROVIZORNO] Gost na dan", "description": "Povedite prijatelja na jedan trening"},
              "en": {"name": "[PROVISIONAL] Guest pass", "description": "Bring a friend for one workout"},
              "ru": {"name": "[ПРЕДВАРИТЕЛЬНО] Гостевой визит", "description": "Приведите друга на одну тренировку"}}'),
  (800, 30, '{"sr": {"name": "[PROVIZORNO] Personalni trening", "description": "Jedan personalni trening sa trenerom"},
              "en": {"name": "[PROVISIONAL] Personal training", "description": "One personal session with a trainer"},
              "ru": {"name": "[ПРЕДВАРИТЕЛЬНО] Персональная тренировка", "description": "Одна персональная тренировка с тренером"}}');

-- ── Access ──────────────────────────────────────────────────────────────────
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.loyalty_ledger enable row level security;
revoke all on public.promo_codes, public.promo_redemptions, public.loyalty_rewards,
  public.loyalty_ledger from anon, authenticated;
-- Members see the discount on their own memberships (the code list itself stays staff-only).
grant select on public.promo_redemptions to authenticated;
create policy promo_redemptions_self on public.promo_redemptions for select to authenticated
  using (member_id = public.current_member_id());

insert into public.permissions (key, description) values
  ('promos.manage', 'Create and edit promo codes'),
  ('loyalty.manage', 'Edit loyalty rewards and adjust points'),
  ('loyalty.redeem', 'Redeem loyalty rewards for a member at the front desk');
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r
join public.permissions p on p.key in ('promos.manage', 'loyalty.manage', 'loyalty.redeem')
where r.key in ('owner', 'manager');
insert into public.role_permissions (role_id, permission_key)
select r.id, 'loyalty.redeem' from public.roles r where r.key = 'reception';

-- Announcements may now target members who agreed to marketing messages.
alter table public.announcements drop constraint announcements_audience_check;
alter table public.announcements add constraint announcements_audience_check
  check (audience in ('all', 'active', 'marketing'));
