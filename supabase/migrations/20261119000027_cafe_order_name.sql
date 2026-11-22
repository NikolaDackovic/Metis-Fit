-- Café orders show who ordered: the member's name (orders from the app or a signed-in member
-- at a table) or, for guests without an account, the name they type in (optional).
alter table public.cafe_orders
  add column guest_name text check (guest_name is null or length(trim(guest_name)) between 1 and 60);
