-- F9: café - menu, stock, tables with QR codes, orders (QR at the table, member app, bar) and a
-- configurable adapter to an external POS / fiscal device (DECISIONS 2026-11-17).
--
-- Money: integer minor units (para). Order lines keep a snapshot of name and price so later menu
-- edits never change past orders. Stock is a running quantity per item with an append-only
-- movement log; an order takes stock when placed and gives it back when cancelled.
-- The café does NOT issue fiscal receipts itself: a paid order is handed to the club's POS /
-- fiscal system through the adapter (webhook), and its status is tracked per order.

create table public.cafe_categories (
  id uuid primary key default gen_random_uuid(),
  translations jsonb not null default '{}'::jsonb, -- { "sr": { "name": "Kafa" }, ... }
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.cafe_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.cafe_categories (id) on delete restrict,
  translations jsonb not null default '{}'::jsonb, -- { "sr": { "name": "...", "description": "..." } }
  price_amount integer not null check (price_amount >= 0),
  currency char(3) not null default 'RSD',
  photo_path text,
  is_available boolean not null default true,
  track_stock boolean not null default false,
  stock_qty integer not null default 0 check (stock_qty >= 0),
  low_stock_at integer not null default 5 check (low_stock_at >= 0),
  sku text check (sku is null or length(sku) <= 60), -- code in the external POS
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger cafe_items_updated_at before update on public.cafe_items
  for each row execute function public.set_updated_at();
create index cafe_items_category_idx on public.cafe_items (category_id, sort_order);

create table public.cafe_stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.cafe_items (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('sale', 'sale_cancel', 'restock', 'adjust', 'waste')),
  order_id uuid,
  note text check (note is null or length(note) <= 300),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index cafe_stock_item_idx on public.cafe_stock_movements (item_id, created_at desc);

create table public.cafe_tables (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(trim(label)) between 1 and 40),
  -- Random code printed in the table's QR (not guessable, can be regenerated).
  code text not null unique check (code ~ '^[A-Za-z0-9]{10,32}$'),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.cafe_orders (
  id uuid primary key default gen_random_uuid(),
  -- Short number shown on the board and called out at the bar (resets daily in the app view).
  number integer not null,
  source text not null check (source in ('table_qr', 'app', 'bar')),
  table_id uuid references public.cafe_tables (id) on delete set null,
  member_id uuid references public.members (id) on delete set null,
  status text not null default 'new' check (status in ('new', 'preparing', 'ready', 'served', 'cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  payment_method text check (payment_method in ('cash', 'card', 'transfer', 'other')),
  total_amount integer not null check (total_amount >= 0),
  currency char(3) not null default 'RSD',
  note text check (note is null or length(note) <= 300),
  -- Secret the ordering device keeps to follow its own order without an account.
  guest_token text not null,
  fiscal_status text not null default 'none' check (fiscal_status in ('none', 'pending', 'sent', 'failed')),
  fiscal_ref text,
  fiscal_error text,
  fiscal_attempts integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  paid_by uuid references public.profiles (id) on delete set null,
  paid_at timestamptz,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (payment_status <> 'paid' or (payment_method is not null and paid_at is not null)),
  check (status <> 'cancelled' or payment_status = 'unpaid')
);
create trigger cafe_orders_updated_at before update on public.cafe_orders
  for each row execute function public.set_updated_at();
create index cafe_orders_open_idx on public.cafe_orders (created_at) where status not in ('served', 'cancelled');
create index cafe_orders_member_idx on public.cafe_orders (member_id, created_at desc);
create index cafe_orders_fiscal_idx on public.cafe_orders (created_at) where fiscal_status in ('pending', 'failed');
create sequence public.cafe_order_number_seq;

create table public.cafe_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.cafe_orders (id) on delete cascade,
  item_id uuid references public.cafe_items (id) on delete set null,
  name text not null,
  sku text,
  unit_price integer not null check (unit_price >= 0),
  qty integer not null check (qty between 1 and 50),
  line_total integer not null check (line_total >= 0)
);
create index cafe_order_items_order_idx on public.cafe_order_items (order_id);

insert into public.settings (key, value) values
  ('cafe.enabled', 'true'),
  -- 'none': orders only (fiscal receipt issued on the club's own POS by hand);
  -- 'webhook': each paid order is POSTed (HMAC signed) to cafe.pos_url for the POS/fiscal system.
  ('cafe.pos_mode', '"none"'),
  ('cafe.pos_url', 'null'),
  ('cafe.table_ordering', 'true')
on conflict (key) do nothing;

alter table public.cafe_categories enable row level security;
alter table public.cafe_items enable row level security;
alter table public.cafe_stock_movements enable row level security;
alter table public.cafe_tables enable row level security;
alter table public.cafe_orders enable row level security;
alter table public.cafe_order_items enable row level security;
revoke all on public.cafe_categories, public.cafe_items, public.cafe_stock_movements, public.cafe_tables,
  public.cafe_orders, public.cafe_order_items from anon, authenticated;
-- Everything goes through the API (the menu is public there; orders are checked per device/member).

insert into public.permissions (key, description) values
  ('cafe.manage', 'Edit the café menu, prices, stock, tables and POS settings'),
  ('cafe.orders', 'Take, prepare and charge café orders at the bar');
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r
join public.permissions p on p.key in ('cafe.manage', 'cafe.orders')
where r.key in ('owner', 'manager');
insert into public.role_permissions (role_id, permission_key)
select r.id, 'cafe.orders' from public.roles r where r.key in ('cafe_staff', 'reception');

-- [PROVIZORNO] starter menu so the screens are not empty; the owner replaces it in the admin.
with c as (
  insert into public.cafe_categories (sort_order, translations) values
    (10, '{"sr": {"name": "Kafa"}, "en": {"name": "Coffee"}, "ru": {"name": "Кофе"}, "ar": {"name": "القهوة"}}'),
    (20, '{"sr": {"name": "Šejkovi i napici"}, "en": {"name": "Shakes and drinks"}, "ru": {"name": "Коктейли и напитки"}, "ar": {"name": "المخفوقات والمشروبات"}}'),
    (30, '{"sr": {"name": "Užine"}, "en": {"name": "Snacks"}, "ru": {"name": "Перекусы"}, "ar": {"name": "وجبات خفيفة"}}')
  returning id, sort_order
)
insert into public.cafe_items (category_id, price_amount, sort_order, track_stock, stock_qty, translations)
select c.id, i.price, i.sort, i.track, i.stock, i.tr::jsonb
from c join (values
  (10, 20000, 10, false, 0, '{"sr": {"name": "[PROVIZORNO] Espresso"}, "en": {"name": "[PROVISIONAL] Espresso"}, "ru": {"name": "[ПРЕДВАРИТЕЛЬНО] Эспрессо"}, "ar": {"name": "[مؤقت] إسبريسو"}}'),
  (10, 28000, 20, false, 0, '{"sr": {"name": "[PROVIZORNO] Kapućino"}, "en": {"name": "[PROVISIONAL] Cappuccino"}, "ru": {"name": "[ПРЕДВАРИТЕЛЬНО] Капучино"}, "ar": {"name": "[مؤقت] كابتشينو"}}'),
  (20, 45000, 10, true, 30, '{"sr": {"name": "[PROVIZORNO] Proteinski šejk", "description": "Whey, banana, mleko"}, "en": {"name": "[PROVISIONAL] Protein shake", "description": "Whey, banana, milk"}, "ru": {"name": "[ПРЕДВАРИТЕЛЬНО] Протеиновый коктейль", "description": "Протеин, банан, молоко"}, "ar": {"name": "[مؤقت] مخفوق بروتين", "description": "بروتين، موز، حليب"}}'),
  (20, 25000, 20, true, 48, '{"sr": {"name": "[PROVIZORNO] Voda 0,5 l"}, "en": {"name": "[PROVISIONAL] Water 0.5 l"}, "ru": {"name": "[ПРЕДВАРИТЕЛЬНО] Вода 0,5 л"}, "ar": {"name": "[مؤقت] ماء 0.5 لتر"}}'),
  (30, 30000, 10, true, 24, '{"sr": {"name": "[PROVIZORNO] Proteinska pločica"}, "en": {"name": "[PROVISIONAL] Protein bar"}, "ru": {"name": "[ПРЕДВАРИТЕЛЬНО] Протеиновый батончик"}, "ar": {"name": "[مؤقت] لوح بروتين"}}')
) as i(cat, price, sort, track, stock, tr) on i.cat = c.sort_order;

insert into public.cafe_tables (label, code, sort_order) values
  ('Bašta 1', substr(md5(random()::text || clock_timestamp()::text), 1, 16), 10),
  ('Bašta 2', substr(md5(random()::text || clock_timestamp()::text), 1, 16), 20),
  ('Šank', substr(md5(random()::text || clock_timestamp()::text), 1, 16), 30);
