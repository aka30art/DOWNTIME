create schema if not exists staff_management authorization postgres;
revoke all on schema staff_management from public, anon, authenticated;
grant usage on schema staff_management to service_role;

create table staff_management.staff_site_roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique,
  display_name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_site_roles_key_format check (role_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint staff_site_roles_name_length check (length(btrim(display_name)) between 2 and 80)
);

create table staff_management.staff_members (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  site_role_id uuid not null references staff_management.staff_site_roles(id) on update restrict on delete restrict,
  status text not null default 'ACTIVE',
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint staff_members_name_length check (length(btrim(display_name)) between 1 and 120),
  constraint staff_members_status_check check (status in ('ACTIVE','ARCHIVED')),
  constraint staff_members_archive_consistency check (
    (status = 'ACTIVE' and archived_at is null) or
    (status = 'ARCHIVED' and archived_at is not null)
  ),
  constraint staff_members_created_by_length check (length(btrim(created_by)) between 1 and 80),
  constraint staff_members_updated_by_length check (length(btrim(updated_by)) between 1 and 80)
);
create index staff_members_status_name_idx on staff_management.staff_members (status, lower(display_name));
create index staff_members_role_idx on staff_management.staff_members (site_role_id);

create table staff_management.staff_account_links (
  id uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null references staff_management.staff_members(id) on update restrict on delete restrict,
  account_username text not null,
  linked_by text not null,
  linked_at timestamptz not null default now(),
  unlinked_by text,
  unlinked_at timestamptz,
  constraint staff_account_links_username_length check (length(btrim(account_username)) between 1 and 80),
  constraint staff_account_links_linked_by_length check (length(btrim(linked_by)) between 1 and 80),
  constraint staff_account_links_unlink_consistency check (
    (unlinked_at is null and unlinked_by is null) or
    (unlinked_at is not null and unlinked_by is not null)
  ),
  constraint staff_account_links_unlinked_by_length check (unlinked_by is null or length(btrim(unlinked_by)) between 1 and 80)
);
create unique index staff_account_links_active_username_uidx on staff_management.staff_account_links (lower(account_username)) where unlinked_at is null;
create unique index staff_account_links_active_staff_uidx on staff_management.staff_account_links (staff_member_id) where unlinked_at is null;
create index staff_account_links_history_idx on staff_management.staff_account_links (staff_member_id, linked_at desc);

create table staff_management.staff_audit_logs (
  id bigint generated always as identity primary key,
  actor_username text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now(),
  constraint staff_audit_actor_length check (length(btrim(actor_username)) between 1 and 80),
  constraint staff_audit_action_check check (action in ('CREATE','UPDATE','ARCHIVE','RESTORE','LINK_ACCOUNT','UNLINK_ACCOUNT','CREATE_ROLE','UPDATE_ROLE','ARCHIVE_ROLE')),
  constraint staff_audit_entity_check check (entity_type in ('STAFF_MEMBER','SITE_ROLE','ACCOUNT_LINK'))
);

create or replace function staff_management.set_updated_at()
returns trigger language plpgsql set search_path = staff_management, pg_temp
as $$ begin new.updated_at = now(); return new; end; $$;
create trigger staff_site_roles_updated_at before update on staff_management.staff_site_roles
for each row execute function staff_management.set_updated_at();
create trigger staff_members_updated_at before update on staff_management.staff_members
for each row execute function staff_management.set_updated_at();

create or replace function staff_management.prevent_audit_mutation()
returns trigger language plpgsql set search_path = staff_management, pg_temp
as $$ begin raise exception 'STAFF MANAGEMENT audit records are append-only'; end; $$;
create trigger staff_audit_logs_no_update before update or delete on staff_management.staff_audit_logs
for each row execute function staff_management.prevent_audit_mutation();

alter table staff_management.staff_site_roles enable row level security;
alter table staff_management.staff_members enable row level security;
alter table staff_management.staff_account_links enable row level security;
alter table staff_management.staff_audit_logs enable row level security;
revoke all on all tables in schema staff_management from public, anon, authenticated;
revoke all on all sequences in schema staff_management from public, anon, authenticated;
revoke all on all functions in schema staff_management from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema staff_management to service_role;
grant usage, select on all sequences in schema staff_management to service_role;
grant execute on all functions in schema staff_management to service_role;

insert into staff_management.staff_site_roles (role_key, display_name, sort_order) values
('machine_operator','Machine Operator',10),
('yard_operative','Yard Operative',20),
('forklift_driver','Forklift Driver',30),
('telehandler_operator','Telehandler Operator',40),
('weighbridge_operator','Weighbridge Operator',50),
('picking_line_operative','Picking Line Operative',60),
('shredder_operator','Shredder Operator',70),
('maintenance_operative','Maintenance Operative',80),
('supervisor','Supervisor',90),
('manager','Manager',100)
on conflict (role_key) do nothing;

comment on schema staff_management is 'Isolated YARD HUB STAFF MANAGEMENT schema. Not exposed through the Supabase Data API; access via its dedicated authenticated Edge Function only.';
comment on table staff_management.staff_members is 'On-site personnel directory. Intentionally excludes contact details and employment start/end history.';
comment on table staff_management.staff_site_roles is 'Configurable on-site operational roles; independent of YARD HUB account tiers and app permissions.';
comment on table staff_management.staff_account_links is 'Historical optional links to existing YARD HUB accounts. Links require an immutable account identifier.';
comment on table staff_management.staff_audit_logs is 'Append-only audit history for STAFF MANAGEMENT changes.';
