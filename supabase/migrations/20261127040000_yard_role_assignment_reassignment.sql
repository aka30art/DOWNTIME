-- Version-checked YARD ROLE reassignment for existing canonical USER identities.
create or replace function public.yard_role_reassign_user(
  p_user_id uuid,
  p_staff_id uuid,
  p_yard_role_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_username text,
  p_actor_display_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.yard_roles%rowtype;
  v_assignment public.yard_role_assignments%rowtype;
  v_permission_count integer;
  v_action text;\n  v_previous_role_id uuid;
begin
  if p_user_id is null or p_staff_id is null or p_yard_role_id is null
     or p_user_id = p_staff_id or p_expected_version is null or p_expected_version < 1
     or p_actor_user_id is null
     or coalesce(trim(p_actor_username),'') = ''
     or coalesce(trim(p_actor_display_name),'') = '' then
    raise exception 'Invalid USER/STAFF/YARD ROLE reassignment request';
  end if;

  select * into v_role from public.yard_roles where id=p_yard_role_id and status='ACTIVE';
  if not found then raise exception 'Canonical YARD ROLE is missing or inactive'; end if;
  select count(*) into v_permission_count from public.yard_role_department_permissions where yard_role_id=p_yard_role_id;
  if v_permission_count <> 5 then raise exception 'Canonical YARD ROLE requires exactly five department permission records'; end if;

  select * into v_assignment from public.yard_role_assignments where user_id=p_user_id for update;
  if not found then raise exception 'USER has no existing YARD ROLE assignment'; end if;
  if v_assignment.staff_id <> p_staff_id then raise exception 'USER/STAFF assignment does not match immutable linked identity'; end if;
  if v_assignment.version <> p_expected_version then raise exception 'YARD_ROLE_ASSIGNMENT_VERSION_CONFLICT'; end if;
  if v_assignment.status='ACTIVE' and v_assignment.yard_role_id=p_yard_role_id then
    return jsonb_build_object('user_id',v_assignment.user_id,'staff_id',v_assignment.staff_id,'yard_role_id',v_assignment.yard_role_id,'status',v_assignment.status,'version',v_assignment.version,'verified_at',v_assignment.verified_at,'replayed',true);
  end if;

  v_previous_role_id := v_assignment.yard_role_id;\n  v_action := case when v_assignment.status='REVOKED' then 'USER_YARD_ROLE_RESTORED' else 'USER_YARD_ROLE_REASSIGNED' end;
  update public.yard_role_assignments
     set yard_role_id=p_yard_role_id,status='ACTIVE',version=version+1,verified_at=now(),
         assigned_by_user_id=p_actor_user_id,assigned_by=trim(p_actor_username),updated_at=now()
   where id=v_assignment.id returning * into v_assignment;

  insert into public.yard_role_assignment_audit
    (assignment_id,user_id,staff_id,yard_role_id,actor_user_id,actor_username,actor_display_name,action,details)
  values
    (v_assignment.id,p_user_id,p_staff_id,p_yard_role_id,p_actor_user_id,trim(p_actor_username),trim(p_actor_display_name),v_action,
     jsonb_build_object('previous_yard_role_id',v_previous_role_id,'version',v_assignment.version));

  return jsonb_build_object('user_id',v_assignment.user_id,'staff_id',v_assignment.staff_id,'yard_role_id',v_assignment.yard_role_id,'status',v_assignment.status,'version',v_assignment.version,'verified_at',v_assignment.verified_at,'replayed',false);
end;
$$;

revoke all on function public.yard_role_reassign_user(uuid,uuid,uuid,integer,uuid,text,text) from public, anon, authenticated;
grant execute on function public.yard_role_reassign_user(uuid,uuid,uuid,integer,uuid,text,text) to service_role;
