-- Canonical YARD ROLE definition management.
-- Roles are owner-created; no catalogue entries are seeded.
create table if not exists public.yard_role_definition_audit (
  id bigint generated always as identity primary key,
  yard_role_id uuid not null references public.yard_roles(id) on delete restrict,
  actor_user_id uuid not null,
  actor_username text not null,
  actor_display_name text not null,
  action text not null check (action in ('YARD_ROLE_CREATED','YARD_ROLE_UPDATED','YARD_ROLE_ACTIVATED','YARD_ROLE_RETIRED')),
  previous_definition jsonb,
  next_definition jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.yard_role_definition_audit enable row level security;
revoke all on public.yard_role_definition_audit from public, anon, authenticated;
grant select on public.yard_role_definition_audit to service_role;
revoke insert, update, delete on public.yard_role_definition_audit from service_role;

create or replace function public.prevent_yard_role_definition_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'YARD ROLE definition audit records are immutable';
end;
$$;

drop trigger if exists yard_role_definition_audit_immutable on public.yard_role_definition_audit;
create trigger yard_role_definition_audit_immutable
before update or delete on public.yard_role_definition_audit
for each row execute function public.prevent_yard_role_definition_audit_mutation();

create or replace function public.yard_role_save_definition(
  p_role_id uuid,
  p_expected_version integer,
  p_name text,
  p_description text,
  p_status text,
  p_permissions jsonb,
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
  v_previous jsonb;
  v_next jsonb;
  v_count integer;
  v_distinct integer;
  v_action text;
  v_department text;
  v_permission jsonb;
begin
  if p_role_id is null or p_expected_version is null or p_expected_version < 0
     or coalesce(trim(p_name),'') = '' or length(trim(p_name)) > 80
     or length(coalesce(p_description,'')) > 500
     or p_status is null or p_status not in ('DRAFT','ACTIVE','RETIRED')
     or p_permissions is null or jsonb_typeof(p_permissions) <> 'array'
     or p_actor_user_id is null
     or coalesce(trim(p_actor_username),'') = ''
     or coalesce(trim(p_actor_display_name),'') = '' then
    raise exception 'Invalid YARD ROLE definition request';
  end if;

  select count(*), count(distinct item->>'department')
    into v_count, v_distinct
    from jsonb_array_elements(p_permissions) as items(item);
  if v_count <> 5 or v_distinct <> 5 then
    raise exception 'YARD ROLE requires exactly one permission record for each approved department';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_permissions) as items(item)
     where item->>'department' not in ('SCPL','R&M','Management','SCFL','Traffic')
        or jsonb_typeof(item->'can_view') <> 'boolean'
        or jsonb_typeof(item->'can_enter') <> 'boolean'
        or jsonb_typeof(item->'can_edit') <> 'boolean'
        or jsonb_typeof(item->'can_manage') <> 'boolean'
  ) then
    raise exception 'YARD ROLE permissions must use approved departments and explicit independent boolean flags';
  end if;

  if not exists (select 1 from jsonb_array_elements(p_permissions) as items(item) where item->>'department'='SCPL')
     or not exists (select 1 from jsonb_array_elements(p_permissions) as items(item) where item->>'department'='R&M')
     or not exists (select 1 from jsonb_array_elements(p_permissions) as items(item) where item->>'department'='Management')
     or not exists (select 1 from jsonb_array_elements(p_permissions) as items(item) where item->>'department'='SCFL')
     or not exists (select 1 from jsonb_array_elements(p_permissions) as items(item) where item->>'department'='Traffic') then
    raise exception 'YARD ROLE must define all five approved departments';
  end if;

  select * into v_role from public.yard_roles where id=p_role_id for update;
  if found then
    if v_role.version <> p_expected_version then raise exception 'YARD_ROLE_VERSION_CONFLICT'; end if;
    if p_status='RETIRED' and exists (select 1 from public.yard_role_assignments where yard_role_id=p_role_id and status='ACTIVE') then
      raise exception 'Reassign every USER before retiring this YARD ROLE';
    end if;
    select jsonb_build_object(
      'id',v_role.id,'name',v_role.name,'description',v_role.description,'status',v_role.status,'version',v_role.version,
      'permissions',coalesce((select jsonb_agg(jsonb_build_object('department',department,'can_view',can_view,'can_enter',can_enter,'can_edit',can_edit,'can_manage',can_manage) order by department) from public.yard_role_department_permissions where yard_role_id=p_role_id),'[]'::jsonb)
    ) into v_previous;
    v_action := case
      when v_role.status <> 'ACTIVE' and p_status='ACTIVE' then 'YARD_ROLE_ACTIVATED'
      when v_role.status='ACTIVE' and p_status='RETIRED' then 'YARD_ROLE_RETIRED'
      else 'YARD_ROLE_UPDATED'
    end;
    update public.yard_roles
       set name=trim(p_name), description=coalesce(trim(p_description),''), status=p_status,
           version=version+1, updated_at=now()
     where id=p_role_id returning * into v_role;
  else
    if p_expected_version <> 0 then raise exception 'YARD_ROLE_VERSION_CONFLICT'; end if;
    insert into public.yard_roles(id,name,description,status,version,created_by_user_id,created_by)
    values(p_role_id,trim(p_name),coalesce(trim(p_description),''),p_status,1,p_actor_user_id,trim(p_actor_username))
    returning * into v_role;
    v_action := case when p_status='ACTIVE' then 'YARD_ROLE_ACTIVATED' else 'YARD_ROLE_CREATED' end;
  end if;

  delete from public.yard_role_department_permissions where yard_role_id=p_role_id;
  for v_permission in select value from jsonb_array_elements(p_permissions) loop
    v_department := v_permission->>'department';
    insert into public.yard_role_department_permissions(yard_role_id,department,can_view,can_enter,can_edit,can_manage)
    values(p_role_id,v_department,(v_permission->>'can_view')::boolean,(v_permission->>'can_enter')::boolean,(v_permission->>'can_edit')::boolean,(v_permission->>'can_manage')::boolean);
  end loop;

  select jsonb_build_object(
    'id',v_role.id,'name',v_role.name,'description',v_role.description,'status',v_role.status,'version',v_role.version,
    'permissions',coalesce((select jsonb_agg(jsonb_build_object('department',department,'can_view',can_view,'can_enter',can_enter,'can_edit',can_edit,'can_manage',can_manage) order by department) from public.yard_role_department_permissions where yard_role_id=p_role_id),'[]'::jsonb)
  ) into v_next;

  insert into public.yard_role_definition_audit(yard_role_id,actor_user_id,actor_username,actor_display_name,action,previous_definition,next_definition)
  values(p_role_id,p_actor_user_id,trim(p_actor_username),trim(p_actor_display_name),v_action,v_previous,v_next);

  return v_next;
end;
$$;

revoke all on function public.yard_role_save_definition(uuid,integer,text,text,text,jsonb,uuid,text,text) from public, anon, authenticated;
grant execute on function public.yard_role_save_definition(uuid,integer,text,text,text,jsonb,uuid,text,text) to service_role;
