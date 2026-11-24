-- R&M per-category model dropdown settings and selectable make/model catalogue.
-- Existing machine registry rows, fault history and permissions are left unchanged.
create table if not exists public.repair_maintenance_machine_settings (
  machine_type text primary key check (machine_type in ('KIVERCO_PICKING_LINE','TANNA_SHREDDER','FORKLIFT','TELEHANDLER','EXCAVATORS_360','OTHER_EQUIPMENT')),
  model_dropdown_enabled boolean not null default true,
  updated_by text not null default 'SYSTEM',
  updated_at timestamptz not null default now()
);

insert into public.repair_maintenance_machine_settings (machine_type, model_dropdown_enabled, updated_by)
select machine_type, true, 'SYSTEM'
from unnest(array['KIVERCO_PICKING_LINE','TANNA_SHREDDER','FORKLIFT','TELEHANDLER','EXCAVATORS_360','OTHER_EQUIPMENT']::text[]) as machine_type
on conflict (machine_type) do nothing;

create table if not exists public.repair_maintenance_machine_models (
  id uuid primary key default gen_random_uuid(),
  machine_type text not null references public.repair_maintenance_machine_settings(machine_type) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  created_by text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists repair_maintenance_machine_models_machine_name_uidx
  on public.repair_maintenance_machine_models (machine_type, lower(name));
create index if not exists repair_maintenance_machine_models_machine_created_idx
  on public.repair_maintenance_machine_models (machine_type, created_at);

alter table public.repair_maintenance_machine_settings enable row level security;
alter table public.repair_maintenance_machine_models enable row level security;
revoke all on table public.repair_maintenance_machine_settings from public, anon, authenticated;
revoke all on table public.repair_maintenance_machine_models from public, anon, authenticated;
grant all on table public.repair_maintenance_machine_settings to service_role;
grant all on table public.repair_maintenance_machine_models to service_role;
