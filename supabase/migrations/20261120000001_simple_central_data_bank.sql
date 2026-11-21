-- DOWNTIME: simplified central information bank.
-- Additive and non-destructive: source state and report/evidence tables remain unchanged.
-- One central JSON payload stores tracker data, users, tier privileges, staff profiles,
-- photos, and derived-stat inputs. User PIN values must be stored as salted hashes only.
create table if not exists public.downtime_central_bank (
  id smallint primary key check (id = 1),
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.downtime_central_bank enable row level security;
revoke all on public.downtime_central_bank from anon, authenticated;
grant all on public.downtime_central_bank to service_role;

-- Seed from the existing shared tracker once, without overwriting an existing central-bank row.
-- Source records, report archive and evidence storage are preserved.
insert into public.downtime_central_bank (id, payload, version)
select
  1,
  jsonb_build_object(
    'appData', coalesce(s.payload, '{}'::jsonb),
    'users', '[]'::jsonb,
    'tiers', jsonb_build_object(
      'OWNER', jsonb_build_object('canEditTracker',true,'canManageUsers',true,'canManageStaff',true,'canManageSettings',true,'canViewStaff',true,'canViewAssignments',true,'canViewDashboards',true,'canViewReports',true),
      'ADMIN', jsonb_build_object('canEditTracker',true,'canManageUsers',true,'canManageStaff',true,'canManageSettings',true,'canViewStaff',true,'canViewAssignments',true,'canViewDashboards',true,'canViewReports',true),
      'MANAGER', jsonb_build_object('canEditTracker',false,'canManageUsers',false,'canManageStaff',false,'canManageSettings',false,'canViewStaff',true,'canViewAssignments',true,'canViewDashboards',true,'canViewReports',true),
      'SUPERVISOR', jsonb_build_object('canEditTracker',true,'canManageUsers',false,'canManageStaff',false,'canManageSettings',false,'canViewStaff',true,'canViewAssignments',true,'canViewDashboards',true,'canViewReports',true),
      'USER', jsonb_build_object('canEditTracker',false,'canManageUsers',false,'canManageStaff',false,'canManageSettings',false,'canViewStaff',true,'canViewAssignments',true,'canViewDashboards',true,'canViewReports',true),
      'SPECTATOR', jsonb_build_object('canEditTracker',false,'canManageUsers',false,'canManageStaff',false,'canManageSettings',false,'canViewStaff',false,'canViewAssignments',false,'canViewDashboards',false,'canViewReports',false)
    ),
    'staff', jsonb_build_object(
      'roster', '["Jan","Mick","Gigi","Daz","Shayne"]'::jsonb,
      'profiles', coalesce(s.payload->'operatorProfiles','{}'::jsonb)
    ),
    'statsSource', jsonb_build_object('weeks',coalesce(s.payload->'weeks','{}'::jsonb))
  ),
  1
from public.downtime_shared_state s
where s.id = 1
on conflict (id) do nothing;

-- If the old shared state is absent, create a valid empty bank. Existing central rows are untouched.
insert into public.downtime_central_bank (id, payload, version)
values (1, jsonb_build_object('appData','{}'::jsonb,'users','[]'::jsonb,'tiers','{}'::jsonb,'staff',jsonb_build_object('roster','[]'::jsonb,'profiles','{}'::jsonb),'statsSource',jsonb_build_object('weeks','{}'::jsonb)), 1)
on conflict (id) do nothing;
