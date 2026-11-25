-- Cover the GATELOG foreign keys used by visit and waste-type lookups.
create index if not exists gatelog_visits_vehicle_idx
  on public.gatelog_visits(vehicle_id);
create index if not exists gatelog_visit_waste_types_waste_type_idx
  on public.gatelog_visit_waste_types(waste_type_id);
