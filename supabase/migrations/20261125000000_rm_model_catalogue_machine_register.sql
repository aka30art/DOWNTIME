-- PR #133: the model catalogue becomes the sole registered-machine catalogue.
-- Existing asset IDs and fault foreign keys are retained. Existing model rows are
-- reconciled to matching assets or materialized as assets; no fault history is deleted.
do $$
declare
  model_row record;
  matched_id uuid;
  existing_asset_ids uuid[];
begin
  -- Only assets that predate this reconciliation may be matched. Assets created
  -- from an earlier catalogue row must remain distinct catalogue entries.
  select coalesce(array_agg(id), '{}'::uuid[])
    into existing_asset_ids
    from public.repair_maintenance_assets;

  for model_row in
    select id, machine_type, name, created_by
      from public.repair_maintenance_machine_models
     order by created_at, id
  loop
    matched_id := null;

    select id into matched_id
      from public.repair_maintenance_assets
     where id = any(existing_asset_ids)
       and machine_type = model_row.machine_type
       and status = 'ACTIVE'
       and (
         lower(trim(name)) = lower(trim(model_row.name))
         or lower(trim(coalesce(make_model, ''))) = lower(trim(model_row.name))
         -- Preserve established machine identities whose names extend a catalogue label.
         or left(lower(trim(name)), char_length(lower(trim(model_row.name))) + 1)
              = lower(trim(model_row.name)) || ' '
       )
     order by
       case
         when lower(trim(name)) = lower(trim(model_row.name)) then 0
         when lower(trim(coalesce(make_model, ''))) = lower(trim(model_row.name)) then 1
         else 2
       end,
       created_at,
       id
     limit 1;

    if matched_id is not null then
      update public.repair_maintenance_assets
         set make_model = coalesce(nullif(trim(make_model), ''), model_row.name),
             updated_at = now()
       where id = matched_id;
    else
      insert into public.repair_maintenance_assets
        (machine_type, name, make_model, status, created_by, updated_by)
      values
        (model_row.machine_type, model_row.name, model_row.name, 'ACTIVE',
         coalesce(nullif(model_row.created_by, ''), 'SYSTEM'), coalesce(nullif(model_row.created_by, ''), 'SYSTEM'));
    end if;
  end loop;
end $$;


comment on table public.repair_maintenance_machine_models is
  'Legacy model catalogue retained for rollback/history. PR #133 routes all current model catalogue reads and writes through repair_maintenance_assets.';
