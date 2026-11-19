-- Spectator Mode: unauthenticated read-only access to shared tracker state.
-- This role receives SELECT only; INSERT, UPDATE and DELETE remain unavailable.
grant select on table public.downtime_shared_state to anon;

create policy "Unauthenticated spectators can read downtime state"
on public.downtime_shared_state
for select
to anon
using (true);
