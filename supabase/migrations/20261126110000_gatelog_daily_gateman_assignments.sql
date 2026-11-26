-- GATELOG-only daily Gateman assignment and lock register.
create table if not exists public.gatelog_daily_gateman_assignments (
  duty_date date primary key,
  gateman_username text not null,
  gateman_name text not null,
  is_locked boolean not null default false,
  assigned_by text not null,
  assigned_at timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  constraint gatelog_gateman_username_nonempty check (length(trim(gateman_username)) between 1 and 80),
  constraint gatelog_gateman_name_nonempty check (length(trim(gateman_name)) between 1 and 120),
  constraint gatelog_gateman_lock_consistent check (
    (is_locked = false and locked_by is null and locked_at is null)
    or (is_locked = true and locked_by is not null and locked_at is not null)
  )
);
alter table public.gatelog_daily_gateman_assignments enable row level security;
revoke all on public.gatelog_daily_gateman_assignments from public, anon, authenticated;
grant all on public.gatelog_daily_gateman_assignments to service_role;
comment on table public.gatelog_daily_gateman_assignments is
  'GATELOG-only daily Gateman assignment and lock register. Gateman identities are sourced from the YARD HUB central user directory; this table stores a historical display-name snapshot.';
