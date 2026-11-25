-- GATELOG: isolated customer, vehicle and site-visit records.
-- Additive schema only. No existing DOWNTIME operational tables are changed.

create table if not exists public.gatelog_customers (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (length(trim(customer_name)) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists gatelog_customers_name_ci
  on public.gatelog_customers (lower(customer_name)) where active;

create table if not exists public.gatelog_vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.gatelog_customers(id) on delete restrict,
  registration text not null check (length(trim(registration)) between 1 and 20),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (customer_id, registration)
);
create index if not exists gatelog_vehicles_customer_idx on public.gatelog_vehicles(customer_id);

create table if not exists public.gatelog_visits (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.gatelog_customers(id) on delete restrict,
  vehicle_id uuid references public.gatelog_vehicles(id) on delete set null,
  vehicle_registration_snapshot text not null check (length(trim(vehicle_registration_snapshot)) between 1 and 20),
  visit_date date not null default (now() at time zone 'Europe/London')::date,
  time_in timestamptz not null default now(),
  time_out timestamptz,
  status text not null default 'ON_SITE' check (status in ('ON_SITE','DEPARTED')),
  created_by text not null,
  departed_by text,
  check ((status = 'ON_SITE' and time_out is null) or (status = 'DEPARTED' and time_out is not null))
);
create index if not exists gatelog_visits_active_idx on public.gatelog_visits(time_in desc) where status='ON_SITE';
create index if not exists gatelog_visits_date_idx on public.gatelog_visits(visit_date desc, time_in desc);
create index if not exists gatelog_visits_customer_idx on public.gatelog_visits(customer_id, time_in desc);

create table if not exists public.gatelog_waste_types (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.gatelog_visit_waste_types (
  visit_id uuid not null references public.gatelog_visits(id) on delete cascade,
  waste_type_id uuid not null references public.gatelog_waste_types(id) on delete restrict,
  primary key (visit_id, waste_type_id)
);

create table if not exists public.gatelog_audit (
  id bigint generated always as identity primary key,
  visit_id uuid references public.gatelog_visits(id) on delete set null,
  actor text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists gatelog_audit_visit_idx on public.gatelog_audit(visit_id, created_at desc);

alter table public.gatelog_customers enable row level security;
alter table public.gatelog_vehicles enable row level security;
alter table public.gatelog_visits enable row level security;
alter table public.gatelog_waste_types enable row level security;
alter table public.gatelog_visit_waste_types enable row level security;
alter table public.gatelog_audit enable row level security;

revoke all on public.gatelog_customers, public.gatelog_vehicles, public.gatelog_visits,
  public.gatelog_waste_types, public.gatelog_visit_waste_types, public.gatelog_audit
  from public, anon, authenticated;
grant all on public.gatelog_customers, public.gatelog_vehicles, public.gatelog_visits,
  public.gatelog_waste_types, public.gatelog_visit_waste_types, public.gatelog_audit
  to service_role;
grant usage, select on sequence public.gatelog_audit_id_seq to service_role;

comment on table public.gatelog_visits is 'GATELOG individual arrival/departure records; repeat visits are separate rows.';
comment on column public.gatelog_visits.vehicle_registration_snapshot is 'Registration captured at arrival; remains historically stable if the vehicle directory changes.';
comment on table public.gatelog_visit_waste_types is 'Many-to-many waste types assigned to an individual GATELOG visit.';
