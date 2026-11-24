-- Cover the composite asset/category foreign key on R&M fault records.
-- This supports efficient parent checks when machinery registry rows are updated
-- or archived and avoids sequential scans on the child table.
create index if not exists repair_maintenance_faults_asset_machine_idx
  on public.repair_maintenance_faults (asset_id, machine_type);
