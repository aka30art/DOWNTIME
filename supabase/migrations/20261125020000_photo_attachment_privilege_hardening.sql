-- DOWNTIME photo evidence metadata is accessed only through the service-backed Edge Function.
-- No browser role should have table-level access, even though RLS has no client policies.
revoke all on table public.downtime_attachments from public, anon, authenticated;
grant select, insert, update, delete on table public.downtime_attachments to service_role;
