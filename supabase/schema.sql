-- DOWNTIME LIVE — Supabase schema
-- Shared state record; only authenticated Supabase users may read/write.
create table if not exists public.downtime_shared_state (
  id smallint primary key default 1 check (id = 1),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.downtime_shared_state enable row level security;

drop policy if exists "Authenticated users can read downtime state" on public.downtime_shared_state;
create policy "Authenticated users can read downtime state"
on public.downtime_shared_state for select to authenticated using (true);

-- Spectator mode: unauthenticated visitors receive read-only access to shared state.
grant select on table public.downtime_shared_state to anon;
drop policy if exists "Unauthenticated spectators can read downtime state" on public.downtime_shared_state;
create policy "Unauthenticated spectators can read downtime state"
on public.downtime_shared_state for select to anon using (true);

drop policy if exists "Authenticated users can insert downtime state" on public.downtime_shared_state;
create policy "Authenticated users can insert downtime state"
on public.downtime_shared_state for insert to authenticated with check (true);

drop policy if exists "Authenticated users can update downtime state" on public.downtime_shared_state;
create policy "Authenticated users can update downtime state"
on public.downtime_shared_state for update to authenticated using (true) with check (true);

-- Enable realtime for this table (safe to run repeatedly)
do $$
begin
  alter publication supabase_realtime add table public.downtime_shared_state;
exception when duplicate_object then null;
end $$;
