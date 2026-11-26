-- GATELOG visit-level maintenance.
-- All writes are atomic and remain inside GATELOG tables; deletion details are retained in gatelog_audit.

create or replace function public.gatelog_update_visit(
  p_visit_id uuid,
  p_customer_id uuid,
  p_registration text,
  p_visit_date date,
  p_time_in timestamptz,
  p_time_out timestamptz,
  p_waste_types text[],
  p_actor text
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing record;
  v_customer_name text;
  v_registration text := upper(trim(coalesce(p_registration,'')));
  v_vehicle_id uuid;
  v_labels text[];
  v_label text;
  v_waste_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_actor text := coalesce(nullif(trim(p_actor),''),'SYSTEM');
begin
  select v.id,v.customer_id,c.customer_name,v.vehicle_registration_snapshot,
         v.visit_date,v.time_in,v.time_out,v.status,v.departed_by
    into v_existing
    from public.gatelog_visits v
    join public.gatelog_customers c on c.id=v.customer_id
   where v.id=p_visit_id
   for update of v;
  if not found then raise exception 'Visit not found or already removed'; end if;

  select customer_name into v_customer_name
    from public.gatelog_customers where id=p_customer_id;
  if not found then raise exception 'Selected customer was not found'; end if;
  if v_registration='' or length(v_registration)>20 then
    raise exception 'Enter a valid vehicle registration';
  end if;
  if p_visit_date is null or p_time_in is null then
    raise exception 'Visit date and Time In are required';
  end if;
  if p_visit_date <> (p_time_in at time zone 'Europe/London')::date then
    raise exception 'Visit date must match the UK date of Time In';
  end if;
  if p_time_out is not null and p_time_out<p_time_in then
    raise exception 'Time Out cannot be earlier than Time In';
  end if;
  if coalesce(cardinality(p_waste_types),0)>12 then
    raise exception 'A visit can contain up to 12 waste types';
  end if;
  if exists(select 1 from unnest(coalesce(p_waste_types,ARRAY[]::text[])) as item(label)
             where length(trim(item.label))>80) then
    raise exception 'Waste type labels must be 80 characters or fewer';
  end if;
  select array_agg(distinct trim(item.label) order by trim(item.label))
    into v_labels
    from unnest(coalesce(p_waste_types,ARRAY[]::text[])) as item(label)
   where trim(item.label)<>'';
  if coalesce(cardinality(v_labels),0)=0 then
    raise exception 'Select at least one waste type';
  end if;

  v_before:=jsonb_build_object(
    'customer_id',v_existing.customer_id,
    'customer_name',v_existing.customer_name,
    'registration',v_existing.vehicle_registration_snapshot,
    'visit_date',v_existing.visit_date,
    'time_in',v_existing.time_in,
    'time_out',v_existing.time_out,
    'status',v_existing.status,
    'waste_types',(select coalesce(jsonb_agg(w.label order by w.label),'[]'::jsonb)
                     from public.gatelog_visit_waste_types vw
                     join public.gatelog_waste_types w on w.id=vw.waste_type_id
                    where vw.visit_id=p_visit_id)
  );

  insert into public.gatelog_vehicles(customer_id,registration,active)
  values(p_customer_id,v_registration,true)
  on conflict(customer_id,registration) do update set active=true
  returning id into v_vehicle_id;

  update public.gatelog_visits
     set customer_id=p_customer_id,
         vehicle_id=v_vehicle_id,
         vehicle_registration_snapshot=v_registration,
         visit_date=p_visit_date,
         time_in=p_time_in,
         time_out=p_time_out,
         status=case when p_time_out is null then 'ON_SITE' else 'DEPARTED' end,
         departed_by=case
           when p_time_out is null then null
           when v_existing.time_out is distinct from p_time_out then v_actor
           else v_existing.departed_by
         end
   where id=p_visit_id;

  delete from public.gatelog_visit_waste_types where visit_id=p_visit_id;
  foreach v_label in array v_labels loop
    insert into public.gatelog_waste_types(label) values(v_label)
    on conflict(label) do update set label=excluded.label
    returning id into v_waste_id;
    insert into public.gatelog_visit_waste_types(visit_id,waste_type_id)
    values(p_visit_id,v_waste_id) on conflict do nothing;
  end loop;

  v_after:=jsonb_build_object(
    'customer_id',p_customer_id,
    'customer_name',v_customer_name,
    'registration',v_registration,
    'visit_date',p_visit_date,
    'time_in',p_time_in,
    'time_out',p_time_out,
    'status',case when p_time_out is null then 'ON_SITE' else 'DEPARTED' end,
    'waste_types',to_jsonb(v_labels)
  );
  insert into public.gatelog_audit(visit_id,actor,action,details)
  values(p_visit_id,v_actor,'VISIT_UPDATED',jsonb_build_object('before',v_before,'after',v_after));
  return p_visit_id;
end;
$$;

create or replace function public.gatelog_delete_visit(
  p_visit_id uuid,
  p_actor text
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_details jsonb;
  v_actor text := coalesce(nullif(trim(p_actor),''),'SYSTEM');
begin
  select jsonb_build_object(
    'visit_id',v.id,
    'customer_id',v.customer_id,
    'customer_name',c.customer_name,
    'registration',v.vehicle_registration_snapshot,
    'visit_date',v.visit_date,
    'time_in',v.time_in,
    'time_out',v.time_out,
    'status',v.status,
    'created_by',v.created_by,
    'departed_by',v.departed_by,
    'waste_types',(select coalesce(jsonb_agg(w.label order by w.label),'[]'::jsonb)
                     from public.gatelog_visit_waste_types vw
                     join public.gatelog_waste_types w on w.id=vw.waste_type_id
                    where vw.visit_id=v.id)
  ) into v_details
    from public.gatelog_visits v
    join public.gatelog_customers c on c.id=v.customer_id
   where v.id=p_visit_id
   for update of v;
  if not found then raise exception 'Visit not found or already removed'; end if;

  insert into public.gatelog_audit(visit_id,actor,action,details)
  values(p_visit_id,v_actor,'VISIT_DELETED',v_details);
  delete from public.gatelog_visits where id=p_visit_id;
  return p_visit_id;
end;
$$;

revoke all on function public.gatelog_update_visit(uuid,uuid,text,date,timestamptz,timestamptz,text[],text) from public,anon,authenticated;
revoke all on function public.gatelog_delete_visit(uuid,text) from public,anon,authenticated;
grant execute on function public.gatelog_update_visit(uuid,uuid,text,date,timestamptz,timestamptz,text[],text) to service_role;
grant execute on function public.gatelog_delete_visit(uuid,text) to service_role;

comment on function public.gatelog_update_visit(uuid,uuid,text,date,timestamptz,timestamptz,text[],text)
  is 'Atomically corrects one GATELOG visit and records before/after values in the GATELOG audit log.';
comment on function public.gatelog_delete_visit(uuid,text)
  is 'Deletes one GATELOG visit and retains its full record snapshot in the GATELOG audit log.';
