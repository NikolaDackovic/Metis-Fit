-- Business documents (replaces the first purchases model from 024, which held no real data):
--  * partners (komitenti): suppliers and/or customers, with PIB and registry number
--  * documents: incoming invoices (goods in, costs, input VAT) and outgoing invoices
--    (goods out, income, output VAT). Lines carry unit, quantity, net unit price, discount
--    and VAT rate; a line linked to a café item moves its stock.
--  * stock counts (popis): counted quantity vs. the system, the difference is booked.
-- Money in minor units (para). Also: starter data no longer carries the "[PROVIZORNO]" marker
-- in visible text (the owner edits names, prices and descriptions in the admin).

drop table if exists public.purchase_invoice_lines;
drop table if exists public.purchase_invoices;
drop table if exists public.suppliers;

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  tax_id text check (tax_id is null or tax_id ~ '^[0-9]{9}$'), -- PIB
  registry_no text check (registry_no is null or registry_no ~ '^[0-9]{8}$'), -- matični broj
  city text check (city is null or length(city) <= 80),
  address text check (address is null or length(address) <= 200),
  contact text check (contact is null or length(contact) <= 200),
  email text check (email is null or length(email) <= 200),
  phone text check (phone is null or length(phone) <= 40),
  is_supplier boolean not null default true,
  is_customer boolean not null default false,
  is_active boolean not null default true,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  check (is_supplier or is_customer)
);
create unique index partners_tax_id_key on public.partners (tax_id) where tax_id is not null;

create table public.business_documents (
  id uuid primary key default gen_random_uuid(),
  internal_no integer generated always as identity,
  kind text not null check (kind in ('incoming_invoice', 'outgoing_invoice')),
  partner_id uuid not null references public.partners (id) on delete restrict,
  number text not null check (length(trim(number)) between 1 and 60),
  turnover_on date not null, -- datum prometa
  due_on date, -- datum valute
  net_amount integer not null default 0, -- after discount, without VAT (osnovica)
  discount_amount integer not null default 0,
  vat_amount integer not null default 0,
  total_amount integer not null default 0 check (total_amount >= 0), -- with VAT
  currency char(3) not null default 'RSD',
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'void')),
  paid_on date,
  payment_method text check (payment_method in ('cash', 'card', 'bank_transfer', 'other')),
  note text check (note is null or length(note) <= 500),
  internal_note text check (internal_note is null or length(internal_note) <= 500),
  void_reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (kind, partner_id, number),
  check (due_on is null or due_on >= turnover_on),
  check (status <> 'paid' or paid_on is not null)
);
create index business_documents_turnover_idx on public.business_documents (turnover_on desc);
create index business_documents_partner_idx on public.business_documents (partner_id, turnover_on);

create table public.business_document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.business_documents (id) on delete cascade,
  position smallint not null,
  cafe_item_id uuid references public.cafe_items (id) on delete set null,
  category text not null default 'goods'
    check (category in ('goods', 'rent', 'utilities', 'equipment', 'maintenance', 'supplies', 'services', 'marketing', 'salaries', 'other')),
  name text not null check (length(trim(name)) between 1 and 200),
  unit text not null default 'kom' check (unit in ('kom', 'kg', 'g', 'l', 'ml', 'm', 'pak', 'h')),
  qty numeric(12, 3) not null check (qty > 0),
  unit_price integer not null check (unit_price >= 0), -- net, before discount
  discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  vat_rate numeric(5, 2) not null default 20 check (vat_rate between 0 and 100),
  net_amount integer not null,
  vat_amount integer not null,
  total_amount integer not null,
  check (cafe_item_id is null or qty = trunc(qty))
);
create index business_document_lines_doc_idx on public.business_document_lines (document_id, position);

create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  counted_on date not null,
  note text check (note is null or length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.stock_count_lines (
  count_id uuid not null references public.stock_counts (id) on delete cascade,
  cafe_item_id uuid not null references public.cafe_items (id) on delete cascade,
  system_qty integer not null,
  counted_qty integer not null check (counted_qty >= 0),
  primary key (count_id, cafe_item_id)
);

alter table public.partners enable row level security;
alter table public.business_documents enable row level security;
alter table public.business_document_lines enable row level security;
alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;
revoke all on public.partners, public.business_documents, public.business_document_lines,
  public.stock_counts, public.stock_count_lines from anon, authenticated;

update public.permissions
   set description = 'Partners, incoming and outgoing invoices, goods in and out, stock counts'
 where key = 'purchases.manage';

-- Starter data: drop the "[PROVIZORNO]" marker from everything members and staff see.
create or replace function pg_temp.unmark(t text) returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(t, '\[(PROVIZORNO|PROVISIONAL|ПРЕДВАРИТЕЛЬНО)\]\s*', '', 'g')), '')
$$;
update public.membership_plan_translations set description = null
 where description like '[PROVIZORNO] Cena i uslovi nisu konačni.%';
update public.membership_plan_translations set description = pg_temp.unmark(description)
 where description ~ '\[(PROVIZORNO|PROVISIONAL|ПРЕДВАРИТЕЛЬНО)\]';
update public.class_type_translations set description = pg_temp.unmark(description)
 where description ~ '\[(PROVIZORNO|PROVISIONAL|ПРЕДВАРИТЕЛЬНО)\]';
update public.trainer_translations set bio = pg_temp.unmark(bio)
 where bio ~ '\[(PROVIZORNO|PROVISIONAL|ПРЕДВАРИТЕЛЬНО)\]';
update public.map_versions set note = pg_temp.unmark(note)
 where note ~ '\[(PROVIZORNO|PROVISIONAL|ПРЕДВАРИТЕЛЬНО)\]';
update public.cafe_items set translations = pg_temp.unmark(translations::text)::jsonb
 where translations::text ~ '\[(PROVIZORNO|PROVISIONAL|ПРЕДВАРИТЕЛЬНО)\]';
update public.services set translations = pg_temp.unmark(translations::text)::jsonb
 where translations::text ~ '\[(PROVIZORNO|PROVISIONAL|ПРЕДВАРИТЕЛЬНО)\]';
update public.loyalty_rewards set translations = pg_temp.unmark(translations::text)::jsonb
 where translations::text ~ '\[(PROVIZORNO|PROVISIONAL|ПРЕДВАРИТЕЛЬНО)\]';
