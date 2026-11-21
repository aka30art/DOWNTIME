-- Central OWNER bootstrap secret is stored encrypted in Supabase Vault.
-- Only the service_role can call this function; browser roles are explicitly denied.
create or replace function public.downtime_get_bootstrap_code()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'downtime_bootstrap_code'
  limit 1;
$$;

revoke all on function public.downtime_get_bootstrap_code() from public;
revoke all on function public.downtime_get_bootstrap_code() from anon, authenticated;
grant execute on function public.downtime_get_bootstrap_code() to service_role;

-- Keep STAFF photos private and enforce the same file constraints as the upload UI.
update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/webp','image/png']
where id = 'downtime-staff-photos';
