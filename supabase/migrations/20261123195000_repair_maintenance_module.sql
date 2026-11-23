-- R&M owns its operational records, history and evidence separately from DOWNTIME.
-- Access is granted only through the repair-maintenance-api Edge Function after the
-- existing DOWNTIME Central Bank session and tier permissions have been validated.

create table if not exists public.repair_maintenance_faults (
  id uuid primary key default gen_random_uuid(),
  machine_type text not null check (machine_type in ('KIVERCO_PICKING_LINE','TANNA_SHREDDER','FORKLIFT','TELEHANDLER','EXCAVATORS_360','OTHER_EQUIPMENT')),
  fault_name text not null check (length(trim(fault_name)) between 1 and 120),
  description text not null check (length(trim(description)) between 1 and 2000),
  priority text not null check (priority in ('HIGH','MEDIUM','LOW')),
  status text not null default 'OPEN' check (status in ('OPEN','IN PROGRESS','REPAIRED')),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists repair_maintenance_faults_machine_created_idx
  on public.repair_maintenance_faults (machine_type, created_at);

create table if not exists public.repair_maintenance_notes (
  id uuid primary key default gen_random_uuid(),
  fault_id uuid not null references public.repair_maintenance_faults(id) on delete cascade,
  note text not null check (length(trim(note)) between 1 and 2000),
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists repair_maintenance_notes_fault_created_idx
  on public.repair_maintenance_notes (fault_id, created_at);

create table if not exists public.repair_maintenance_attachments (
  id uuid primary key default gen_random_uuid(),
  fault_id uuid not null references public.repair_maintenance_faults(id) on delete cascade,
  storage_path text not null unique,
  filename text not null check (length(trim(filename)) between 1 and 180),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf','text/plain')),
  size_bytes integer not null check (size_bytes between 1 and 4194304),
  kind text not null check (kind in ('PHOTO','FILE')),
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists repair_maintenance_attachments_fault_created_idx
  on public.repair_maintenance_attachments (fault_id, created_at);

alter table public.repair_maintenance_attachments
  drop constraint if exists repair_maintenance_attachments_size_bytes_check;
alter table public.repair_maintenance_attachments
  add constraint repair_maintenance_attachments_size_bytes_check check (size_bytes between 1 and 4194304);

create table if not exists public.repair_maintenance_audit (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists repair_maintenance_audit_created_idx
  on public.repair_maintenance_audit (created_at desc);

alter table public.repair_maintenance_faults enable row level security;
alter table public.repair_maintenance_notes enable row level security;
alter table public.repair_maintenance_attachments enable row level security;
alter table public.repair_maintenance_audit enable row level security;

revoke all on table public.repair_maintenance_faults from public, anon, authenticated;
revoke all on table public.repair_maintenance_notes from public, anon, authenticated;
revoke all on table public.repair_maintenance_attachments from public, anon, authenticated;
revoke all on table public.repair_maintenance_audit from public, anon, authenticated;

grant all on table public.repair_maintenance_faults to service_role;
grant all on table public.repair_maintenance_notes to service_role;
grant all on table public.repair_maintenance_attachments to service_role;
grant all on table public.repair_maintenance_audit to service_role;
grant usage, select on sequence public.repair_maintenance_audit_id_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('repair-maintenance-evidence', 'repair-maintenance-evidence', false, 4194304,
  array['image/jpeg','image/png','image/webp','application/pdf','text/plain'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
