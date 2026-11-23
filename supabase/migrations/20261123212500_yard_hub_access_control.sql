-- YARD HUB access control plane.
-- Additive only: no DOWNTIME tables, payloads, users, sessions or rights are modified.
-- Central identity remains downtime_central_bank; only Hub section permissions live here.

create table if not exists public.yard_hub_tier_config (
  id smallint primary key check (id = 1),
  payload jsonb not null,
  version bigint not null default 1 check (version >= 1),
  updated_by text not null default 'SYSTEM',
  updated_at timestamptz not null default now()
);

create table if not exists public.yard_hub_access_audit (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  previous_payload jsonb not null,
  new_payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists yard_hub_access_audit_created_idx
  on public.yard_hub_access_audit (created_at desc);

alter table public.yard_hub_tier_config enable row level security;
alter table public.yard_hub_access_audit enable row level security;

revoke all on table public.yard_hub_tier_config from public, anon, authenticated;
revoke all on table public.yard_hub_access_audit from public, anon, authenticated;
grant all on table public.yard_hub_tier_config to service_role;
grant all on table public.yard_hub_access_audit to service_role;
grant usage, select on sequence public.yard_hub_access_audit_id_seq to service_role;

-- Preserve current R&M access exactly at cut-over:
-- OWNER/DEVACC/ADMIN/MANAGER/SUPERVISOR currently have R&M EDIT;
-- USER/SPECTATOR currently have no R&M access.
-- FLOOR and CHECK SHEETS remain unavailable until those modules are released.
insert into public.yard_hub_tier_config (id, payload, version, updated_by)
values (
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'tiers', jsonb_build_object(
      'OWNER',      jsonb_build_object('floor','NONE','checkSheets','NONE','repairMaintenance','EDIT'),
      'DEVACC',     jsonb_build_object('floor','NONE','checkSheets','NONE','repairMaintenance','EDIT'),
      'ADMIN',      jsonb_build_object('floor','NONE','checkSheets','NONE','repairMaintenance','EDIT'),
      'MANAGER',    jsonb_build_object('floor','NONE','checkSheets','NONE','repairMaintenance','EDIT'),
      'SUPERVISOR', jsonb_build_object('floor','NONE','checkSheets','NONE','repairMaintenance','EDIT'),
      'USER',       jsonb_build_object('floor','NONE','checkSheets','NONE','repairMaintenance','NONE'),
      'SPECTATOR',  jsonb_build_object('floor','NONE','checkSheets','NONE','repairMaintenance','NONE')
    ),
    'userTiers', coalesce((
      select jsonb_object_agg(lower(trim(account->>'username')), upper(coalesce(account->>'tier','USER')))
      from public.downtime_central_bank bank
      cross join lateral jsonb_array_elements(coalesce(bank.payload->'users','[]'::jsonb)) account
      where bank.id=1 and nullif(trim(account->>'username'),'') is not null
    ), '{}'::jsonb)
  ),
  1,
  'SYSTEM'
)
on conflict (id) do nothing;

-- Atomic compare-and-swap plus audit record. Callable only by service_role through
-- the authenticated yard-hub-settings-api Edge Function.
create or replace function public.yard_hub_save_tier_settings(
  p_expected_version bigint,
  p_next_payload jsonb,
  p_actor text
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_payload jsonb;
  current_version bigint;
  saved_version bigint;
begin
  select payload, version
    into current_payload, current_version
    from public.yard_hub_tier_config
   where id = 1
   for update;

  if current_version is null or current_version <> p_expected_version then
    return null;
  end if;

  update public.yard_hub_tier_config
     set payload = p_next_payload,
         version = current_version + 1,
         updated_by = p_actor,
         updated_at = now()
   where id = 1
   returning version into saved_version;

  insert into public.yard_hub_access_audit (
    actor, action, previous_payload, new_payload
  ) values (
    p_actor, 'tier-permissions-save', current_payload, p_next_payload
  );

  return saved_version;
end;
$$;

revoke all on function public.yard_hub_save_tier_settings(bigint, jsonb, text) from public, anon, authenticated;
grant execute on function public.yard_hub_save_tier_settings(bigint, jsonb, text) to service_role;

comment on table public.yard_hub_tier_config is
  'YARD HUB section permissions, separate from DOWNTIME Access & Rights.';
comment on table public.yard_hub_access_audit is
  'Audit history for YARD HUB tier permission changes.';
