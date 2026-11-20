-- DOWNTIME photo evidence: private metadata and bucket
create table if not exists public.downtime_attachments (
  id uuid primary key,
  downtime_entry_key uuid not null unique,
  storage_path text not null unique,
  uploaded_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'available' check (status in ('available','expired','deleted')),
  mime_type text not null check (mime_type in ('image/jpeg','image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  deleted_at timestamptz
);
alter table public.downtime_attachments enable row level security;
-- No client policies: metadata access is only through the service-backed Edge Function.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('downtime-evidence','downtime-evidence',false,5242880,array['image/jpeg','image/webp'])
on conflict (id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/webp'];
-- No client Storage policies: uploads/downloads use short-lived signed URLs issued by Edge Function.
