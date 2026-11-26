create or replace function public.downtime_commit_central_bank(
  p_expected_version bigint,
  p_payload jsonb,
  p_username text,
  p_audit_details jsonb,
  p_staff_audit_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_version bigint;
  v_updated_at timestamptz;
  v_event jsonb;
  v_action text;
  v_events jsonb := coalesce(p_staff_audit_events, '[]'::jsonb);
begin
  if p_expected_version is null then
    raise exception 'Expected central version is required';
  end if;
  if pg_catalog.jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Central payload must be a JSON object';
  end if;
  if p_username is null or pg_catalog.length(pg_catalog.btrim(p_username)) = 0
     or pg_catalog.length(p_username) > 80 then
    raise exception 'Audit username is invalid';
  end if;
  if pg_catalog.jsonb_typeof(p_audit_details) is distinct from 'object' then
    raise exception 'Audit details must be a JSON object';
  end if;
  if pg_catalog.jsonb_typeof(v_events) is distinct from 'array' then
    raise exception 'Staff audit events must be a JSON array';
  end if;

  update public.downtime_central_bank
     set payload = p_payload,
         version = version + 1,
         updated_at = pg_catalog.clock_timestamp()
   where id = 1
     and version = p_expected_version
   returning version, updated_at into v_version, v_updated_at;

  if not found then
    return null;
  end if;

  insert into public.downtime_central_audit (username, action, details)
  values (p_username, 'save-settings', p_audit_details);

  for v_event in
    select value from pg_catalog.jsonb_array_elements(v_events) as events(value)
  loop
    if pg_catalog.jsonb_typeof(v_event) is distinct from 'object' then
      raise exception 'Staff audit event must be a JSON object';
    end if;
    v_action := v_event ->> 'action';
    if v_action is null or v_action not in (
      'staff-created',
      'staff-archived',
      'staff-restored',
      'staff-updated',
      'staff-roles-updated'
    ) then
      raise exception 'Staff audit event action is invalid';
    end if;
    if pg_catalog.jsonb_typeof(coalesce(v_event -> 'details', '{}'::jsonb)) is distinct from 'object' then
      raise exception 'Staff audit event details must be a JSON object';
    end if;

    insert into public.downtime_central_audit (username, action, details)
    values (
      p_username,
      v_action,
      coalesce(v_event -> 'details', '{}'::jsonb)
    );
  end loop;

  return pg_catalog.jsonb_build_object(
    'version', v_version,
    'updatedAt', v_updated_at
  );
end;
$function$;

revoke all on function public.downtime_commit_central_bank(bigint, jsonb, text, jsonb, jsonb) from public;
revoke all on function public.downtime_commit_central_bank(bigint, jsonb, text, jsonb, jsonb) from anon, authenticated;
grant execute on function public.downtime_commit_central_bank(bigint, jsonb, text, jsonb, jsonb) to service_role;
