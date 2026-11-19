drop policy if exists "Unauthenticated spectators can read downtime state" on public.downtime_shared_state;
revoke select on table public.downtime_shared_state from anon;