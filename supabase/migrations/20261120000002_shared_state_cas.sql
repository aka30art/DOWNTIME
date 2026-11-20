-- Versioned shared-state writes for central sync. Staged only; do not apply to production until frontend cutover.
create or replace function public.downtime_shared_state_cas(
  p_expected_version bigint,
  p_payload jsonb,
  p_actor_id uuid
) returns table(ok boolean, current_version bigint, current_payload jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  row_version bigint;
  row_payload jsonb;
begin
  if p_expected_version < 0 or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid shared-state payload or version';
  end if;

  select version, payload into row_version, row_payload
    from public.downtime_shared_state where id = 1 for update;

  if not found then
    if p_expected_version <> 0 then
      return query select false, 0::bigint, null::jsonb;
      return;
    end if;
    insert into public.downtime_shared_state(id,payload,updated_at,version)
      values(1,p_payload,now(),1);
    insert into public.downtime_sync_audit(actor_id,domain,record_key,operation,new_data)
      values(p_actor_id,'TRACKER','1','UPDATE',jsonb_build_object('version',1));
    return query select true,1::bigint,p_payload;
    return;
  end if;

  if row_version <> p_expected_version then
    return query select false,row_version,row_payload;
    return;
  end if;

  update public.downtime_shared_state
    set payload=p_payload, updated_at=now(), version=row_version+1
    where id=1;
  insert into public.downtime_sync_audit(actor_id,domain,record_key,operation,old_data,new_data)
    values(p_actor_id,'TRACKER','1','UPDATE',jsonb_build_object('version',row_version),jsonb_build_object('version',row_version+1));
  return query select true,row_version+1,p_payload;
end;
$$;

revoke all on function public.downtime_shared_state_cas(bigint,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.downtime_shared_state_cas(bigint,jsonb,uuid) to service_role;
