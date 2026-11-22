-- GRIT DIGITAL CLUB — 005 plans, memberships, pauses, payments.
-- Money is stored as integer minor units (para). The payment log is NOT a fiscal receipt.

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z_]{2,40}$'),
  is_public boolean not null default true
);
insert into public.zones (key, is_public) values
  ('gym', true), ('crossfit', true), ('boxing', true), ('pool', false);

create type public.plan_kind as enum
  ('time_based', 'visit_pack', 'unlimited', 'zone_pass', 'class_pack', 'personal_training');

create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  kind public.plan_kind not null,
  price_amount integer not null check (price_amount >= 0),
  currency char(3) not null default 'RSD' check (currency = upper(currency)),
  duration_days integer check (duration_days > 0),
  visit_limit integer check (visit_limit > 0),
  max_pauses smallint not null default 0 check (max_pauses >= 0),
  max_pause_days smallint not null default 0 check (max_pause_days >= 0),
  is_available boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_has_limit check (duration_days is not null or visit_limit is not null)
);
create trigger membership_plans_updated_at before update on public.membership_plans
  for each row execute function public.set_updated_at();

create table public.membership_plan_translations (
  plan_id uuid not null references public.membership_plans (id) on delete cascade,
  locale text not null check (locale in ('sr', 'en', 'ru', 'ar')),
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  terms text,
  primary key (plan_id, locale)
);

create table public.membership_plan_time_windows (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.membership_plans (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  starts_at time not null,
  ends_at time not null,
  check (ends_at > starts_at)
);
create index plan_time_windows_plan_idx on public.membership_plan_time_windows (plan_id);

create table public.membership_plan_zones (
  plan_id uuid not null references public.membership_plans (id) on delete cascade,
  zone_id uuid not null references public.zones (id) on delete restrict,
  primary key (plan_id, zone_id)
);

create type public.membership_state as enum ('pending', 'active', 'paused', 'cancelled');

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete restrict,
  plan_id uuid not null references public.membership_plans (id) on delete restrict,
  state public.membership_state not null default 'pending',
  start_date date not null,
  end_date date,
  visit_limit integer check (visit_limit > 0),
  visits_used integer not null default 0 check (visits_used >= 0),
  price_amount integer not null check (price_amount >= 0),
  currency char(3) not null default 'RSD',
  cancelled_reason text,
  sold_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (visit_limit is null or visits_used <= visit_limit),
  check (end_date is not null or visit_limit is not null),
  check (state <> 'cancelled' or cancelled_reason is not null)
);
create trigger memberships_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();

-- Two non-cancelled memberships of the SAME plan must not overlap in time.
alter table public.memberships add constraint memberships_no_overlap
  exclude using gist (
    member_id with =,
    plan_id with =,
    daterange(start_date, coalesce(end_date, 'infinity'::date), '[]') with &&
  ) where (state <> 'cancelled');

create index memberships_member_idx on public.memberships (member_id, end_date desc);
create index memberships_active_end_idx on public.memberships (end_date) where state = 'active';

create table public.membership_pauses (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected', 'cancelled')),
  reason text,
  requested_by uuid references public.profiles (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create trigger membership_pauses_updated_at before update on public.membership_pauses
  for each row execute function public.set_updated_at();
create index membership_pauses_membership_idx on public.membership_pauses (membership_id);

-- Single source of truth for the displayed membership status (docs/BUSINESS_RULES.md §2.2).
create or replace function public.membership_display_status(
  p_state public.membership_state,
  p_start_date date,
  p_end_date date,
  p_visit_limit integer,
  p_visits_used integer,
  p_today date default public.club_today()
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_state = 'cancelled' then 'cancelled'
    when p_state = 'pending' then 'pending'
    when p_state = 'paused' then 'paused'
    when p_start_date > p_today then 'pending'
    when (p_end_date is not null and p_today > p_end_date)
      or (p_visit_limit is not null and p_visits_used >= p_visit_limit) then 'expired'
    when (p_end_date is not null
          and p_end_date - p_today <= public.setting_int('membership.expiring_soon_days', 7))
      or (p_visit_limit is not null
          and p_visit_limit - p_visits_used <= public.setting_int('membership.expiring_soon_visits', 2))
      then 'expiring_soon'
    else 'active'
  end;
$$;

create type public.payment_method as enum ('cash', 'card', 'bank_transfer', 'other');
create type public.payment_status as enum ('recorded', 'voided');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete restrict,
  membership_id uuid references public.memberships (id) on delete restrict,
  amount integer not null check (amount <> 0),
  currency char(3) not null default 'RSD',
  method public.payment_method not null,
  status public.payment_status not null default 'recorded',
  paid_at timestamptz not null default now(),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  refund_of uuid references public.payments (id) on delete restrict,
  note text check (note is null or length(note) <= 500),
  void_reason text,
  voided_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check ((amount < 0) = (refund_of is not null)),
  check (status <> 'voided' or (void_reason is not null and voided_at is not null))
);
create index payments_paid_at_idx on public.payments (paid_at desc);
create index payments_member_idx on public.payments (member_id, paid_at desc);
create index payments_membership_idx on public.payments (membership_id);

-- Payments are immutable: the only allowed change is recorded -> voided (with reason). No deletes.
create or replace function public.guard_payment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'payments cannot be deleted; void or refund instead'
      using errcode = 'insufficient_privilege';
  end if;
  if old.status <> 'recorded' or new.status <> 'voided'
     or (to_jsonb(new) - array['status', 'void_reason', 'voided_by', 'voided_at'])
        <> (to_jsonb(old) - array['status', 'void_reason', 'voided_by', 'voided_at']) then
    raise exception 'payments are immutable; only recorded -> voided is allowed'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger payments_guard before update or delete on public.payments
  for each row execute function public.guard_payment_update();
