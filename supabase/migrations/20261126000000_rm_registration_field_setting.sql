-- Per-category visibility control for the optional Fleet Number / Registration field.
-- Existing registration values and machine/fault identities are preserved.
alter table public.repair_maintenance_machine_settings
  add column if not exists registration_enabled boolean not null default true;

comment on column public.repair_maintenance_machine_settings.registration_enabled is
  'Controls visibility of the optional Fleet Number / Registration field for this machinery category.';
