-- DOWNTIME LIVE — Supabase schema
-- Shared state record; browser access is mediated by the Central Bank session API.
create table if not exists public.downtime_shared_state (
  id smallint primary key default 1 check (id = 1),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.downtime_shared_state enable row level security;

drop policy if exists "Authenticated users can read downtime state" on public.downtime_shared_state;
drop policy if exists "Authenticated users can insert downtime state" on public.downtime_shared_state;
drop policy if exists "Authenticated users can update downtime state" on public.downtime_shared_state;
revoke all on table public.downtime_shared_state from anon, authenticated;
grant select on table public.downtime_shared_state to service_role;

-- Spectator reads use the protected service-role Edge Function. Realtime remains a
-- separate, private, read-only notification channel and does not carry tracker state.

-- Enable realtime for this table (safe to run repeatedly)
do $$
begin
  alter publication supabase_realtime add table public.downtime_shared_state;
exception when duplicate_object then null;
end $$;
