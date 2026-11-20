-- Conflict-safe tracker writes using optimistic concurrency (staged; not applied yet).
-- A caller must send the version it read. Stale writes raise SQLSTATE 40001,
-- allowing the client to fetch/merge and retry rather than silently overwrite.
create or replace function public.downtime_update_shared_state(
  p_payload jsonb,
  p_expected_version bigint
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_version bigint;
  caller_tier text := coalesce(auth.jwt()->'app_metadata'->>'tier','');
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if caller_tier not in ('OWNER','ADMIN','SUPERVISOR') then
    raise exception 'Insufficient tier for tracker write' using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload must be a JSON object' using errcode = '22023';
  end if;

  update public.downtime_shared_state
     set payload = p_payload,
         version = version + 1,
         updated_at = now()
   where id = 1
     and version = p_expected_version
   returning version into next_version;

  if next_version is null then
    raise exception 'Conflict: shared tracker changed since it was read' using errcode = '40001';
  end if;

  return next_version;
end;
$$;

revoke all on function public.downtime_update_shared_state(jsonb,bigint) from public;
revoke all on function public.downtime_update_shared_state(jsonb,bigint) from anon;
grant execute on function public.downtime_update_shared_state(jsonb,bigint) to authenticated;
