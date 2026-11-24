-- DEV-only defaults for the isolated Master Configuration registry.
-- Preserve any labels already edited by an administrator when this migration is re-applied.
-- No runtime DOWNTIME application integration is introduced.
update public.downtime_central_config_state
set
 draft_payload = jsonb_set(
   jsonb_set(coalesce(draft_payload,'{}'::jsonb),'{navigation}',
     '{"overview":"Overview","organisation":"Organisation","structure":"Plant & Areas","libraries":"Operational Libraries","defaults":"System Defaults","history":"Version History","navigation":"Menu & Labels","modules":"Module Registry","controls":"System Controls","information":"System Information"}'::jsonb
       || coalesce(draft_payload->'navigation','{}'::jsonb),true),
   '{modules}',coalesce(draft_payload->'modules','[]'::jsonb),true),
 published_payload = jsonb_set(
   jsonb_set(coalesce(published_payload,'{}'::jsonb),'{navigation}',
     '{"overview":"Overview","organisation":"Organisation","structure":"Plant & Areas","libraries":"Operational Libraries","defaults":"System Defaults","history":"Version History","navigation":"Menu & Labels","modules":"Module Registry","controls":"System Controls","information":"System Information"}'::jsonb
       || coalesce(published_payload->'navigation','{}'::jsonb),true),
   '{modules}',coalesce(published_payload->'modules','[]'::jsonb),true)
where id=1;
