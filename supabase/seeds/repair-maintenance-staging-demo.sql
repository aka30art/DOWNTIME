-- STAGING ONLY: illustrative KIVERCO records matching the approved design reference.
-- Do not run this seed against the production database.
insert into public.repair_maintenance_faults
  (machine_type, fault_name, description, priority, status, created_by, updated_by)
select 'KIVERCO_PICKING_LINE', v.fault_name, v.description, v.priority, 'OPEN', 'R&M DEMO', 'R&M DEMO'
from (values
  ('Conveyor Belt','Tear on return section','HIGH'),
  ('Drive Motor','Excessive noise / vibration','HIGH'),
  ('Guarding','Missing side panel','MEDIUM'),
  ('Emergency Stop','Not functioning','HIGH'),
  ('Sensors','Intermittent fault','MEDIUM'),
  ('Control Panel','Fault code E-214','MEDIUM'),
  ('General','Requires full service check','LOW')
) as v(fault_name, description, priority)
where not exists (
  select 1 from public.repair_maintenance_faults f
  where f.machine_type='KIVERCO_PICKING_LINE'
    and f.fault_name=v.fault_name
    and f.created_by='R&M DEMO'
);
