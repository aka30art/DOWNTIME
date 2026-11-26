-- Separate protected ROOTS identity assignments.
-- No classifications are seeded. Legacy OWNER/DEVACC/ADMIN tiers never imply ROOTS.
create table if not exists public.downtime_roots_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  staff_id uuid not null unique,
  roots_class text not null check (roots_class in ('DEV1', 'ADMIN')),
  assigned_by_user_id uuid,
  assigned_by_username text not null,
  assigned_by_display_name text not null,
  created_at timestamptz not null default now(),
  constraint downtime_roots_identity_ids_distinct check (user_id <> staff_id)
);

create table if not exists public.downtime_roots_assignment_audit (
  id bigint generated always as identity primary key,
  assignment_id uuid not null references public.downtime_roots_assignments(id) on delete restrict,
  user_id uuid not null,
  staff_id uuid not null,
  roots_class text not null check (roots_class in ('DEV1', 'ADMIN')),
  actor_user_id uuid,
  actor_username text not null,
  actor_display_name text not null,
  action text not null check (action in ('ROOTS_DEV1_ASSIGNED', 'ROOTS_ADMIN_ASSIGNED')),
  created_at timestamptz not null default now()
);

alter table public.downtime_roots_assignments enable row level security;
alter table public.downtime_roots_assignment_audit enable row level security;
revoke all on public.downtime_roots_assignments from public, anon, authenticated;
revoke all on public.downtime_roots_assignment_audit from public, anon, authenticated;
grant select on public.downtime_roots_assignments to service_role;
grant select on public.downtime_roots_assignment_audit to service_role;
revoke insert, update, delete on public.downtime_roots_assignments from service_role;
revoke insert, update, delete on public.downtime_roots_assignment_audit from service_role;

create or replace function public.prevent_downtime_roots_assignment_mutation()
returns trigger language plpgsql security definer set search_path = public
as $
begin
  raise exception 'ROOTS assignments are immutable; use a separately reviewed lifecycle operation';
end;
$;

drop trigger if exists downtime_roots_assignment_immutable on public.downtime_roots_assignments;
create trigger downtime_roots_assignment_immutable
before update or delete on public.downtime_roots_assignments
for each row execute function public.prevent_downtime_roots_assignment_mutation();

create or replace function public.prevent_downtime_roots_audit_mutation()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  raise exception 'ROOTS assignment audit records are immutable';
end;
$$;

drop trigger if exists downtime_roots_assignment_audit_immutable on public.downtime_roots_assignment_audit;
create trigger downtime_roots_assignment_audit_immutable
before update or delete on public.downtime_roots_assignment_audit
for each row execute function public.prevent_downtime_roots_audit_mutation();

create or replace function public.downtime_roots_assign_identity(
  p_user_id uuid,
  p_staff_id uuid,
  p_roots_class text,
  p_actor_user_id uuid,
  p_actor_username text,
  p_actor_display_name text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_assignment public.downtime_roots_assignments%rowtype;
  v_action text;
begin
  if p_user_id is null or p_staff_id is null or p_user_id = p_staff_id
     or p_roots_class is null or p_roots_class not in ('DEV1', 'ADMIN')
     or coalesce(trim(p_actor_username), '') = ''
     or (p_actor_user_id is null and upper(trim(p_actor_username)) <> 'DEV')
     or coalesce(trim(p_actor_display_name), '') = '' then
    raise exception 'Invalid protected ROOTS assignment request';
  end if;

  v_action := case p_roots_class
    when 'DEV1' then 'ROOTS_DEV1_ASSIGNED'
    else 'ROOTS_ADMIN_ASSIGNED'
  end;

  insert into public.downtime_roots_assignments
    (user_id, staff_id, roots_class, assigned_by_user_id, assigned_by_username, assigned_by_display_name)
  values
    (p_user_id, p_staff_id, p_roots_class, p_actor_user_id, trim(p_actor_username), trim(p_actor_display_name))
  on conflict do nothing
  returning * into v_assignment;

  if not found then
    select * into v_assignment
      from public.downtime_roots_assignments
     where user_id = p_user_id or staff_id = p_staff_id
     for update;
    if not found or v_assignment.user_id <> p_user_id
       or v_assignment.staff_id <> p_staff_id
       or v_assignment.roots_class <> p_roots_class then
      raise exception 'USER or STAFF already has a different protected ROOTS assignment';
    end if;
    return jsonb_build_object(
      'user_id', v_assignment.user_id,
      'staff_id', v_assignment.staff_id,
      'roots_class', v_assignment.roots_class,
      'replayed', true
    );
  end if;

  insert into public.downtime_roots_assignment_audit
    (assignment_id, user_id, staff_id, roots_class, actor_user_id, actor_username, actor_display_name, action)
  values
    (v_assignment.id, p_user_id, p_staff_id, p_roots_class, p_actor_user_id,
     trim(p_actor_username), trim(p_actor_display_name), v_action);

  return jsonb_build_object(
    'user_id', v_assignment.user_id,
    'staff_id', v_assignment.staff_id,
    'roots_class', v_assignment.roots_class,
    'replayed', false
  );
end;
$$;

revoke all on function public.downtime_roots_assign_identity(uuid, uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.downtime_roots_assign_identity(uuid, uuid, text, uuid, text, text) to service_role;

comment on table public.downtime_roots_assignments is
  'Hidden protected ROOTS assignments linked to immutable USER and STAFF IDs. Not an ordinary YARD ROLE and never inferred from legacy tiers.';
comment on table public.downtime_roots_assignment_audit is
  'Immutable audit of DEV/DEV1-authorised protected ROOTS assignments.';
