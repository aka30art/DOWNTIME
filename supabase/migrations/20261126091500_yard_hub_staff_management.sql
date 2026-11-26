-- YARD HUB Staff Management: independent workforce directory.
-- Additive boundary: no DOWNTIME operational tables, payloads, staff roster,
-- operator assignments, reports, permissions or workflows are changed.
-- YARD HUB login accounts remain in the existing central account system;
-- this schema stores only an optional username link to an existing account.

create table if not exists public.yard_hub_staff_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  company_type text not null default 'COMPANY'
    check (company_type in ('COMPANY','AGENCY','CONTRACTOR')),
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contact_name is null or length(contact_name) <= 120),
  check (contact_email is null or length(contact_email) <= 180),
  check (contact_phone is null or length(contact_phone) <= 60),
  check (notes is null or length(notes) <= 2000)
);

create unique index if not exists yard_hub_staff_companies_name_unique
  on public.yard_hub_staff_companies (lower(name))
  where archived_at is null;
create index if not exists yard_hub_staff_companies_active_idx
  on public.yard_hub_staff_companies (is_active, name);

create table if not exists public.yard_hub_staff_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  description text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (description is null or length(description) <= 500)
);

create unique index if not exists yard_hub_staff_roles_name_unique
  on public.yard_hub_staff_roles (lower(name))
  where archived_at is null;
create index if not exists yard_hub_staff_roles_active_sort_idx
  on public.yard_hub_staff_roles (is_active, sort_order, name);

create table if not exists public.yard_hub_staff_people (
  id uuid primary key default gen_random_uuid(),
  staff_number bigint generated always as identity unique,
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  staff_type text not null check (staff_type in ('USER','STAFF')),
  employment_status text not null default 'ACTIVE'
    check (employment_status in ('ACTIVE','INACTIVE','LEFT')),
  company_id uuid references public.yard_hub_staff_companies(id) on delete restrict,
  linked_username text,
  start_date date,
  notes text,
  archived_at timestamptz,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (staff_type = 'USER' and linked_username is not null and length(btrim(linked_username)) between 2 and 32)
    or
    (staff_type = 'STAFF' and linked_username is null)
  ),
  check (notes is null or length(notes) <= 4000)
);

create unique index if not exists yard_hub_staff_people_linked_user_unique
  on public.yard_hub_staff_people (lower(linked_username))
  where linked_username is not null;
create index if not exists yard_hub_staff_people_name_idx
  on public.yard_hub_staff_people (lower(full_name));
create index if not exists yard_hub_staff_people_company_idx
  on public.yard_hub_staff_people (company_id);
create index if not exists yard_hub_staff_people_status_idx
  on public.yard_hub_staff_people (staff_type, employment_status, archived_at);

create table if not exists public.yard_hub_staff_role_assignments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.yard_hub_staff_people(id) on delete restrict,
  role_id uuid not null references public.yard_hub_staff_roles(id) on delete restrict,
  is_primary boolean not null default false,
  assigned_by text not null,
  assigned_at timestamptz not null default now(),
  ended_by text,
  ended_at timestamptz
);

create unique index if not exists yard_hub_staff_role_assignment_active_unique
  on public.yard_hub_staff_role_assignments (person_id, role_id)
  where ended_at is null;
create unique index if not exists yard_hub_staff_role_assignment_primary_unique
  on public.yard_hub_staff_role_assignments (person_id)
  where ended_at is null and is_primary;
create index if not exists yard_hub_staff_role_assignment_person_idx
  on public.yard_hub_staff_role_assignments (person_id, ended_at);
create index if not exists yard_hub_staff_role_assignment_role_idx
  on public.yard_hub_staff_role_assignments (role_id, ended_at);

create table if not exists public.yard_hub_staff_audit (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('PERSON','COMPANY','ROLE')),
  entity_id uuid not null,
  action text not null check (action in ('CREATED','UPDATED','ARCHIVED')),
  actor text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists yard_hub_staff_audit_created_idx
  on public.yard_hub_staff_audit (created_at desc);
create index if not exists yard_hub_staff_audit_entity_idx
  on public.yard_hub_staff_audit (entity_type, entity_id, created_at desc);

-- Atomic personnel save with role assignment history and audit.
create or replace function public.yard_hub_staff_save_person(
  p_person_id uuid,
  p_full_name text,
  p_display_name text,
  p_staff_type text,
  p_employment_status text,
  p_company_id uuid,
  p_linked_username text,
  p_start_date date,
  p_notes text,
  p_role_ids uuid[],
  p_primary_role_id uuid,
  p_actor text
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_person public.yard_hub_staff_people%rowtype;
  v_before jsonb;
  v_action text;
  v_role_id uuid;
  v_assignment_id uuid;
  v_role_count integer;
  v_role_ids uuid[] := coalesce(p_role_ids, '{}'::uuid[]);
begin
  if length(btrim(coalesce(p_full_name,''))) not between 1 and 120
     or length(btrim(coalesce(p_display_name,''))) not between 1 and 80 then
    raise exception 'A valid full name and display name are required.';
  end if;
  if p_staff_type not in ('USER','STAFF')
     or p_employment_status not in ('ACTIVE','INACTIVE','LEFT') then
    raise exception 'Invalid staff classification or employment status.';
  end if;
  if (p_staff_type = 'USER' and nullif(btrim(p_linked_username),'') is null)
     or (p_staff_type = 'STAFF' and nullif(btrim(p_linked_username),'') is not null) then
    raise exception 'USER records require one linked YARD HUB account; STAFF records cannot have an account link.';
  end if;
  if cardinality(v_role_ids) > 12 then
    raise exception 'A person may have no more than 12 active yard roles.';
  end if;
  if p_primary_role_id is not null and not (p_primary_role_id = any(v_role_ids)) then
    raise exception 'The primary role must also be included in the role assignments.';
  end if;
  select count(*) into v_role_count
    from public.yard_hub_staff_roles
   where id = any(v_role_ids) and is_active and archived_at is null;
  if v_role_count <> cardinality(v_role_ids) then
    raise exception 'One or more selected yard roles are unavailable.';
  end if;
  if p_company_id is not null and not exists (
    select 1 from public.yard_hub_staff_companies
     where id = p_company_id and is_active and archived_at is null
  ) then
    raise exception 'The selected company or agency is unavailable.';
  end if;

  if p_person_id is null then
    insert into public.yard_hub_staff_people (
      full_name, display_name, staff_type, employment_status, company_id,
      linked_username, start_date, notes, created_by, updated_by
    ) values (
      btrim(p_full_name), btrim(p_display_name), p_staff_type, p_employment_status,
      p_company_id, nullif(btrim(p_linked_username),''), p_start_date,
      nullif(btrim(coalesce(p_notes,'')),''), p_actor, p_actor
    ) returning * into v_person;
    v_before := null;
    v_action := 'CREATED';
  else
    select * into v_person
      from public.yard_hub_staff_people
     where id = p_person_id and archived_at is null
     for update;
    if not found then raise exception 'Staff record not found or archived.'; end if;
    v_before := to_jsonb(v_person);
    update public.yard_hub_staff_people
       set full_name = btrim(p_full_name),
           display_name = btrim(p_display_name),
           staff_type = p_staff_type,
           employment_status = p_employment_status,
           company_id = p_company_id,
           linked_username = nullif(btrim(p_linked_username),''),
           start_date = p_start_date,
           notes = nullif(btrim(coalesce(p_notes,'')),''),
           updated_by = p_actor,
           updated_at = now()
     where id = p_person_id
     returning * into v_person;
    v_action := 'UPDATED';
  end if;

  update public.yard_hub_staff_role_assignments
     set ended_at = now(), ended_by = p_actor
   where person_id = v_person.id
     and ended_at is null
     and (
       not (role_id = any(v_role_ids))
       or is_primary <> coalesce(role_id = p_primary_role_id, false)
     );

  foreach v_role_id in array v_role_ids loop
    select id into v_assignment_id
      from public.yard_hub_staff_role_assignments
     where person_id = v_person.id and role_id = v_role_id and ended_at is null
     for update;
    if v_assignment_id is null then
      insert into public.yard_hub_staff_role_assignments (
        person_id, role_id, is_primary, assigned_by
      ) values (
        v_person.id, v_role_id, coalesce(v_role_id = p_primary_role_id, false), p_actor
      );
    else
      update public.yard_hub_staff_role_assignments
         set is_primary = (v_role_id = p_primary_role_id)
       where id = v_assignment_id;
    end if;
    v_assignment_id := null;
  end loop;

  insert into public.yard_hub_staff_audit (
    entity_type, entity_id, action, actor, before_data, after_data
  ) values (
    'PERSON', v_person.id, v_action, p_actor, v_before,
    jsonb_build_object(
      'person', to_jsonb(v_person),
      'roleIds', to_jsonb(v_role_ids),
      'primaryRoleId', p_primary_role_id
    )
  );
  return jsonb_build_object('person', to_jsonb(v_person));
end;
$$;

create or replace function public.yard_hub_staff_save_company(
  p_company_id uuid,
  p_name text,
  p_company_type text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_notes text,
  p_actor text
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company public.yard_hub_staff_companies%rowtype;
  v_before jsonb;
  v_action text;
begin
  if length(btrim(coalesce(p_name,''))) not between 1 and 120
     or p_company_type not in ('COMPANY','AGENCY','CONTRACTOR') then
    raise exception 'A valid organisation name and type are required.';
  end if;
  if p_company_id is null then
    insert into public.yard_hub_staff_companies (
      name, company_type, contact_name, contact_email, contact_phone, notes,
      created_by, updated_by
    ) values (
      btrim(p_name), p_company_type, nullif(btrim(coalesce(p_contact_name,'')),''),
      nullif(btrim(coalesce(p_contact_email,'')),''), nullif(btrim(coalesce(p_contact_phone,'')),''),
      nullif(btrim(coalesce(p_notes,'')),''), p_actor, p_actor
    ) returning * into v_company;
    v_before := null; v_action := 'CREATED';
  else
    select * into v_company from public.yard_hub_staff_companies
     where id=p_company_id and archived_at is null for update;
    if not found then raise exception 'Company or agency not found or archived.'; end if;
    v_before := to_jsonb(v_company);
    update public.yard_hub_staff_companies
       set name=btrim(p_name), company_type=p_company_type,
           contact_name=nullif(btrim(coalesce(p_contact_name,'')),''),
           contact_email=nullif(btrim(coalesce(p_contact_email,'')),''),
           contact_phone=nullif(btrim(coalesce(p_contact_phone,'')),''),
           notes=nullif(btrim(coalesce(p_notes,'')),''),
           updated_by=p_actor, updated_at=now()
     where id=p_company_id returning * into v_company;
    v_action := 'UPDATED';
  end if;
  insert into public.yard_hub_staff_audit(entity_type,entity_id,action,actor,before_data,after_data)
  values('COMPANY',v_company.id,v_action,p_actor,v_before,to_jsonb(v_company));
  return to_jsonb(v_company);
end;
$$;

create or replace function public.yard_hub_staff_save_role(
  p_role_id uuid,
  p_name text,
  p_description text,
  p_sort_order integer,
  p_actor text
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_role public.yard_hub_staff_roles%rowtype;
  v_before jsonb;
  v_action text;
begin
  if length(btrim(coalesce(p_name,''))) not between 1 and 80 then
    raise exception 'A valid yard role name is required.';
  end if;
  if p_role_id is null then
    insert into public.yard_hub_staff_roles(name,description,sort_order,created_by,updated_by)
    values(btrim(p_name),nullif(btrim(coalesce(p_description,'')),''),coalesce(p_sort_order,100),p_actor,p_actor)
    returning * into v_role;
    v_before := null; v_action := 'CREATED';
  else
    select * into v_role from public.yard_hub_staff_roles
     where id=p_role_id and archived_at is null for update;
    if not found then raise exception 'Yard role not found or archived.'; end if;
    v_before := to_jsonb(v_role);
    update public.yard_hub_staff_roles
       set name=btrim(p_name), description=nullif(btrim(coalesce(p_description,'')),''),
           sort_order=coalesce(p_sort_order,100), updated_by=p_actor, updated_at=now()
     where id=p_role_id returning * into v_role;
    v_action := 'UPDATED';
  end if;
  insert into public.yard_hub_staff_audit(entity_type,entity_id,action,actor,before_data,after_data)
  values('ROLE',v_role.id,v_action,p_actor,v_before,to_jsonb(v_role));
  return to_jsonb(v_role);
end;
$$;

create or replace function public.yard_hub_staff_archive_person(p_person_id uuid, p_actor text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_person public.yard_hub_staff_people%rowtype;
  v_before jsonb;
begin
  select * into v_person from public.yard_hub_staff_people
   where id=p_person_id and archived_at is null for update;
  if not found then raise exception 'Staff record not found or already archived.'; end if;
  v_before := to_jsonb(v_person);
  update public.yard_hub_staff_people
     set archived_at=now(), updated_by=p_actor, updated_at=now()
   where id=p_person_id returning * into v_person;
  update public.yard_hub_staff_role_assignments
     set ended_at=now(), ended_by=p_actor
   where person_id=p_person_id and ended_at is null;
  insert into public.yard_hub_staff_audit(entity_type,entity_id,action,actor,before_data,after_data)
  values('PERSON',p_person_id,'ARCHIVED',p_actor,v_before,to_jsonb(v_person));
  return to_jsonb(v_person);
end;
$$;

create or replace function public.yard_hub_staff_archive_company(p_company_id uuid, p_actor text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company public.yard_hub_staff_companies%rowtype;
  v_before jsonb;
begin
  select * into v_company from public.yard_hub_staff_companies
   where id=p_company_id and archived_at is null for update;
  if not found then raise exception 'Company or agency not found or already archived.'; end if;
  v_before := to_jsonb(v_company);
  update public.yard_hub_staff_companies
     set is_active=false, archived_at=now(), updated_by=p_actor, updated_at=now()
   where id=p_company_id returning * into v_company;
  insert into public.yard_hub_staff_audit(entity_type,entity_id,action,actor,before_data,after_data)
  values('COMPANY',p_company_id,'ARCHIVED',p_actor,v_before,to_jsonb(v_company));
  return to_jsonb(v_company);
end;
$$;

create or replace function public.yard_hub_staff_archive_role(p_role_id uuid, p_actor text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_role public.yard_hub_staff_roles%rowtype;
  v_before jsonb;
begin
  select * into v_role from public.yard_hub_staff_roles
   where id=p_role_id and archived_at is null for update;
  if not found then raise exception 'Yard role not found or already archived.'; end if;
  v_before := to_jsonb(v_role);
  update public.yard_hub_staff_roles
     set is_active=false, archived_at=now(), updated_by=p_actor, updated_at=now()
   where id=p_role_id returning * into v_role;
  insert into public.yard_hub_staff_audit(entity_type,entity_id,action,actor,before_data,after_data)
  values('ROLE',p_role_id,'ARCHIVED',p_actor,v_before,to_jsonb(v_role));
  return to_jsonb(v_role);
end;
$$;

alter table public.yard_hub_staff_companies enable row level security;
alter table public.yard_hub_staff_roles enable row level security;
alter table public.yard_hub_staff_people enable row level security;
alter table public.yard_hub_staff_role_assignments enable row level security;
alter table public.yard_hub_staff_audit enable row level security;

-- No browser/API role accesses these tables directly. All calls go through the
-- session-validated YARD HUB Edge Function. Deny anonymous/authenticated roles.
create policy yard_hub_staff_companies_deny_client on public.yard_hub_staff_companies
  for all to anon, authenticated using (false) with check (false);
create policy yard_hub_staff_roles_deny_client on public.yard_hub_staff_roles
  for all to anon, authenticated using (false) with check (false);
create policy yard_hub_staff_people_deny_client on public.yard_hub_staff_people
  for all to anon, authenticated using (false) with check (false);
create policy yard_hub_staff_role_assignments_deny_client on public.yard_hub_staff_role_assignments
  for all to anon, authenticated using (false) with check (false);
create policy yard_hub_staff_audit_deny_client on public.yard_hub_staff_audit
  for all to anon, authenticated using (false) with check (false);

revoke all on table public.yard_hub_staff_companies, public.yard_hub_staff_roles,
  public.yard_hub_staff_people, public.yard_hub_staff_role_assignments,
  public.yard_hub_staff_audit from public, anon, authenticated;
grant all on table public.yard_hub_staff_companies, public.yard_hub_staff_roles,
  public.yard_hub_staff_people, public.yard_hub_staff_role_assignments,
  public.yard_hub_staff_audit to service_role;
grant usage, select on sequence public.yard_hub_staff_people_staff_number_seq,
  public.yard_hub_staff_audit_id_seq to service_role;

revoke all on function public.yard_hub_staff_save_person(uuid,text,text,text,text,uuid,text,date,text,uuid[],uuid,text) from public, anon, authenticated;
revoke all on function public.yard_hub_staff_save_company(uuid,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.yard_hub_staff_save_role(uuid,text,text,integer,text) from public, anon, authenticated;
revoke all on function public.yard_hub_staff_archive_person(uuid,text) from public, anon, authenticated;
revoke all on function public.yard_hub_staff_archive_company(uuid,text) from public, anon, authenticated;
revoke all on function public.yard_hub_staff_archive_role(uuid,text) from public, anon, authenticated;
grant execute on function public.yard_hub_staff_save_person(uuid,text,text,text,text,uuid,text,date,text,uuid[],uuid,text) to service_role;
grant execute on function public.yard_hub_staff_save_company(uuid,text,text,text,text,text,text,text) to service_role;
grant execute on function public.yard_hub_staff_save_role(uuid,text,text,integer,text) to service_role;
grant execute on function public.yard_hub_staff_archive_person(uuid,text) to service_role;
grant execute on function public.yard_hub_staff_archive_company(uuid,text) to service_role;
grant execute on function public.yard_hub_staff_archive_role(uuid,text) to service_role;

comment on table public.yard_hub_staff_people is
  'YARD HUB workforce directory. Separate from DOWNTIME operator rosters and operational records.';
comment on table public.yard_hub_staff_companies is
  'Configurable employer, company, agency and contractor directory for YARD HUB staff profiles.';
comment on table public.yard_hub_staff_roles is
  'Configurable yard job roles. These are operational job descriptions, not YARD HUB security tiers.';
comment on table public.yard_hub_staff_role_assignments is
  'Current and historical role assignments for YARD HUB staff people.';
comment on table public.yard_hub_staff_audit is
  'Append-only audit history for YARD HUB staff, company and yard role changes.';

-- Curated starter roles; administrators can rename, reorder or archive these later.
insert into public.yard_hub_staff_roles (name, description, sort_order, created_by, updated_by)
select seed.name, seed.description, seed.sort_order, 'SYSTEM', 'SYSTEM'
from (values
  ('Yard Operative', 'General yard operations and material handling', 10),
  ('Machine Operator', 'Authorised operation of assigned yard machinery', 20),
  ('Forklift Driver', 'Authorised forklift operation', 30),
  ('Weighbridge Operator', 'Weighbridge and vehicle recording duties', 40),
  ('Banksman', 'Vehicle movement guidance and site marshalling', 50),
  ('Yard Supervisor', 'Day-to-day yard supervision and coordination', 60),
  ('Site Manager', 'Site-level operational management', 70),
  ('Mechanic', 'Maintenance and mechanical support', 80),
  ('Administrator', 'Administrative and office support', 90)
) as seed(name, description, sort_order)
where not exists (
  select 1 from public.yard_hub_staff_roles existing
  where lower(existing.name) = lower(seed.name) and existing.archived_at is null
);

