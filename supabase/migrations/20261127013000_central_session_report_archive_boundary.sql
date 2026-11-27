-- Remove anonymous Supabase Auth sessions from direct operational data access.
-- Browser clients retain only the existing private Realtime notification subscription.
alter table public.downtime_shared_state enable row level security;
drop policy if exists "Authenticated users can read downtime state" on public.downtime_shared_state;
drop policy if exists "Authenticated users can insert downtime state" on public.downtime_shared_state;
drop policy if exists "Authenticated users can update downtime state" on public.downtime_shared_state;
revoke all on table public.downtime_shared_state from anon, authenticated;
grant select on table public.downtime_shared_state to service_role;

alter table public.downtime_reports enable row level security;
drop policy if exists "Authenticated users can add downtime reports" on public.downtime_reports;
drop policy if exists "Authenticated users can delete downtime reports" on public.downtime_reports;
drop policy if exists "Authenticated users can read downtime reports" on public.downtime_reports;
revoke all on table public.downtime_reports from anon, authenticated;
grant select, insert, delete on table public.downtime_reports to service_role;

-- PDF objects are now accessed only through the Central Bank-session Edge Function.
drop policy if exists "Authenticated access downtime pdfs" on storage.objects;
drop policy if exists "Authenticated upload downtime pdfs" on storage.objects;
drop policy if exists "Authenticated delete downtime pdfs" on storage.objects;

comment on table public.downtime_shared_state is
  'Service-role-only shared tracker state. Browser clients use the Central Bank session API; spectator reads use the protected spectator Edge Function.';
comment on table public.downtime_reports is
  'Service-role-only weekly PDF archive metadata. Browser clients use downtime-reports-api with a Central Bank session.';
