-- Isolated configuration control plane for Central Data Bank Admin.
-- Draft/published configuration is stored separately from downtime_central_bank.appData.
-- No tracker data is overwritten or made live by this migration.

create table if not exists public.downtime_central_config_state (
  id smallint primary key check (id = 1),
  draft_payload jsonb not null,
  draft_version bigint not null default 1,
  published_payload jsonb not null,
  published_version bigint not null default 1,
  next_version bigint not null default 2,
  updated_by text not null default 'SYSTEM',
  updated_at timestamptz not null default now(),
  published_by text not null default 'SYSTEM',
  published_at timestamptz not null default now()
);

create table if not exists public.downtime_central_config_history (
  version bigint primary key,
  payload jsonb not null,
  parent_version bigint,
  action text not null check (action in ('initial','draft-save','publish','restore-draft')),
  actor text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  published_at timestamptz
);

alter table public.downtime_central_config_state enable row level security;
alter table public.downtime_central_config_history enable row level security;
revoke all on public.downtime_central_config_state from public, anon, authenticated;
revoke all on public.downtime_central_config_history from public, anon, authenticated;
grant all on public.downtime_central_config_state to service_role;
grant all on public.downtime_central_config_history to service_role;

-- Start from existing presets and shift data, but do not connect this registry to
-- the live tracker. Both draft and published v1 are an identical baseline snapshot.
do $$
declare
  source_payload jsonb := '{}'::jsonb;
  initial_config jsonb;
begin
  select coalesce(payload, '{}'::jsonb)
    into source_payload
    from public.downtime_central_bank
    where id = 1;

  initial_config := jsonb_build_object(
    'schemaVersion', 1,
    'organization', jsonb_build_object(
      'companyName', '',
      'siteCode', '',
      'timezone', 'Europe/London',
      'locale', 'en-GB'
    ),
    'structure', jsonb_build_object(
      'sites', '[]'::jsonb,
      'plants', '[]'::jsonb,
      'areas', '[]'::jsonb,
      'stations', '[]'::jsonb
    ),
    'libraries', jsonb_build_object(
      'areaPresets', coalesce(source_payload->'appData'->'areas', '[]'::jsonb),
      'downtimeReasons', coalesce(source_payload->'appData'->'reasons', '[]'::jsonb),
      'dailyTaskPresets', coalesce(source_payload->'appData'->'dailyTaskPresets', '[]'::jsonb),
      'equipmentCategories', '[]'::jsonb,
      'eventCategories', '[]'::jsonb,
      'statusCategories', '["Running","Stopped","Maintenance","Unavailable"]'::jsonb
    ),
    'defaults', jsonb_build_object(
      'shiftSchedule', coalesce(source_payload->'appData'->'shiftSchedule', '{}'::jsonb),
      'shiftPresets', coalesce(source_payload->'appData'->'shiftPresets', '[]'::jsonb),
      'weekStartsOn', 'MONDAY',
      'operatingDays', '["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"]'::jsonb,
      'breakDeductionMinutes', 75
    )
  );

  insert into public.downtime_central_config_state (
    id, draft_payload, draft_version, published_payload, published_version,
    next_version, updated_by, published_by
  ) values (
    1, initial_config, 1, initial_config, 1, 2, 'SYSTEM', 'SYSTEM'
  ) on conflict (id) do nothing;

  insert into public.downtime_central_config_history (
    version, payload, parent_version, action, actor, note, published_at
  )
  select 1, draft_payload, null, 'initial', 'SYSTEM',
         'Initial isolated configuration baseline copied from existing presets; not connected to live tracker.',
         published_at
  from public.downtime_central_config_state
  where id = 1
  on conflict (version) do nothing;
end $$;
