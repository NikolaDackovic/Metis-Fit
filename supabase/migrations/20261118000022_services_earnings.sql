-- F9b: catalog of single services (massage, sauna, InBody, day pass, towel…), selling them at the
-- front desk, and trainer earnings: each trainer's share per service (percent or fixed RSD) is
-- frozen on every sale / personal-training session, so later rate changes never rewrite history.
-- Money in minor units (para). Like the café, this records payments but issues no fiscal receipt.

create table public.services (
  id uuid primary key default gen_random_uuid(),
  -- 'pt_session' is a system entry: not sold here, it carries the trainers' rate per PT session.
  key text unique check (key is null or key ~ '^[a-z_]{2,40}$'),
  translations jsonb not null default '{}'::jsonb, -- { "sr": { "name": "...", "description": "..." } }
  price_amount integer not null check (price_amount >= 0),
  currency char(3) not null default 'RSD',
  duration_min integer check (duration_min is null or duration_min between 1 and 600),
  needs_provider boolean not null default false, -- a trainer / therapist performs it
  default_share_kind text not null default 'percent' check (default_share_kind in ('percent', 'fixed')),
  default_share_value integer not null default 0 check (default_share_value >= 0),
  is_sellable boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (default_share_kind <> 'percent' or default_share_value <= 100)
);
create trigger services_updated_at before update on public.services
  for each row execute function public.set_updated_at();

-- Per-trainer override of the service's default share.
create table public.trainer_service_rates (
  trainer_id uuid not null references public.trainers (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  share_kind text not null check (share_kind in ('percent', 'fixed')),
  share_value integer not null check (share_value >= 0),
  updated_at timestamptz not null default now(),
  primary key (trainer_id, service_id),
  check (share_kind <> 'percent' or share_value <= 100)
);

create table public.service_sales (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete restrict,
  member_id uuid references public.members (id) on delete set null, -- null = walk-in guest
  trainer_id uuid references public.trainers (id) on delete set null, -- who performed it
  name text not null, -- snapshot
  qty integer not null default 1 check (qty between 1 and 100),
  unit_price integer not null check (unit_price >= 0),
  total_amount integer not null check (total_amount >= 0),
  currency char(3) not null default 'RSD',
  trainer_share_amount integer not null default 0 check (trainer_share_amount >= 0),
  payment_method text not null check (payment_method in ('cash', 'card', 'transfer', 'other')),
  note text check (note is null or length(note) <= 300),
  sold_by uuid references public.profiles (id) on delete set null,
  sold_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text,
  check ((voided_at is null) = (void_reason is null))
);
create index service_sales_sold_idx on public.service_sales (sold_at desc);
create index service_sales_trainer_idx on public.service_sales (trainer_id, sold_at);
create index service_sales_member_idx on public.service_sales (member_id, sold_at desc);

-- PT sessions: the trainer's share is frozen when the session is recorded.
alter table public.pt_sessions add column trainer_share_amount integer not null default 0
  check (trainer_share_amount >= 0);

create or replace function public.trainer_share(p_trainer uuid, p_service uuid, p_base integer)
returns integer language sql stable security definer set search_path = '' as $$
  select case when kind = 'percent' then round(p_base * value / 100.0)::int else value end
  from (
    select coalesce(r.share_kind, s.default_share_kind) as kind,
           coalesce(r.share_value, s.default_share_value) as value
    from public.services s
    left join public.trainer_service_rates r on r.service_id = s.id and r.trainer_id = p_trainer
    where s.id = p_service
  ) x;
$$;

create or replace function public.pt_session_share()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_service uuid := (select id from public.services where key = 'pt_session');
  v_base integer;
begin
  if new.trainer_id is null or v_service is null then return new; end if;
  -- Value of one session = package price / number of sessions in the package.
  select case when ms.visit_limit > 0 then round(ms.price_amount::numeric / ms.visit_limit)::int
              else ms.price_amount end
    into v_base
  from public.memberships ms where ms.id = new.membership_id;
  new.trainer_share_amount := coalesce(public.trainer_share(new.trainer_id, v_service, coalesce(v_base, 0)), 0);
  return new;
end;
$$;
create trigger pt_sessions_share before insert on public.pt_sessions
  for each row execute function public.pt_session_share();
revoke execute on function public.trainer_share(uuid, uuid, integer), public.pt_session_share()
  from public, anon, authenticated;

alter table public.services enable row level security;
alter table public.trainer_service_rates enable row level security;
alter table public.service_sales enable row level security;
revoke all on public.services, public.trainer_service_rates, public.service_sales from anon, authenticated;
-- The public price list and a member's own purchases are served by the API.

insert into public.permissions (key, description) values
  ('services.manage', 'Edit the service catalog, prices and trainer shares'),
  ('services.sell', 'Sell single services at the front desk'),
  ('earnings.read', 'See trainer earnings (trainers always see their own)');
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r
join public.permissions p on p.key in ('services.manage', 'services.sell', 'earnings.read')
where r.key in ('owner', 'manager');
insert into public.role_permissions (role_id, permission_key)
select r.id, 'services.sell' from public.roles r where r.key = 'reception';

-- [PROVIZORNO] starter catalog; the owner sets real services, prices and shares in the admin.
insert into public.services (key, sort_order, price_amount, duration_min, needs_provider, default_share_kind, default_share_value, is_sellable, translations) values
  ('pt_session', 0, 0, 60, true, 'percent', 50, false,
   '{"sr": {"name": "Personalni trening (sesija)"}, "en": {"name": "Personal training (session)"}, "ru": {"name": "Персональная тренировка (сессия)"}, "ar": {"name": "تدريب شخصي (جلسة)"}}'),
  (null, 10, 150000, null, false, 'percent', 0, true,
   '{"sr": {"name": "[PROVIZORNO] Dnevna karta"}, "en": {"name": "[PROVISIONAL] Day pass"}, "ru": {"name": "[ПРЕДВАРИТЕЛЬНО] Разовый вход"}, "ar": {"name": "[مؤقت] تذكرة يومية"}}'),
  (null, 20, 200000, 20, true, 'percent', 30, true,
   '{"sr": {"name": "[PROVIZORNO] InBody merenje i konsultacija"}, "en": {"name": "[PROVISIONAL] InBody scan and consultation"}, "ru": {"name": "[ПРЕДВАРИТЕЛЬНО] Замер InBody и консультация"}, "ar": {"name": "[مؤقت] قياس InBody واستشارة"}}'),
  (null, 30, 350000, 50, true, 'percent', 40, true,
   '{"sr": {"name": "[PROVIZORNO] Sportska masaža"}, "en": {"name": "[PROVISIONAL] Sports massage"}, "ru": {"name": "[ПРЕДВАРИТЕЛЬНО] Спортивный массаж"}, "ar": {"name": "[مؤقت] تدليك رياضي"}}'),
  (null, 40, 30000, null, false, 'percent', 0, true,
   '{"sr": {"name": "[PROVIZORNO] Peškir"}, "en": {"name": "[PROVISIONAL] Towel"}, "ru": {"name": "[ПРЕДВАРИТЕЛЬНО] Полотенце"}, "ar": {"name": "[مؤقت] منشفة"}}');
