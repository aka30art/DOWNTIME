-- Append-only ROOTS lifecycle: revocation and reclassification are new audited events.
alter table public.downtime_roots_assignment_audit
  drop constraint if exists downtime_roots_assignment_audit_action_check;
alter table public.downtime_roots_assignment_audit
  add constraint downtime_roots_assignment_audit_action_check
  check (action in (
    'ROOTS_DEV1_ASSIGNED',
    'ROOTS_ADMIN_ASSIGNED',
    'ROOTS_RECLASSIFIED',
    'ROOTS_REVOKED',
    'ROOTS_RESTORED'
  ));

create or replace view public.downtime_roots_effective_assignments
with (security_barrier=true,security_invoker=true)
as
select
  assignment.id,
  assignment.user_id,
  assignment.staff_id,
  latest.roots_class,
  'ACTIVE'::text as status,
  assignment.assigned_by_username,
  assignment.created_at,
  latest.created_at as changed_at
from public.downtime_roots_assignments assignment
cross join lateral (
  select event.roots_class,event.action,event.created_at
  from public.downtime_roots_assignment_audit event
  where event.assignment_id=assignment.id
  order by event.created_at desc,event.id desc
  limit 1
) latest
where latest.action <> 'ROOTS_REVOKED';

revoke all on public.downtime_roots_effective_assignments from public, anon, authenticated;
grant select on public.downtime_roots_effective_assignments to service_role;

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
  v_latest record;
  v_action text;
begin
  if p_user_id is null or p_staff_id is null or p_user_id=p_staff_id
     or p_roots_class is null or p_roots_class not in ('DEV1','ADMIN')
     or p_actor_user_id is null
     or upper(trim(coalesce(p_actor_username,''))) not in ('DEV','DEV1')
     or coalesce(trim(p_actor_display_name),'')='' then
    raise exception 'Invalid protected ROOTS assignment request';
  end if;

  v_action := case p_roots_class when 'DEV1' then 'ROOTS_DEV1_ASSIGNED' else 'ROOTS_ADMIN_ASSIGNED' end;
  insert into public.downtime_roots_assignments
    (user_id,staff_id,roots_class,assigned_by_user_id,assigned_by_username,assigned_by_display_name)
  values
    (p_user_id,p_staff_id,p_roots_class,p_actor_user_id,trim(p_actor_username),trim(p_actor_display_name))
  on conflict do nothing
  returning * into v_assignment;

  if found then
    insert into public.downtime_roots_assignment_audit
      (assignment_id,user_id,staff_id,roots_class,actor_user_id,actor_username,actor_display_name,action)
    values
      (v_assignment.id,p_user_id,p_staff_id,p_roots_class,p_actor_user_id,trim(p_actor_username),trim(p_actor_display_name),v_action);
    return jsonb_build_object('user_id',p_user_id,'staff_id',p_staff_id,'roots_class',p_roots_class,'status','ACTIVE','replayed',false);
  end if;

  select * into v_assignment
    from public.downtime_roots_assignments
   where user_id=p_user_id or staff_id=p_staff_id
   for update;
  if not found or v_assignment.user_id<>p_user_id or v_assignment.staff_id<>p_staff_id then
    raise exception 'USER or STAFF already has a different protected ROOTS assignment';
  end if;

  select action,roots_class into v_latest
    from public.downtime_roots_assignment_audit
   where assignment_id=v_assignment.id
   order by created_at desc,id desc
   limit 1;
  if not found then raise exception 'ROOTS assignment lifecycle history is unavailable'; end if;
  if v_latest.action='ROOTS_REVOKED' then
    if v_latest.roots_class<>p_roots_class then
      raise exception 'A revoked ROOTS identity must be restored to its previous class before reclassification';
    end if;
    insert into public.downtime_roots_assignment_audit
      (assignment_id,user_id,staff_id,roots_class,actor_user_id,actor_username,actor_display_name,action)
    values
      (v_assignment.id,p_user_id,p_staff_id,p_roots_class,p_actor_user_id,trim(p_actor_username),trim(p_actor_display_name),'ROOTS_RESTORED');
    return jsonb_build_object('user_id',p_user_id,'staff_id',p_staff_id,'roots_class',p_roots_class,'status','ACTIVE','replayed',false);
  end if;
  if v_latest.roots_class<>p_roots_class then
    raise exception 'USER already has a different protected ROOTS class; use the DEV-only reclassification action';
  end if;
  return jsonb_build_object('user_id',p_user_id,'staff_id',p_staff_id,'roots_class',p_roots_class,'status','ACTIVE','replayed',true);
end;
$$;

create or replace function public.downtime_roots_revoke_identity(
  p_user_id uuid,
  p_actor_user_id uuid,
  p_actor_username text,
  p_actor_display_name text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_assignment public.downtime_roots_assignments%rowtype;
  v_latest record;
begin
  if p_user_id is null or p_actor_user_id is null
     or upper(trim(coalesce(p_actor_username,'')))<>'DEV'
     or coalesce(trim(p_actor_display_name),'')='' then
    raise exception 'Only immutable DEV may revoke a protected ROOTS assignment';
  end if;
  select * into v_assignment from public.downtime_roots_assignments where user_id=p_user_id for update;
  if not found then raise exception 'Protected ROOTS assignment not found'; end if;
  select action,roots_class into v_latest from public.downtime_roots_assignment_audit
   where assignment_id=v_assignment.id order by created_at desc,id desc limit 1;
  if not found or v_latest.action='ROOTS_REVOKED' then raise exception 'ROOTS assignment is already revoked or has no lifecycle history'; end if;
  insert into public.downtime_roots_assignment_audit
    (assignment_id,user_id,staff_id,roots_class,actor_user_id,actor_username,actor_display_name,action)
  values
    (v_assignment.id,v_assignment.user_id,v_assignment.staff_id,v_latest.roots_class,p_actor_user_id,trim(p_actor_username),trim(p_actor_display_name),'ROOTS_REVOKED');
  return jsonb_build_object('user_id',v_assignment.user_id,'staff_id',v_assignment.staff_id,'previous_roots_class',v_latest.roots_class,'status','REVOKED');
end;
$$;

create or replace function public.downtime_roots_reclassify_identity(
  p_user_id uuid,
  p_roots_class text,
  p_actor_user_id uuid,
  p_actor_username text,
  p_actor_display_name text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_assignment public.downtime_roots_assignments%rowtype;
  v_latest record;
begin
  if p_user_id is null or p_roots_class is null or p_roots_class not in ('DEV1','ADMIN')
     or p_actor_user_id is null or upper(trim(coalesce(p_actor_username,'')))<>'DEV'
     or coalesce(trim(p_actor_display_name),'')='' then
    raise exception 'Only immutable DEV may reclassify a protected ROOTS identity';
  end if;
  select * into v_assignment from public.downtime_roots_assignments where user_id=p_user_id for update;
  if not found then raise exception 'Protected ROOTS assignment not found'; end if;
  select action,roots_class into v_latest from public.downtime_roots_assignment_audit
   where assignment_id=v_assignment.id order by created_at desc,id desc limit 1;
  if not found or v_latest.action='ROOTS_REVOKED' then raise exception 'A revoked ROOTS identity must be restored before reclassification'; end if;
  if v_latest.roots_class=p_roots_class then
    return jsonb_build_object('user_id',v_assignment.user_id,'staff_id',v_assignment.staff_id,'roots_class',p_roots_class,'status','ACTIVE','replayed',true);
  end if;
  insert into public.downtime_roots_assignment_audit
    (assignment_id,user_id,staff_id,roots_class,actor_user_id,actor_username,actor_display_name,action)
  values
    (v_assignment.id,v_assignment.user_id,v_assignment.staff_id,p_roots_class,p_actor_user_id,trim(p_actor_username),trim(p_actor_display_name),'ROOTS_RECLASSIFIED');
  return jsonb_build_object('user_id',v_assignment.user_id,'staff_id',v_assignment.staff_id,'roots_class',p_roots_class,'status','ACTIVE','replayed',false);
end;
$$;

revoke all on function public.downtime_roots_assign_identity(uuid,uuid,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.downtime_roots_revoke_identity(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.downtime_roots_reclassify_identity(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.downtime_roots_assign_identity(uuid,uuid,text,uuid,text,text) to service_role;
grant execute on function public.downtime_roots_revoke_identity(uuid,uuid,text,text) to service_role;
grant execute on function public.downtime_roots_reclassify_identity(uuid,text,uuid,text,text) to service_role;

comment on view public.downtime_roots_effective_assignments is
  'Current active ROOTS assignments derived from immutable assignment and lifecycle audit events.';
