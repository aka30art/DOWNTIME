-- Durable, private archive of generated R&M PDF snapshots.
create table if not exists public.repair_maintenance_pdf_exports (
 id uuid primary key default gen_random_uuid(),
 machine_type text check (machine_type is null or machine_type in ('KIVERCO_PICKING_LINE','TANNA_SHREDDER','FORKLIFT','TELEHANDLER','EXCAVATORS_360','OTHER_EQUIPMENT')),
 file_name text not null check(length(trim(file_name)) between 1 and 200),
 storage_path text not null unique,
 mime_type text not null default 'application/pdf' check(mime_type='application/pdf'),
 file_size_bytes bigint not null check(file_size_bytes between 1 and 26214400),
 record_count integer not null default 0 check(record_count>=0),
 created_by text not null,
 created_at timestamptz not null default now()
);
create index if not exists repair_maintenance_pdf_exports_machine_created_idx on public.repair_maintenance_pdf_exports(machine_type,created_at desc);
create index if not exists repair_maintenance_pdf_exports_created_idx on public.repair_maintenance_pdf_exports(created_at desc);
alter table public.repair_maintenance_pdf_exports enable row level security;
revoke all on table public.repair_maintenance_pdf_exports from public,anon,authenticated;
grant all on table public.repair_maintenance_pdf_exports to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('repair-maintenance-reports','repair-maintenance-reports',false,26214400,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;