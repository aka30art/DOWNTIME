-- Align the database status contract with the R&M UI while preserving legacy values.
-- Older records may still use IN PROGRESS or REPAIRED; keep those valid so they remain editable.
alter table public.repair_maintenance_faults
  drop constraint if exists repair_maintenance_faults_status_check;

alter table public.repair_maintenance_faults
  add constraint repair_maintenance_faults_status_check
  check (status in ('OPEN', 'PERM. FIX', 'IN PROGRESS', 'REPAIRED'));
