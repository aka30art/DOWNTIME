-- Canonical YARD ROLE registry and staged USER provisioning assignments.
-- The owner-approved role names/catalogue are intentionally not seeded here.
-- ROOTS identities remain separate and are never represented in these tables.

create table if not exists public.yard_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'RETIRED')),
  version integer not null default 1 check (version > 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists yard_roles_name_ci_uidx
  on public.yard_roles (lower(name));

create table if not exists public.yard_role_department_permissions (
  yard_role_id uuid not null references public.yard_roles(id) on delete restrict,
  department text not null check (department in ('SCPL', 'R&M', 'Management', 'SCFL', 'Traffic')),
  access_level text not null check (access_level in ('OFF', 'READ_ONLY', 'INPUT', 'MANAGE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (yard_role_id, department)
);

create table if not exists public.yard_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  staff_id uuid not null unique,
  yard_role_id uuid not null references public.yard_roles(id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  version integer not null default 1 check (version > 0),
  verified_at timestamptz not null default now(),
  assigned_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.yard_role_assignment_audit (
  id bigint generated always as identity primary key,
  assignment_id uuid not null references public.yard_role_assignments(id) on delete restrict,
  user_id uuid not null,
  staff_id uuid not null,
  yard_role_id uuid not null,
  actor_username text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.yard_roles enable row level security;
alter table public.yard_role_department_permissions enable row level security;
alter table public.yard_role_assignments enable row level security;
alter table public.yard_role_assignment_audit enable row level security;

revoke all on public.yard_roles from anon, authenticated;
revoke all on public.yard_role_department_permissions from anon, authenticated;
revoke all on public.yard_role_assignments from anon, authenticated;
revoke all on public.yard_role_assignment_audit from anon, authenticated;
grant all on public.yard_roles to service_role;
grant all on public.yard_role_department_permissions to service_role;
grant all on public.yard_role_assignments to service_role;
grant all on public.yard_role_assignment_audit to service_role;
grant usage, select on sequence public.yard_role_assignment_audit_id_seq to service_role;

create or replace function public.yard_role_assign_user(
  p_user_id uuid,
  p_staff_id uuid,
  p_yard_role_id uuid,
  p_actor text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.yard_roles%rowtype;
  v_assignment public.yard_role_assignments%rowtype;
  v_permission_count integer := 0;
  v_inserted boolean := false;
begin
  if p_user_id is null or p_staff_id is null or p_yard_role_id is null
     or p_user_id = p_staff_id or coalesce(trim(p_actor), '') = '' then
    raise exception 'Invalid USER/STAFF/YARD ROLE assignment request';
  end if;

  select * into v_role
    from public.yard_roles
   where id = p_yard_role_id and status = 'ACTIVE';
  if not found then
    raise exception 'Canonical YARD ROLE is missing or inactive';
  end if;
  select count(*) into v_permission_count
    from public.yard_role_department_permissions
   where yard_role_id = p_yard_role_id;
  if v_permission_count <> 5 then
    raise exception 'Canonical YARD ROLE requires exactly one permission for each approved department';
  end if;

  insert into public.yard_role_assignments
    (user_id, staff_id, yard_role_id, status, version, verified_at, assigned_by)
  values
    (p_user_id, p_staff_id, p_yard_role_id, 'ACTIVE', 1, now(), trim(p_actor))
  on conflict (user_id) do nothing
  returning * into v_assignment;

  if found then
    v_inserted := true;
    insert into public.yard_role_assignment_audit
      (assignment_id, user_id, staff_id, yard_role_id, actor_username, action, details)
    values
      (v_assignment.id, p_user_id, p_staff_id, p_yard_role_id, trim(p_actor),
       'USER_YARD_ROLE_ASSIGNED',
       jsonb_build_object('version', v_assignment.version, 'role_name', v_role.name));
  else
    select * into v_assignment
      from public.yard_role_assignments
     where user_id = p_user_id
     for update;

    if not found
       or v_assignment.staff_id <> p_staff_id
       or v_assignment.yard_role_id <> p_yard_role_id
       or v_assignment.status <> 'ACTIVE' then
      raise exception 'USER already has a different or inactive YARD ROLE assignment';
    end if;
  end if;

  return jsonb_build_object(
    'user_id', v_assignment.user_id,
    'staff_id', v_assignment.staff_id,
    'yard_role_id', v_assignment.yard_role_id,
    'status', v_assignment.status,
    'version', v_assignment.version,
    'verified_at', v_assignment.verified_at,
    'replayed', not v_inserted
  );
end;
$$;

revoke all on function public.yard_role_assign_user(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.yard_role_assign_user(uuid, uuid, uuid, text) to service_role;

comment on table public.yard_roles is 'Canonical ordinary YARD ROLE registry. ROOTS classifications are separate.';
comment on table public.yard_role_department_permissions is 'One mutually exclusive OFF, READ_ONLY, INPUT or MANAGE level per YARD ROLE and department.';
comment on table public.yard_role_assignments is 'Canonical USER-to-YARD ROLE assignment used by staged USER provisioning.';
comment on table public.yard_role_assignment_audit is 'Append-only audit for canonical YARD ROLE assignment changes.';



-- Prevent mutation of the assignment audit trail, including by service-role callers.
create or replace function public.prevent_yard_role_assignment_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $
begin
  raise exception 'YARD ROLE assignment audit records are immutable';
end;
$;

drop trigger if exists yard_role_assignment_audit_immutable on public.yard_role_assignment_audit;
create trigger yard_role_assignment_audit_immutable
before update or delete on public.yard_role_assignment_audit
for each row execute function public.prevent_yard_role_assignment_audit_mutation();

-- Atomically compare-and-swap the Central Bank payload and append its immutable audit event.
create or replace function public.downtime_central_commit_identity_event(
  p_expected_version bigint,
  p_payload jsonb,
  p_actor_username text,
  p_action text,
  p_details jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_version bigint;
  v_next_version bigint;
begin
  if p_expected_version is null or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or coalesce(trim(p_actor_username), '') = ''
     or p_action not in ('USER_STAFF_PROVISIONING_STARTED', 'USER_STAFF_PROVISIONING_ACTIVATED') then
    raise exception 'Invalid Central identity commit request';
  end if;

  select version into v_current_version
    from public.downtime_central_bank
   where id = 1
   for update;
  if not found then raise exception 'Central Bank row is missing'; end if;
  if v_current_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;

  v_next_version := v_current_version + 1;
  update public.downtime_central_bank
     set payload = p_payload, version = v_next_version, updated_at = now()
   where id = 1;

  insert into public.downtime_central_audit (username, action, details)
  values (trim(p_actor_username), p_action, coalesce(p_details, '{}'::jsonb));

  return jsonb_build_object('version', v_next_version);
end;
$$;

revoke all on function public.downtime_central_commit_identity_event(bigint, jsonb, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.downtime_central_commit_identity_event(bigint, jsonb, text, text, jsonb) to service_role;
