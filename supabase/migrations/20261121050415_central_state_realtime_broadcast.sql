drop policy if exists "downtime_central_state_broadcast_read" on realtime.messages;

create policy "downtime_central_state_broadcast_read"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() = 'downtime-central-state'
);

create or replace function public.notify_downtime_central_state_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform realtime.send(
    pg_catalog.jsonb_build_object(
      'version', new.version,
      'updated_at', new.updated_at
    ),
    'central_state_changed',
    'downtime-central-state',
    true
  );
  return new;
end;
$function$;

revoke all on function public.notify_downtime_central_state_change() from public, anon, authenticated;

drop trigger if exists broadcast_downtime_central_state_update on public.downtime_central_bank;

create trigger broadcast_downtime_central_state_update
after update of payload, version, updated_at
on public.downtime_central_bank
for each row
when (old.version is distinct from new.version)
execute function public.notify_downtime_central_state_change();
