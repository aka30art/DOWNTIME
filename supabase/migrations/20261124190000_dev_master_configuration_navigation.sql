-- DEV-only display labels in the isolated configuration registry.
-- No runtime DOWNTIME application integration is introduced.
update public.downtime_central_config_state
set draft_payload = jsonb_set(coalesce(draft_payload,'{}'::jsonb),'{navigation}',
 '{"overview":"Overview","organisation":"Organisation","structure":"Plant & Areas","libraries":"Operational Libraries","defaults":"System Defaults","history":"Version History","navigation":"Menu & Labels"}'::jsonb,true),
 published_payload = jsonb_set(coalesce(published_payload,'{}'::jsonb),'{navigation}',
 '{"overview":"Overview","organisation":"Organisation","structure":"Plant & Areas","libraries":"Operational Libraries","defaults":"System Defaults","history":"Version History","navigation":"Menu & Labels"}'::jsonb,true)
where id=1;
