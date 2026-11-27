-- Permanently disable the superseded RPC that replaced DEV and created DEV1/ADMIN login identities.
-- The DEV-preserving reset RPC is the only supported identity reset path.
revoke all on function public.downtime_identity_reset_cutover(integer,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)
  from public, anon, authenticated, service_role;
