-- R&M machine-specific preset lists plus the separate YARD HUB MECHANIC tier.
-- Additive only: existing fault records and DOWNTIME identity / permissions remain unchanged.
create table if not exists public.repair_maintenance_machine_presets (
  id uuid primary key default gen_random_uuid(),
  machine_type text not null check (machine_type in ('KIVERCO_PICKING_LINE','TANNA_SHREDDER','FORKLIFT','TELEHANDLER','EXCAVATORS_360','OTHER_EQUIPMENT')),
  name text not null check (length(trim(name)) between 1 and 80),
  is_other boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists repair_maintenance_machine_presets_machine_name_uidx on public.repair_maintenance_machine_presets (machine_type, lower(name));
create index if not exists repair_maintenance_machine_presets_machine_created_idx on public.repair_maintenance_machine_presets (machine_type, is_other, created_at);
alter table public.repair_maintenance_machine_presets enable row level security;
revoke all on table public.repair_maintenance_machine_presets from public, anon, authenticated;
grant all on table public.repair_maintenance_machine_presets to service_role;

insert into public.repair_maintenance_machine_presets (machine_type, name, is_other, created_by)
select machine_type, 'OTHER — ENTER MANUALLY', true, 'SYSTEM'
from unnest(array['KIVERCO_PICKING_LINE','TANNA_SHREDDER','FORKLIFT','TELEHANDLER','EXCAVATORS_360','OTHER_EQUIPMENT']::text[]) as machine_type
on conflict do nothing;

-- Add MECHANIC only to YARD HUB's isolated tier profile. Existing profiles and user
-- assignments are preserved. MECHANIC can work in R&M only.
do $$
declare previous_payload jsonb; next_payload jsonb; current_version bigint;
begin
  select payload, version into previous_payload, current_version from public.yard_hub_tier_config where id=1 for update;
  if previous_payload is null then raise exception 'YARD HUB tier configuration is missing; cannot add MECHANIC safely.'; end if;
  if not (coalesce(previous_payload->'tiers','{}'::jsonb) ? 'MECHANIC') then
    next_payload := jsonb_set(previous_payload,'{tiers,MECHANIC}',jsonb_build_object('floor','NONE','checkSheets','NONE','repairMaintenance','EDIT'),true);
    update public.yard_hub_tier_config set payload=next_payload,version=current_version+1,updated_by='SYSTEM',updated_at=now() where id=1;
    insert into public.yard_hub_access_audit(actor,action,previous_payload,new_payload) values('SYSTEM','tier-mechanic-added',previous_payload,next_payload);
  end if;
end;
$$;
