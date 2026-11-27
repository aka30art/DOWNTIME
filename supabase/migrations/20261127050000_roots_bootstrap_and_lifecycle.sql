-- Protected ROOTS registry with immutable DEV bootstrap identity and auditable lifecycle.
-- No DEV1 or ADMIN classifications are seeded by this migration.
create table if not exists public.downtime_roots_bootstrap (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique,
  created_at timestamptz not null default now()
);

alter table public.downtime_roots_bootstrap enable row level security;
revoke all on public.downtime_roots_bootstrap from public, anon, authenticated;
grant select on public.downtime_roots_bootstrap to service_role;
revoke insert, update, delete on public.downtime_roots_bootstrap from service_role;

do $bootstrap$
declare
  candidate_count integer;
  candidate_user_id uuid;
  existing_user_id uuid;
begin
  if to_regclass('public.downtime_central_bank') is null then
    raise exception 'Central Bank table is required before ROOTS bootstrap';
  end if;

  select count(*), (array_agg((user_record->>'userId')::uuid))[1]
    into candidate_count, candidate_user_id
    from public.downtime_central_bank b
    cross join lateral jsonb_array_elements(coalesce(b.payload->'users','[]'::jsonb)) as accounts(user_record)
   where upper(trim(coalesce(user_record->>'username',''))) = 'DEV'
     and upper(trim(coalesce(user_record->>'tier',''))) = 'OWNER'
     and coalesce((user_record->>'enabled')::boolean, true) = true
     and coalesce(user_record->>'userId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  if candidate_count <> 1 or candidate_user_id is null then
    raise exception 'ROOTS bootstrap requires exactly one enabled immutable DEV USER with a valid UUID';
  end if;

  insert into public.downtime_roots_bootstrap(singleton,user_id)
  values(true,candidate_user_id)
  on conflict(singleton) do nothing;

  select user_id into existing_user_id
    from public.downtime_roots_bootstrap where singleton = true;
  if existing_user_id is distinct from candidate_user_id then
    raise exception 'Existing immutable DEV bootstrap identity does not match the Central Bank DEV USER';
  end if;
end;
$bootstrap$;

alter table public.downtime_roots_assignments
  add column if not exists status text not null default 'ACTIVE'
    check (status in ('ACTIVE','REVOKED'));
alter table public.downtime_roots_assignments
  add column if not exists version integer not null default 1 check (version > 0);
alter table public.downtime_roots_assignments
  add column if not exists revoked_at timestamptz;
alter table public.downtime_roots_assignments
  add column if not exists updated_at timestamptz not null default now();

alter table public.downtime_roots_assignment_audit
  drop constraint if exists downtime_roots_assignment_audit_action_check;
alter table public.downtime_roots_assignment_audit
  add constraint downtime_roots_assignment_audit_action_check
  check (action in ('ROOTS_DEV1_ASSIGNED','ROOTS_ADMIN_ASSIGNED','ROOTS_RECLASSIFIED','ROOTS_REVOKED'));

-- Assignment rows are managed only by the version-checked SECURITY DEFINER RPC below.
-- Audit rows remain append-only, and no application role receives direct table DML.
drop trigger if exists downtime_roots_assignment_immutable on public.downtime_roots_assignments;
revoke insert, update, delete on public.downtime_roots_assignments from service_role;

create or replace function public.downtime_roots_manage_identity(
  p_user_id uuid,
  p_staff_id uuid,
  p_roots_class text,
  p_action text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_username text,
  p_actor_display_name text
) returns jsonb
language plpgsql security definer set search_path = public
as $manage$
declare
  v_assignment public.downtime_roots_assignments%rowtype;
  v_previous_class text;
  v_next_class text;
  v_audit_action text;
begin
  if p_user_id is null or p_staff_id is null or p_user_id = p_staff_id
     or p_action not in ('ASSIGN','RECLASSIFY','REVOKE')
     or coalesce(trim(p_actor_username),'') = ''
     or p_actor_user_id is null
     or coalesce(trim(p_actor_display_name),'') = '' then
    raise exception 'Invalid protected ROOTS lifecycle request';
  end if;
  if p_action in ('ASSIGN','RECLASSIFY') and p_roots_class not in ('DEV1','ADMIN') then
    raise exception 'A protected DEV1 or ADMIN classification is required';
  end if;

  select * into v_assignment
    from public.downtime_roots_assignments
   where user_id = p_user_id or staff_id = p_staff_id
   for update;

  if not found then
    if p_action <> 'ASSIGN' then raise exception 'Protected ROOTS assignment does not exist'; end if;
    insert into public.downtime_roots_assignments
      (user_id,staff_id,roots_class,status,version,assigned_by_user_id,assigned_by_username,assigned_by_display_name)
    values
      (p_user_id,p_staff_id,p_roots_class,'ACTIVE',1,p_actor_user_id,trim(p_actor_username),trim(p_actor_display_name))
    returning * into v_assignment;
    v_previous_class := null;
    v_next_class := p_roots_class;
    v_audit_action := case p_roots_class when 'DEV1' then 'ROOTS_DEV1_ASSIGNED' else 'ROOTS_ADMIN_ASSIGNED' end;
  else
    if v_assignment.user_id <> p_user_id or v_assignment.staff_id <> p_staff_id then
      raise exception 'USER and STAFF IDs are already linked to a different protected ROOTS identity';
    end if;
    v_previous_class := v_assignment.roots_class;

    if p_action = 'ASSIGN' then
      if v_assignment.status = 'ACTIVE' and v_assignment.roots_class = p_roots_class then
        return jsonb_build_object('user_id',v_assignment.user_id,'staff_id',v_assignment.staff_id,
          'roots_class',v_assignment.roots_class,'status',v_assignment.status,'version',v_assignment.version,'replayed',true);
      end if;
      if v_assignment.status = 'ACTIVE' then
        raise exception 'An active ROOTS classification already exists; use an authorised reclassification';
      end if;
      if p_expected_version is null or p_expected_version <> v_assignment.version then
        raise exception 'ROOTS_ASSIGNMENT_VERSION_CONFLICT';
      end if;
      update public.downtime_roots_assignments
         set roots_class=p_roots_class,status='ACTIVE',version=version+1,revoked_at=null,
             assigned_by_user_id=p_actor_user_id,assigned_by_username=trim(p_actor_username),
             assigned_by_display_name=trim(p_actor_display_name),updated_at=now()
       where id=v_assignment.id returning * into v_assignment;
      v_next_class := p_roots_class;
      v_audit_action := case p_roots_class when 'DEV1' then 'ROOTS_DEV1_ASSIGNED' else 'ROOTS_ADMIN_ASSIGNED' end;

    elsif p_action = 'RECLASSIFY' then
      if v_assignment.status <> 'ACTIVE' then raise exception 'Only an active ROOTS identity can be reclassified'; end if;
      if p_expected_version is null or p_expected_version <> v_assignment.version then
        raise exception 'ROOTS_ASSIGNMENT_VERSION_CONFLICT';
      end if;
      if v_assignment.roots_class = p_roots_class then
        return jsonb_build_object('user_id',v_assignment.user_id,'staff_id',v_assignment.staff_id,
          'roots_class',v_assignment.roots_class,'status',v_assignment.status,'version',v_assignment.version,'replayed',true);
      end if;
      update public.downtime_roots_assignments
         set roots_class=p_roots_class,version=version+1,assigned_by_user_id=p_actor_user_id,
             assigned_by_username=trim(p_actor_username),assigned_by_display_name=trim(p_actor_display_name),updated_at=now()
       where id=v_assignment.id returning * into v_assignment;
      v_next_class := p_roots_class;
      v_audit_action := 'ROOTS_RECLASSIFIED';

    else
      if v_assignment.status = 'REVOKED' then
        return jsonb_build_object('user_id',v_assignment.user_id,'staff_id',v_assignment.staff_id,
          'roots_class',v_assignment.roots_class,'status',v_assignment.status,'version',v_assignment.version,'replayed',true);
      end if;
      if p_expected_version is null or p_expected_version <> v_assignment.version then
        raise exception 'ROOTS_ASSIGNMENT_VERSION_CONFLICT';
      end if;
      update public.downtime_roots_assignments
         set status='REVOKED',version=version+1,revoked_at=now(),
             assigned_by_user_id=p_actor_user_id,assigned_by_username=trim(p_actor_username),
             assigned_by_display_name=trim(p_actor_display_name),updated_at=now()
       where id=v_assignment.id returning * into v_assignment;
      v_next_class := v_assignment.roots_class;
      v_audit_action := 'ROOTS_REVOKED';
    end if;
  end if;

  insert into public.downtime_roots_assignment_audit
    (assignment_id,user_id,staff_id,roots_class,actor_user_id,actor_username,actor_display_name,action)
  values
    (v_assignment.id,p_user_id,p_staff_id,v_next_class,p_actor_user_id,trim(p_actor_username),trim(p_actor_display_name),v_audit_action);

  return jsonb_build_object('user_id',v_assignment.user_id,'staff_id',v_assignment.staff_id,
    'roots_class',v_assignment.roots_class,'status',v_assignment.status,'version',v_assignment.version,'replayed',false,
    'previous_roots_class',v_previous_class);
end;
$manage$;

revoke all on function public.downtime_roots_manage_identity(uuid,uuid,text,text,integer,uuid,text,text) from public, anon, authenticated;
grant execute on function public.downtime_roots_manage_identity(uuid,uuid,text,text,integer,uuid,text,text) to service_role;

create or replace function public.downtime_roots_assign_identity(
  p_user_id uuid,p_staff_id uuid,p_roots_class text,p_actor_user_id uuid,p_actor_username text,p_actor_display_name text
) returns jsonb
language sql security definer set search_path = public
as $assign$
  select public.downtime_roots_manage_identity(
    p_user_id,p_staff_id,p_roots_class,'ASSIGN',null,p_actor_user_id,p_actor_username,p_actor_display_name
  );
$assign$;

revoke all on function public.downtime_roots_assign_identity(uuid,uuid,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.downtime_roots_assign_identity(uuid,uuid,text,uuid,text,text) to service_role;

comment on table public.downtime_roots_bootstrap is 'Single immutable DEV USER identity. Its ID is captured once from the existing Central Bank record.';
comment on table public.downtime_roots_assignments is 'Protected DEV1/ADMIN assignment with revocation and reclassification lifecycle; direct DML is denied.';
comment on table public.downtime_roots_assignment_audit is 'Append-only audit of ROOTS assignment, reclassification and revocation events.';
