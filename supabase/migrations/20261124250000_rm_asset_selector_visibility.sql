-- R&M per-category registered-machine selector visibility.
-- Carry the existing saved menu value forward while separating it from the
-- MAKE / MODEL catalogue dropdown setting.
alter table public.repair_maintenance_machine_settings
  add column if not exists asset_selector_enabled boolean not null default true;

update public.repair_maintenance_machine_settings
set asset_selector_enabled = model_dropdown_enabled
where asset_selector_enabled is distinct from model_dropdown_enabled;

comment on column public.repair_maintenance_machine_settings.asset_selector_enabled is
  'Controls visibility of the registered-machine selector on the R&M dashboard for this machinery category.';
