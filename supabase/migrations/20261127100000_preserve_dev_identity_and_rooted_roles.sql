-- Preserve the existing immutable DEV account while clearing the USER/STAFF population.
-- DEV1 and ADMIN are protected ROOTED role definitions only; they are not login accounts or STAFF records.
-- Ordinary YARD ROLE definitions and department permission matrices remain intact.

create table if not exists public.downtime_roots_role_definitions (
  role_key text primary key check (role_key in ('DEV1','ADMIN')),
  display_name text not null unique,
  visibility text not null default 'DEV_ONLY' check (visibility = 'DEV_ONLY'),
  description text not null,
  capabilities jsonb not null check (jsonb_typeof(capabilities) = 'object'),
  version integer not null default 1 check (version > 0),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.downtime_roots_role_definitions enable row level security;
revoke all on public.downtime_roots_role_definitions from public, anon, authenticated;
grant select on public.downtime_roots_role_definitions to service_role;
revoke insert, update, delete on public.downtime_roots_role_definitions from service_role;

insert into public.downtime_roots_role_definitions
  (role_key, display_name, visibility, description, capabilities, created_by_user_id)
select
  roles.role_key,
  roles.display_name,
  'DEV_ONLY',
  roles.description,
  role_caps.capabilities,
  bootstrap.user_id
from public.downtime_roots_bootstrap bootstrap
cross join (values
  ('DEV1','DEV1','Protected ROOTED role. May manage YARD ROLE definitions and assign ADMIN ROOTS; cannot browse the ROOTS directory, assign DEV1, reclassify or revoke ROOTS.'),
  ('ADMIN','ADMIN','Protected ROOTED role. May manage YARD ROLE definitions; cannot browse the ROOTS directory or assign, reclassify or revoke ROOTS.')
) as role_text(role_key, display_name, description)
cross join lateral (
  select case role_text.role_key
    when 'DEV1' then jsonb_build_object(
      'canBrowseRoots',false,
      'canAssignDev1',false,
      'canAssignAdmin',true,
      'canManageYardRoles',true,
      'hasAutomaticDepartmentManage',true,
      'canReclassifyRoots',false,
      'canRevokeRoots',false
    )
    else jsonb_build_object(
      'canBrowseRoots',false,
      'canAssignDev1',false,
      'canAssignAdmin',false,
      'canManageYardRoles',true,
      'hasAutomaticDepartmentManage',true,
      'canReclassifyRoots',false,
      'canRevokeRoots',false
    )
  end as capabilities
) role_caps
where bootstrap.singleton = true
on conflict (role_key) do nothing;

create or replace function public.downtime_identity_reset_preserve_dev(
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_username text,
  p_actor_display_name text,
  p_actor_session_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $reset$
declare
  v_bootstrap_user_id uuid;
  v_payload jsonb;
  v_next_payload jsonb;
  v_staff jsonb;
  v_app_data jsonb;
  v_dev_user jsonb;
  v_version integer;
  v_previous_user_count integer := 0;
  v_previous_staff_count integer := 0;
  v_previous_roster_count integer := 0;
  v_assignment record;
  v_yard_assignment record;
  v_hub_payload jsonb;
  v_hub_version bigint;
begin
  if p_actor_user_id is null
     or upper(trim(coalesce(p_actor_username,''))) <> 'DEV'
     or coalesce(trim(p_actor_display_name),'') = ''
     or coalesce(trim(p_actor_session_hash),'') = '' then
    raise exception 'Identity reset requires the authenticated DEV actor and active session';
  end if;

  select user_id into v_bootstrap_user_id
    from public.downtime_roots_bootstrap
   where singleton = true
   for update;

  if not found or v_bootstrap_user_id <> p_actor_user_id then
    raise exception 'Identity reset actor is not the immutable current DEV bootstrap';
  end if;

  if not exists (
    select 1
      from public.downtime_central_sessions
     where token_hash = p_actor_session_hash
       and upper(trim(username)) = 'DEV'
       and expires_at > now()
  ) then
    raise exception 'The authenticated DEV session is no longer active';
  end if;

  if exists (select 1 from public.downtime_identity_reset_runs where singleton = true) then
    raise exception 'The one-time identity reset has already been completed';
  end if;

  select payload, version into v_payload, v_version
    from public.downtime_central_bank
   where id = 1
   for update;

  if not found or v_payload is null then
    raise exception 'Central USER directory is unavailable';
  end if;
  if v_version <> p_expected_version then
    raise exception 'IDENTITY_RESET_VERSION_CONFLICT';
  end if;

  select account
    into v_dev_user
    from jsonb_array_elements(coalesce(v_payload->'users','[]'::jsonb)) as accounts(account)
   where lower(coalesce(account->>'userId','')) = lower(p_actor_user_id::text)
     and upper(trim(coalesce(account->>'username',''))) = 'DEV'
     and coalesce((account->>'enabled')::boolean,true) = true
   limit 1;

  if v_dev_user is null then
    raise exception 'The existing DEV USER record is missing or disabled';
  end if;

  select count(*) into v_previous_user_count
    from jsonb_array_elements(coalesce(v_payload->'users','[]'::jsonb));
  select count(*) into v_previous_staff_count
    from jsonb_object_keys(coalesce(v_payload->'staff'->'profiles','{}'::jsonb));
  select count(*) into v_previous_roster_count
    from jsonb_array_elements(coalesce(v_payload->'staff'->'roster','[]'::jsonb));

  -- Retain the original DEV JSON object exactly, including immutable ID and PIN hash/salt.
  v_next_payload := jsonb_set(v_payload,'{users}',jsonb_build_array(v_dev_user),true);

  v_staff := coalesce(v_payload->'staff','{}'::jsonb);
  if jsonb_typeof(v_staff) <> 'object' then v_staff := '{}'::jsonb; end if;
  v_staff := jsonb_set(v_staff,'{roster}','[]'::jsonb,true);
  v_staff := jsonb_set(v_staff,'{profiles}','{}'::jsonb,true);
  v_next_payload := jsonb_set(v_next_payload,'{staff}',v_staff,true);

  v_app_data := coalesce(v_payload->'appData','{}'::jsonb);
  if jsonb_typeof(v_app_data) <> 'object' then v_app_data := '{}'::jsonb; end if;
  v_app_data := jsonb_set(v_app_data,'{staffRoster}','[]'::jsonb,true);
  v_app_data := jsonb_set(v_app_data,'{operatorProfiles}','{}'::jsonb,true);
  v_next_payload := jsonb_set(v_next_payload,'{appData}',v_app_data,true);

  -- Revoke identity-linked role assignments, but retain their append-only audit history.
  for v_yard_assignment in
    update public.yard_role_assignments
       set status='REVOKED', version=version+1, updated_at=now()
     where status='ACTIVE'
     returning id,user_id,staff_id,yard_role_id
  loop
    insert into public.yard_role_assignment_audit
      (assignment_id,user_id,staff_id,yard_role_id,actor_user_id,actor_username,actor_display_name,action,details)
    values
      (v_yard_assignment.id,v_yard_assignment.user_id,v_yard_assignment.staff_id,v_yard_assignment.yard_role_id,
       p_actor_user_id,'DEV',trim(p_actor_display_name),'IDENTITY_RESET_REVOKED_ASSIGNMENT',
       jsonb_build_object('reason','USER and STAFF directory reset; YARD ROLE definitions retained'));
  end loop;

  for v_assignment in
    update public.downtime_roots_assignments
       set status='REVOKED',version=version+1,revoked_at=now(),updated_at=now()
     where status='ACTIVE'
     returning id,user_id,staff_id,roots_class
  loop
    insert into public.downtime_roots_assignment_audit
      (assignment_id,user_id,staff_id,roots_class,actor_user_id,actor_username,actor_display_name,action)
    values
      (v_assignment.id,v_assignment.user_id,v_assignment.staff_id,v_assignment.roots_class,
       p_actor_user_id,'DEV',trim(p_actor_display_name),'ROOTS_REVOKED');
  end loop;

  -- Remove per-username legacy tier assignments only. Preserve the role permission profiles.
  select payload,version into v_hub_payload,v_hub_version
    from public.yard_hub_tier_config
   where id=1
   for update;
  if found then
    update public.yard_hub_tier_config
       set payload=jsonb_set(coalesce(v_hub_payload,'{}'::jsonb),'{userTiers}','{}'::jsonb,true),
           version=v_hub_version+1,updated_by='DEV',updated_at=now()
     where id=1 and version=v_hub_version;
    if not found then raise exception 'YARD HUB access configuration changed during identity reset'; end if;
    insert into public.yard_hub_access_audit(actor,action,previous_payload,new_payload)
    values('DEV','identity-reset-clear-user-tiers',v_hub_payload,
      jsonb_set(coalesce(v_hub_payload,'{}'::jsonb),'{userTiers}','{}'::jsonb,true));
  end if;

  update public.downtime_central_bank
     set payload=v_next_payload,version=v_version+1,updated_at=now()
   where id=1 and version=v_version;
  if not found then raise exception 'IDENTITY_RESET_VERSION_CONFLICT'; end if;

  -- Preserve only the executing DEV session; all other USER/STAFF sessions are invalidated.
  delete from public.downtime_central_sessions
   where token_hash <> p_actor_session_hash
      or upper(trim(username)) <> 'DEV';

  -- The historical reset marker is reused with the same old/new ID to prove DEV was retained.
  insert into public.downtime_identity_reset_runs(singleton,old_dev_user_id,new_dev_user_id)
  values(true,p_actor_user_id,p_actor_user_id);

  insert into public.downtime_central_audit(username,action,details)
  values('DEV','identity-reset-preserve-dev',jsonb_build_object(
    'devUserIdPreserved',true,
    'previousUserCount',v_previous_user_count,
    'removedUserCount',greatest(v_previous_user_count-1,0),
    'removedStaffProfileCount',v_previous_staff_count,
    'removedStaffRosterCount',v_previous_roster_count,
    'staffPhotoObjectsRemovedByService',true,
    'ordinaryYardRoleDefinitionsPreserved',true,
    'rootedRoleDefinitionsPreserved',true,
    'operationalRecordsPreserved',true
  ));

  return jsonb_build_object(
    'ok',true,
    'version',v_version+1,
    'devUserId',p_actor_user_id,
    'removedUserCount',greatest(v_previous_user_count-1,0),
    'removedStaffProfileCount',v_previous_staff_count,
    'removedStaffRosterCount',v_previous_roster_count,
    'devSessionPreserved',true
  );
end;
$reset$;

revoke all on function public.downtime_identity_reset_preserve_dev(integer,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.downtime_identity_reset_preserve_dev(integer,uuid,text,text,text) to service_role;

comment on table public.downtime_roots_role_definitions is
  'DEV-only catalogue of protected ROOTED DEV1 and ADMIN role definitions. These definitions are not USER or STAFF identities.';
comment on function public.downtime_identity_reset_preserve_dev(integer,uuid,text,text,text) is
  'One-time atomic USER/STAFF reset which preserves the existing immutable DEV account, its credentials and the executing DEV session.';
