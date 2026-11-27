-- Enforce the four approved hierarchical YARD ROLE access levels at the database boundary.
-- Legacy rows are not rewritten; invalid rows fail closed in the resolver until an authorised ROOT repairs them.
create or replace function public.enforce_yard_role_access_level()
returns trigger
language plpgsql
set search_path = public
as $access$
begin
  if not (
    (new.can_view = false and new.can_enter = false and new.can_edit = false and new.can_manage = false)
    or (new.can_view = true and new.can_enter = false and new.can_edit = false and new.can_manage = false)
    or (new.can_view = true and new.can_enter = true and new.can_edit = false and new.can_manage = false)
    or (new.can_view = true and new.can_enter = true and new.can_edit = true and new.can_manage = true)
  ) then
    raise exception 'YARD ROLE department access must be OFF, READ ONLY, INPUT or MANAGE';
  end if;
  return new;
end;
$access$;

drop trigger if exists yard_role_access_level_guard on public.yard_role_department_permissions;
create trigger yard_role_access_level_guard
before insert or update on public.yard_role_department_permissions
for each row execute function public.enforce_yard_role_access_level();

comment on table public.yard_role_department_permissions is
  'Each YARD ROLE department has one hierarchical access level: OFF, READ ONLY, INPUT or MANAGE.';
