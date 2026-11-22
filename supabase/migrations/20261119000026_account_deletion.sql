-- Account deletion from the app (Apple App Store rule, ZZPL/GDPR right to erasure).
-- The member row stays (payments, memberships and visits must be kept for the books), but its
-- personal fields are anonymized; the login account and profile are deleted.
--
-- Audit logs stay append-only. The one change now allowed: when a profile is deleted, its
-- reference in old log entries is cleared (actor_id -> null); nothing else in a row may change.

create or replace function public.audit_logs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.actor_id is not null and new.actor_id is null
     and (new.id, new.actor_roles, new.action, new.entity_type, new.entity_id, new.diff::text,
          new.ip, new.user_agent, new.request_id, new.occurred_at)
         is not distinct from
         (old.id, old.actor_roles, old.action, old.entity_type, old.entity_id, old.diff::text,
          old.ip, old.user_agent, old.request_id, old.occurred_at) then
    return new;
  end if;
  raise exception '% on % is not allowed (append-only table)', tg_op, tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.audit_logs_guard();

alter table public.members add column anonymized_at timestamptz;

-- An anonymized member keeps no contact data.
alter table public.members drop constraint members_contact_required;
alter table public.members add constraint members_contact_required
  check (anonymized_at is not null or email is not null or phone is not null);
