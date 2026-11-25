-- R&M per-category registered-machine selector visibility.
-- Carry the existing saved menu value forward while separating it from the
-- MAKE / MODEL catalogue dropdown setting.
do $migration$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'repair_maintenance_machine_settings'
      and column_name = 'asset_selector_enabled'
  ) then
    alter table public.repair_maintenance_machine_settings
      add column asset_selector_enabled boolean not null default true;

    update public.repair_maintenance_machine_settings
    set asset_selector_enabled = model_dropdown_enabled;
  end if;
end;
$migration$;

comment on column public.repair_maintenance_machine_settings.asset_selector_enabled is
  'Controls visibility of the registered-machine selector on the R&M dashboard for this machinery category.';
