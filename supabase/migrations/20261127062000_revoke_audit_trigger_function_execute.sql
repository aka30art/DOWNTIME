-- Trigger guards are invoked by their owning triggers, never as public RPCs.
revoke all on function public.prevent_downtime_roots_audit_mutation() from public, anon, authenticated, service_role;
revoke all on function public.prevent_yard_role_assignment_audit_mutation() from public, anon, authenticated, service_role;
revoke all on function public.prevent_yard_role_definition_audit_mutation() from public, anon, authenticated, service_role;
