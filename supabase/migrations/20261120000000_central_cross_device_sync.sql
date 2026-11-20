-- DOWNTIME username-only central sync schema (staged; NOT applied to production)
-- Custom sessions are not Supabase Auth JWTs. All data access must be mediated by
-- Edge Functions validating opaque session tokens. Direct client table access is denied.

create table if not exists public.downtime_app_users (
  user_id uuid primary key default gen_random_uuid(),
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9._-]{3,32}$'),
  display_name text not null,
  password_hash text not null,
  tier text not null check (tier in ('OWNER','ADMIN','MANAGER','SUPERVISOR','USER')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.downtime_auth_sessions (
  session_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.downtime_app_users(user_id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create index if not exists downtime_auth_sessions_user_idx on public.downtime_auth_sessions(user_id);
create index if not exists downtime_auth_sessions_expiry_idx on public.downtime_auth_sessions(expires_at);

create table if not exists public.downtime_staff (
  staff_id uuid primary key default gen_random_uuid(),
  name text not null unique,
  station text,
  photo_storage_path text,
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.downtime_app_users(user_id)
);

create table if not exists public.downtime_app_config (
  config_key text primary key,
  config_value jsonb not null default '{}'::jsonb,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.downtime_app_users(user_id)
);

create table if not exists public.downtime_sync_audit (
  audit_id bigint generated always as identity primary key,
  actor_id uuid references public.downtime_app_users(user_id),
  domain text not null,
  record_key text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE','IMPORT')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.downtime_shared_state add column if not exists version bigint not null default 1;

-- All custom-auth data is server-only. Service-role Edge Functions must validate
-- the custom session and authorize tier before performing any read/write.
alter table public.downtime_app_users enable row level security;
alter table public.downtime_auth_sessions enable row level security;
alter table public.downtime_staff enable row level security;
alter table public.downtime_app_config enable row level security;
alter table public.downtime_sync_audit enable row level security;
alter table public.downtime_shared_state enable row level security;

revoke all on public.downtime_app_users from anon, authenticated;
revoke all on public.downtime_auth_sessions from anon, authenticated;
revoke all on public.downtime_staff from anon, authenticated;
revoke all on public.downtime_app_config from anon, authenticated;
revoke all on public.downtime_sync_audit from anon, authenticated;
revoke all on public.downtime_shared_state from anon, authenticated;

grant all on public.downtime_app_users to service_role;
grant all on public.downtime_auth_sessions to service_role;
grant all on public.downtime_staff to service_role;
grant all on public.downtime_app_config to service_role;
grant all on public.downtime_sync_audit to service_role;
grant all on public.downtime_shared_state to service_role;
