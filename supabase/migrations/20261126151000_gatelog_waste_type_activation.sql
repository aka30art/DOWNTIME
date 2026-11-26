-- GATELOG waste-type administration. Historical visit associations are preserved when a type is disabled.
alter table public.gatelog_waste_types
  add column if not exists active boolean not null default true;
