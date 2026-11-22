-- Erasing a member on request (in person at the desk): owner and manager.
insert into public.permissions (key, description) values
  ('members.erase', 'Erase a member''s personal data on request (bookkeeping kept anonymized)');
insert into public.role_permissions (role_id, permission_key)
select r.id, 'members.erase' from public.roles r where r.key in ('owner', 'manager');
