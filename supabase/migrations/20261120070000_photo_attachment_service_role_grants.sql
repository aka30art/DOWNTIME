-- Explicit service-role table permissions for the signed-upload Edge Function.
-- RLS remains enabled and no client policies are created.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.downtime_attachments TO service_role;
