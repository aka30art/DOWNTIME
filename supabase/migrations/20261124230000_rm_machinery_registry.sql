-- R&M individual machinery registry.
-- The six existing machine categories remain the navigation layer. Each registered
-- asset belongs to exactly one category; historical faults remain unassigned unless
-- their category represents a known single-machine installation.

create table if not exists public.repair_maintenance_assets (
  id uuid primary key default gen_random_uuid(),
  machine_type text not null check (machine_type in ('KIVERCO_PICKING_LINE','TANNA_SHREDDER','FORKLIFT','TELEHANDLER','EXCAVATORS_360','OTHER_EQUIPMENT')),
  name text not null check (length(trim(name)) between 1 and 120),
  asset_code text check (asset_code is null or length(trim(asset_code)) between 1 and 40),
  make_model text check (make_model is null or length(trim(make_model)) between 1 and 120),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repair_maintenance_assets_id_machine_type_key unique (id, machine_type)
);

create unique index if not exists repair_maintenance_assets_active_name_uidx
  on public.repair_maintenance_assets (machine_type, lower(name))
  where status = 'ACTIVE';
create unique index if not exists repair_maintenance_assets_active_code_uidx
  on public.repair_maintenance_assets (machine_type, upper(asset_code))
  where status = 'ACTIVE' and asset_code is not null;
create index if not exists repair_maintenance_assets_category_status_name_idx
  on public.repair_maintenance_assets (machine_type, status, name);

alter table public.repair_maintenance_faults
  add column if not exists asset_id uuid;

alter table public.repair_maintenance_faults
  drop constraint if exists repair_maintenance_faults_asset_category_fkey;
alter table public.repair_maintenance_faults
  add constraint repair_maintenance_faults_asset_category_fkey
  foreign key (asset_id, machine_type)
  references public.repair_maintenance_assets (id, machine_type)
  on delete restrict;

create index if not exists repair_maintenance_faults_asset_created_idx
  on public.repair_maintenance_faults (asset_id, created_at);

-- These two categories represent one known installation each. Seed their registry
-- entries and attach only their existing records. Fleet records in the other four
-- categories intentionally remain unassigned until a person identifies the asset.
insert into public.repair_maintenance_assets
  (machine_type, name, created_by, updated_by)
values
  ('KIVERCO_PICKING_LINE', 'KIVERCO — PICKING LINE', 'SYSTEM', 'SYSTEM'),
  ('TANNA_SHREDDER', 'TANNA — SHREDDER', 'SYSTEM', 'SYSTEM')
on conflict do nothing;

update public.repair_maintenance_faults f
   set asset_id = a.id
  from public.repair_maintenance_assets a
 where f.asset_id is null
   and f.machine_type = a.machine_type
   and a.status = 'ACTIVE'
   and (
     (f.machine_type = 'KIVERCO_PICKING_LINE' and a.name = 'KIVERCO — PICKING LINE')
     or
     (f.machine_type = 'TANNA_SHREDDER' and a.name = 'TANNA — SHREDDER')
   );

alter table public.repair_maintenance_pdf_exports
  add column if not exists asset_id uuid references public.repair_maintenance_assets(id) on delete set null;
create index if not exists repair_maintenance_pdf_exports_asset_created_idx
  on public.repair_maintenance_pdf_exports (asset_id, created_at desc);

alter table public.repair_maintenance_assets enable row level security;
revoke all on table public.repair_maintenance_assets from public, anon, authenticated;
grant all on table public.repair_maintenance_assets to service_role;
