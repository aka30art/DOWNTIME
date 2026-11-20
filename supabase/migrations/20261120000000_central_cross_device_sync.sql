-- DOWNTIME central multi-device schema (additive; staged rollout)
-- This migration is intentionally NOT applied to production yet. Authentication/session
-- bootstrap and the app data adapter must be ready before live cutover.

create table if not exists public.downtime_app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  tier text not null check (tier in ('OWNER','ADMIN','MANAGER','SUPERVISOR','USER','SPECTATOR')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.downtime_staff (
  staff_id uuid primary key default gen_random_uuid(),
  name text not null unique,
  station text,
  photo_storage_path text,
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.downtime_app_config (
  config_key text primary key,
  config_value jsonb not null default '{}'::jsonb,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.downtime_sync_audit (
  audit_id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  domain text not null,
  record_key text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE','IMPORT')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

-- Existing shared tracker row gets an optimistic-concurrency version.
alter table public.downtime_shared_state
  add column if not exists version bigint not null default 1;

-- Enable RLS on new tables.
alter table public.downtime_app_users enable row level security;
alter table public.downtime_staff enable row level security;
alter table public.downtime_app_config enable row level security;
alter table public.downtime_sync_audit enable row level security;

-- No anonymous access. Authenticated users may read their profile; enabled
-- application users may read shared STAFF/config. Only trusted app_metadata tiers
-- can administer these records. Tier claims must be assigned server-side.
drop policy if exists "downtime_app_users_self_or_admin_read" on public.downtime_app_users;
create policy "downtime_app_users_self_or_admin_read" on public.downtime_app_users
  for select to authenticated
  using (user_id = auth.uid() or (auth.jwt()->'app_metadata'->>'tier') in ('OWNER','ADMIN'));

-- Split write policies to protect OWNER and ADMIN accounts from privilege escalation.
-- ADMIN may manage ordinary tiers only; OWNER may manage every non-OWNER profile.
drop policy if exists "downtime_app_users_admin_manage" on public.downtime_app_users;
drop policy if exists "downtime_app_users_admin_insert" on public.downtime_app_users;
drop policy if exists "downtime_app_users_admin_update" on public.downtime_app_users;
drop policy if exists "downtime_app_users_admin_delete" on public.downtime_app_users;

create policy "downtime_app_users_admin_insert" on public.downtime_app_users
  for insert to authenticated
  with check (
    (auth.jwt()->'app_metadata'->>'tier') = 'OWNER'
    or (
      (auth.jwt()->'app_metadata'->>'tier') = 'ADMIN'
      and tier not in ('OWNER','ADMIN')
    )
  );

create policy "downtime_app_users_admin_update" on public.downtime_app_users
  for update to authenticated
  using (
    (auth.jwt()->'app_metadata'->>'tier') = 'OWNER'
    or (
      (auth.jwt()->'app_metadata'->>'tier') = 'ADMIN'
      and tier not in ('OWNER','ADMIN')
    )
  )
  with check (
    (auth.jwt()->'app_metadata'->>'tier') = 'OWNER'
    or (
      (auth.jwt()->'app_metadata'->>'tier') = 'ADMIN'
      and tier not in ('OWNER','ADMIN')
    )
  );

create policy "downtime_app_users_admin_delete" on public.downtime_app_users
  for delete to authenticated
  using (
    (auth.jwt()->'app_metadata'->>'tier') = 'OWNER'
    or (
      (auth.jwt()->'app_metadata'->>'tier') = 'ADMIN'
      and tier not in ('OWNER','ADMIN')
    )
  );

drop policy if exists "downtime_staff_authenticated_read" on public.downtime_staff;
create policy "downtime_staff_authenticated_read" on public.downtime_staff
  for select to authenticated using (true);

drop policy if exists "downtime_staff_admin_manage" on public.downtime_staff;
create policy "downtime_staff_admin_manage" on public.downtime_staff
  for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'tier') in ('OWNER','ADMIN'))
  with check ((auth.jwt()->'app_metadata'->>'tier') in ('OWNER','ADMIN'));

drop policy if exists "downtime_config_authenticated_read" on public.downtime_app_config;
create policy "downtime_config_authenticated_read" on public.downtime_app_config
  for select to authenticated using (true);

drop policy if exists "downtime_config_admin_manage" on public.downtime_app_config;
create policy "downtime_config_admin_manage" on public.downtime_app_config
  for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'tier') in ('OWNER','ADMIN'))
  with check ((auth.jwt()->'app_metadata'->>'tier') in ('OWNER','ADMIN'));

drop policy if exists "downtime_audit_admin_read" on public.downtime_sync_audit;
create policy "downtime_audit_admin_read" on public.downtime_sync_audit
  for select to authenticated
  using ((auth.jwt()->'app_metadata'->>'tier') in ('OWNER','ADMIN'));

-- Tracker payload reads are authenticated only; modifications are tier-gated.
drop policy if exists "Authenticated users can read downtime state" on public.downtime_shared_state;
create policy "Authenticated users can read downtime state" on public.downtime_shared_state
  for select to authenticated using (true);

drop policy if exists "Authenticated users can insert downtime state" on public.downtime_shared_state;
create policy "Tracker roles can insert downtime state" on public.downtime_shared_state
  for insert to authenticated
  with check ((auth.jwt()->'app_metadata'->>'tier') in ('OWNER','ADMIN','SUPERVISOR'));

drop policy if exists "Authenticated users can update downtime state" on public.downtime_shared_state;
create policy "Tracker roles can update downtime state" on public.downtime_shared_state
  for update to authenticated
  using ((auth.jwt()->'app_metadata'->>'tier') in ('OWNER','ADMIN','SUPERVISOR'))
  with check ((auth.jwt()->'app_metadata'->>'tier') in ('OWNER','ADMIN','SUPERVISOR'));

-- Realtime is expanded to the new shared domains. This migration assumes the
-- supabase_realtime publication exists (it does in the audited live project).
alter publication supabase_realtime add table public.downtime_staff;
alter publication supabase_realtime add table public.downtime_app_users;
alter publication supabase_realtime add table public.downtime_app_config;
