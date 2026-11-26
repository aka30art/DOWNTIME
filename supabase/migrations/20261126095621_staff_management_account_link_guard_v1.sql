create or replace function public.staff_management_rpc(
  p_action text,
  p_payload jsonb default '{}'::jsonb,
  p_actor text default 'SYSTEM',
  p_include_management boolean default false
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, staff_management
as $$
declare
  v_id uuid; v_role_id uuid; v_staff staff_members%rowtype; v_role staff_site_roles%rowtype;
  v_before jsonb; v_after jsonb; v_result jsonb; v_name text; v_role_key text; v_sort integer; v_status text;
begin
  if p_action in ('link-account','unlink-account') then
    raise exception 'Account linking is disabled until Central Bank exposes a stable immutable account ID.';
  end if;
  if p_action='bootstrap' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_order,r.display_name),'[]'::jsonb) into v_result from staff_site_roles r;
    return jsonb_build_object(
      'roles',v_result,
      'staff',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('staff_site_roles',jsonb_build_object('id',r.id,'role_key',r.role_key,'display_name',r.display_name,'is_active',r.is_active)) order by s.status,lower(s.display_name)),'[]'::jsonb) from staff_members s join staff_site_roles r on r.id=s.site_role_id),
      'accountLinks',case when p_include_management then (select coalesce(jsonb_agg(to_jsonb(l) order by l.linked_at desc),'[]'::jsonb) from staff_account_links l) else '[]'::jsonb end,
      'auditLogs',case when p_include_management then (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb) from (select * from staff_audit_logs order by created_at desc limit 100) a) else '[]'::jsonb end
    );
  end if;
  if p_action='create-staff' then
    v_name:=btrim(coalesce(p_payload->>'display_name','')); v_role_id:=(p_payload->>'site_role_id')::uuid;
    if not exists(select 1 from staff_site_roles where id=v_role_id and is_active) then raise exception 'Select an active on-site role.'; end if;
    insert into staff_members(display_name,site_role_id,status,created_by,updated_by) values(v_name,v_role_id,'ACTIVE',p_actor,p_actor) returning * into v_staff;
    v_after:=to_jsonb(v_staff);
    insert into staff_audit_logs(actor_username,action,entity_type,entity_id,before_data,after_data) values(p_actor,'CREATE','STAFF_MEMBER',v_staff.id,null,v_after);
    return jsonb_build_object('staff',v_after);
  end if;
  if p_action in ('update-staff','archive-staff','restore-staff') then
    v_id:=(p_payload->>'staff_member_id')::uuid; select * into v_staff from staff_members where id=v_id for update;
    if not found then raise exception 'Staff member not found.'; end if; v_before:=to_jsonb(v_staff);
    if p_action='update-staff' then
      if v_staff.status<>'ACTIVE' then raise exception 'Restore this staff record before editing it.'; end if;
      v_name:=btrim(coalesce(p_payload->>'display_name','')); v_role_id:=(p_payload->>'site_role_id')::uuid;
      if not exists(select 1 from staff_site_roles where id=v_role_id and (is_active or id=v_staff.site_role_id)) then raise exception 'Select an active on-site role.'; end if;
      update staff_members set display_name=v_name,site_role_id=v_role_id,updated_by=p_actor where id=v_id returning * into v_staff; v_status:='UPDATE';
    elsif p_action='archive-staff' then update staff_members set status='ARCHIVED',archived_at=now(),updated_by=p_actor where id=v_id returning * into v_staff; v_status:='ARCHIVE';
    else update staff_members set status='ACTIVE',archived_at=null,updated_by=p_actor where id=v_id returning * into v_staff; v_status:='RESTORE'; end if;
    v_after:=to_jsonb(v_staff);
    insert into staff_audit_logs(actor_username,action,entity_type,entity_id,before_data,after_data) values(p_actor,v_status,'STAFF_MEMBER',v_id,v_before,v_after);
    return jsonb_build_object('staff',v_after);
  end if;
  if p_action='create-role' then
    v_role_key:=lower(btrim(coalesce(p_payload->>'role_key',''))); v_name:=btrim(coalesce(p_payload->>'display_name','')); v_sort:=coalesce((p_payload->>'sort_order')::integer,100);
    insert into staff_site_roles(role_key,display_name,sort_order) values(v_role_key,v_name,v_sort) returning * into v_role; v_after:=to_jsonb(v_role);
    insert into staff_audit_logs(actor_username,action,entity_type,entity_id,before_data,after_data) values(p_actor,'CREATE_ROLE','SITE_ROLE',v_role.id,null,v_after);
    return jsonb_build_object('role',v_after);
  end if;
  if p_action in ('update-role','archive-role') then
    v_id:=(p_payload->>'role_id')::uuid; select * into v_role from staff_site_roles where id=v_id for update;
    if not found then raise exception 'On-site role not found.'; end if; v_before:=to_jsonb(v_role);
    if p_action='archive-role' then update staff_site_roles set is_active=false where id=v_id returning * into v_role; v_status:='ARCHIVE_ROLE';
    else update staff_site_roles set display_name=coalesce(nullif(btrim(p_payload->>'display_name'),''),display_name),sort_order=coalesce((p_payload->>'sort_order')::integer,sort_order),is_active=coalesce((p_payload->>'is_active')::boolean,is_active) where id=v_id returning * into v_role; v_status:='UPDATE_ROLE'; end if;
    v_after:=to_jsonb(v_role);
    insert into staff_audit_logs(actor_username,action,entity_type,entity_id,before_data,after_data) values(p_actor,v_status,'SITE_ROLE',v_id,v_before,v_after);
    return jsonb_build_object('role',v_after);
  end if;
  raise exception 'Unknown STAFF MANAGEMENT operation.';
end;
$$;
revoke all on function public.staff_management_rpc(text,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.staff_management_rpc(text,jsonb,text,boolean) to service_role;
