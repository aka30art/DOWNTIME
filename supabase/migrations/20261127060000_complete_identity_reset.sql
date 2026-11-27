-- One-time, atomic replacement of the legacy USER / STAFF directory and DEV bootstrap.
-- Operational records, Central Bank audit history, ROOTS audit history and shared photo objects are retained.
create table if not exists public.downtime_identity_reset_runs (
  singleton boolean primary key default true check (singleton),
  old_dev_user_id uuid not null,
  new_dev_user_id uuid not null,
  performed_at timestamptz not null default now()
);
alter table public.downtime_identity_reset_runs enable row level security;
revoke all on public.downtime_identity_reset_runs from public, anon, authenticated;
grant select on public.downtime_identity_reset_runs to service_role;
revoke insert, update, delete on public.downtime_identity_reset_runs from service_role;

create or replace function public.downtime_identity_reset_cutover(
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_username text,
  p_actor_display_name text,
  p_new_dev_user jsonb,
  p_new_dev1_user jsonb,
  p_new_admin_user jsonb,
  p_dev1_staff jsonb,
  p_admin_staff jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $reset$
declare
  v_bootstrap_user_id uuid;
  v_payload jsonb;
  v_app_data jsonb;
  v_next_payload jsonb;
  v_version integer;
  v_dev_user_id uuid;
  v_dev1_user_id uuid;
  v_admin_user_id uuid;
  v_dev1_staff_id uuid;
  v_admin_staff_id uuid;
  v_assignment record;
  v_yard_assignment record;
  v_hub_payload jsonb;
  v_hub_version bigint;
  v_dev1_assignment_id uuid;
  v_admin_assignment_id uuid;
begin
  if p_actor_user_id is null or upper(trim(coalesce(p_actor_username,''))) <> 'DEV'
     or coalesce(trim(p_actor_display_name),'') = '' then
    raise exception 'Identity reset requires the authenticated DEV actor';
  end if;

  select user_id into v_bootstrap_user_id
    from public.downtime_roots_bootstrap
   where singleton = true
   for update;
  if not found or v_bootstrap_user_id <> p_actor_user_id then
    raise exception 'Identity reset actor is not the immutable current DEV bootstrap';
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
  if not exists (
    select 1
      from jsonb_array_elements(coalesce(v_payload->'users','[]'::jsonb)) as account
     where lower(coalesce(account->>'userId','')) = lower(p_actor_user_id::text)
       and upper(trim(coalesce(account->>'username',''))) = 'DEV'
       and coalesce((account->>'enabled')::boolean,true) = true
  ) then
    raise exception 'Current DEV account is missing or disabled';
  end if;

  v_dev_user_id := (p_new_dev_user->>'userId')::uuid;
  v_dev1_user_id := (p_new_dev1_user->>'userId')::uuid;
  v_admin_user_id := (p_new_admin_user->>'userId')::uuid;
  v_dev1_staff_id := (p_dev1_staff->>'staffId')::uuid;
  v_admin_staff_id := (p_admin_staff->>'staffId')::uuid;

  if v_dev_user_id = p_actor_user_id
     or v_dev1_user_id = p_actor_user_id or v_admin_user_id = p_actor_user_id
     or v_dev1_staff_id = p_actor_user_id or v_admin_staff_id = p_actor_user_id
     or v_dev_user_id = v_dev1_user_id or v_dev_user_id = v_admin_user_id
     or v_dev1_user_id = v_admin_user_id
     or v_dev1_staff_id = v_admin_staff_id
     or v_dev1_staff_id in (v_dev_user_id,v_dev1_user_id,v_admin_user_id)
     or v_admin_staff_id in (v_dev_user_id,v_dev1_user_id,v_admin_user_id)
     or v_dev1_user_id = v_dev1_staff_id or v_admin_user_id = v_admin_staff_id then
    raise exception 'New immutable USER and STAFF identifiers must all be distinct';
  end if;

  if p_new_dev_user->>'username' is distinct from 'DEV'
     or p_new_dev1_user->>'username' is distinct from 'DEV1'
     or p_new_admin_user->>'username' is distinct from 'ADMIN'
     or coalesce((p_new_dev_user->>'enabled')::boolean,false) is not true
     or coalesce((p_new_dev1_user->>'enabled')::boolean,false) is not true
     or coalesce((p_new_admin_user->>'enabled')::boolean,false) is not true
     or p_new_dev_user->>'status' is distinct from 'ACTIVE'
     or p_new_dev1_user->>'status' is distinct from 'ACTIVE'
     or p_new_admin_user->>'status' is distinct from 'ACTIVE'
     or p_new_dev_user->>'staffId' is not null
     or p_new_dev1_user->>'staffId' is distinct from v_dev1_staff_id::text
     or p_new_admin_user->>'staffId' is distinct from v_admin_staff_id::text
     or p_dev1_staff->>'linkedUserId' is distinct from v_dev1_user_id::text
     or p_admin_staff->>'linkedUserId' is distinct from v_admin_user_id::text
     or p_dev1_staff->>'name' is distinct from 'DEV1'
     or p_admin_staff->>'name' is distinct from 'ADMIN'
     or p_dev1_staff->>'status' is distinct from 'ACTIVE'
     or p_admin_staff->>'status' is distinct from 'ACTIVE'
     or p_new_dev_user ? 'tier' or p_new_dev1_user ? 'tier' or p_new_admin_user ? 'tier'
     or coalesce(p_new_dev_user->>'pinSalt','') = ''
     or coalesce(p_new_dev_user->>'pinHash','') = ''
     or coalesce(p_new_dev1_user->>'pinSalt','') = ''
     or coalesce(p_new_dev1_user->>'pinHash','') = ''
     or coalesce(p_new_admin_user->>'pinSalt','') = ''
     or coalesce(p_new_admin_user->>'pinHash','') = '' then
    raise exception 'New DEV, DEV1, ADMIN credentials and linked STAFF identities are incomplete';
  end if;

  v_next_payload := jsonb_set(v_payload,'{users}',
    jsonb_build_array(p_new_dev_user,p_new_dev1_user,p_new_admin_user),true);
  v_next_payload := jsonb_set(v_next_payload,'{staff}',
    jsonb_build_object(
      'roster',jsonb_build_array('DEV1','ADMIN'),
      'profiles',jsonb_build_object('DEV1',p_dev1_staff,'ADMIN',p_admin_staff)
    ),true);
  v_app_data := coalesce(v_next_payload->'appData','{}'::jsonb);
  v_app_data := jsonb_set(v_app_data,'{staffRoster}',jsonb_build_array('DEV1','ADMIN'),true);
  v_app_data := jsonb_set(v_app_data,'{operatorProfiles}',jsonb_build_object('DEV1',p_dev1_staff,'ADMIN',p_admin_staff),true);
  v_next_payload := jsonb_set(v_next_payload,'{appData}',v_app_data,true);

  -- Revoke every existing ordinary USER-to-YARD ROLE assignment and retain its audit reference.
  for v_yard_assignment in
    update public.yard_role_assignments
       set status='REVOKED',version=version+1,updated_at=now()
     where status='ACTIVE'
     returning id,user_id,staff_id,yard_role_id
  loop
    insert into public.yard_role_assignment_audit
      (assignment_id,user_id,staff_id,yard_role_id,actor_user_id,actor_username,actor_display_name,action,details)
    values
      (v_yard_assignment.id,v_yard_assignment.user_id,v_yard_assignment.staff_id,v_yard_assignment.yard_role_id,
       p_actor_user_id,'DEV',trim(p_actor_display_name),'USER_YARD_ROLE_REVOKED_BY_IDENTITY_RESET',
       jsonb_build_object('reason','Complete identity reset','newDevUserId',v_dev_user_id));
  end loop;

  -- Clear username-based legacy YARD HUB assignments so reused account names inherit no old access.
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

  -- Revoke existing protected identities but retain their immutable audit references.
  for v_assignment in
    update public.downtime_roots_assignments
       set status='REVOKED', version=version+1, revoked_at=now(), updated_at=now()
     where status='ACTIVE'
     returning id,user_id,staff_id,roots_class
  loop
    insert into public.downtime_roots_assignment_audit
      (assignment_id,user_id,staff_id,roots_class,actor_user_id,actor_username,actor_display_name,action)
    values
      (v_assignment.id,v_assignment.user_id,v_assignment.staff_id,v_assignment.roots_class,
       p_actor_user_id,'DEV',trim(p_actor_display_name),'ROOTS_REVOKED');
  end loop;

  insert into public.downtime_roots_assignments
    (user_id,staff_id,roots_class,status,version,assigned_by_user_id,assigned_by_username,assigned_by_display_name)
  values
    (v_dev1_user_id,v_dev1_staff_id,'DEV1','ACTIVE',1,p_actor_user_id,'DEV',trim(p_actor_display_name))
  returning id into v_dev1_assignment_id;
  insert into public.downtime_roots_assignment_audit
    (assignment_id,user_id,staff_id,roots_class,actor_user_id,actor_username,actor_display_name,action)
  values
    (v_dev1_assignment_id,v_dev1_user_id,v_dev1_staff_id,'DEV1',p_actor_user_id,'DEV',trim(p_actor_display_name),'ROOTS_DEV1_ASSIGNED');

  insert into public.downtime_roots_assignments
    (user_id,staff_id,roots_class,status,version,assigned_by_user_id,assigned_by_username,assigned_by_display_name)
  values
    (v_admin_user_id,v_admin_staff_id,'ADMIN','ACTIVE',1,p_actor_user_id,'DEV',trim(p_actor_display_name))
  returning id into v_admin_assignment_id;
  insert into public.downtime_roots_assignment_audit
    (assignment_id,user_id,staff_id,roots_class,actor_user_id,actor_username,actor_display_name,action)
  values
    (v_admin_assignment_id,v_admin_user_id,v_admin_staff_id,'ADMIN',p_actor_user_id,'DEV',trim(p_actor_display_name),'ROOTS_ADMIN_ASSIGNED');

  update public.downtime_roots_bootstrap
     set user_id=v_dev_user_id
   where singleton=true;

  update public.downtime_central_bank
     set payload=v_next_payload,version=v_version+1,updated_at=now()
   where id=1 and version=v_version;
  if not found then
    raise exception 'IDENTITY_RESET_VERSION_CONFLICT';
  end if;

  -- Every old browser/API session is invalidated, including the executing old DEV session.
  delete from public.downtime_central_sessions;

  insert into public.downtime_identity_reset_runs(singleton,old_dev_user_id,new_dev_user_id)
  values(true,p_actor_user_id,v_dev_user_id);

  insert into public.downtime_central_audit(username,action,details)
  values('DEV','identity-reset-cutover',jsonb_build_object(
    'oldDevUserId',p_actor_user_id,
    'newDevUserId',v_dev_user_id,
    'newDev1UserId',v_dev1_user_id,
    'newAdminUserId',v_admin_user_id,
    'previousUserCount',jsonb_array_length(coalesce(v_payload->'users','[]'::jsonb)),
    'previousStaffProfileCount',case when jsonb_typeof(v_payload->'staff'->'profiles')='object' then jsonb_object_length(v_payload->'staff'->'profiles') else 0 end,
    'operationalRecordsPreserved',true,
    'auditHistoryPreserved',true,
    'sharedPhotoEvidencePreserved',true
  ));

  return jsonb_build_object(
    'ok',true,
    'version',v_version+1,
    'identities',jsonb_build_object(
      'DEV',jsonb_build_object('userId',v_dev_user_id),
      'DEV1',jsonb_build_object('userId',v_dev1_user_id,'staffId',v_dev1_staff_id),
      'ADMIN',jsonb_build_object('userId',v_admin_user_id,'staffId',v_admin_staff_id)
    )
  );
end;
$reset$;

revoke all on function public.downtime_identity_reset_cutover(integer,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.downtime_identity_reset_cutover(integer,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;

comment on table public.downtime_identity_reset_runs is 'One-time record of the complete USER / STAFF / DEV bootstrap replacement cutover.';
