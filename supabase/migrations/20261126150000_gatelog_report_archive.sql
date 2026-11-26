-- GATELOG report archive. Stores immutable report snapshots; no DOWNTIME tracker tables are touched.
create table if not exists public.gatelog_report_archive (
  id uuid primary key default gen_random_uuid(),
  period text not null check (period in ('daily','weekly','monthly')),
  date_from date not null,
  date_to date not null,
  report_data jsonb not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  check (date_to >= date_from)
);
create index if not exists gatelog_report_archive_created_at_idx
  on public.gatelog_report_archive(created_at desc);
alter table public.gatelog_report_archive enable row level security;
revoke all on public.gatelog_report_archive from public, anon, authenticated;
grant all on public.gatelog_report_archive to service_role;
