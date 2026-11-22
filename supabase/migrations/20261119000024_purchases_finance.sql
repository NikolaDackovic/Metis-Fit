-- Purchasing and costs: suppliers, incoming invoices and a monthly income / cost overview.
-- An invoice line is either goods for the café (it raises that item's stock, recorded as a
-- 'restock' movement) or a cost (rent, utilities, equipment…). Voiding an invoice takes its
-- goods back out of stock (only if they are still there). Money in minor units (para).

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  tax_id text check (tax_id is null or length(tax_id) <= 20), -- PIB
  contact text check (contact is null or length(contact) <= 200),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  number text not null check (length(trim(number)) between 1 and 60),
  issued_on date not null,
  due_on date,
  total_amount integer not null check (total_amount >= 0),
  currency char(3) not null default 'RSD',
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'void')),
  paid_on date,
  payment_method text check (payment_method in ('cash', 'card', 'bank_transfer', 'other')),
  note text check (note is null or length(note) <= 500),
  void_reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (supplier_id, number),
  check (due_on is null or due_on >= issued_on),
  check (status <> 'paid' or paid_on is not null)
);
create index purchase_invoices_issued_idx on public.purchase_invoices (issued_on desc);

create table public.purchase_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.purchase_invoices (id) on delete cascade,
  kind text not null check (kind in ('stock', 'expense')),
  cafe_item_id uuid references public.cafe_items (id) on delete set null,
  category text check (category in ('goods', 'rent', 'utilities', 'equipment', 'maintenance', 'supplies', 'services', 'marketing', 'salaries', 'other')),
  description text not null check (length(trim(description)) between 1 and 200),
  qty numeric(10, 2) not null check (qty > 0),
  unit_cost integer not null check (unit_cost >= 0),
  line_total integer not null check (line_total >= 0),
  check (kind <> 'stock' or (cafe_item_id is not null and qty = trunc(qty)))
);
create index purchase_invoice_lines_invoice_idx on public.purchase_invoice_lines (invoice_id);

alter table public.suppliers enable row level security;
alter table public.purchase_invoices enable row level security;
alter table public.purchase_invoice_lines enable row level security;
revoke all on public.suppliers, public.purchase_invoices, public.purchase_invoice_lines from anon, authenticated;

insert into public.permissions (key, description) values
  ('purchases.manage', 'Enter incoming invoices, suppliers and goods received'),
  ('finance.read', 'See the monthly income and cost overview');
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r
join public.permissions p on p.key in ('purchases.manage', 'finance.read')
where r.key in ('owner', 'manager');
