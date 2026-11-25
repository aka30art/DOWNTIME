-- GATELOG customer creation and first arrival are one atomic transaction.
-- Additive: this migration creates one function over GATELOG-only tables.
create or replace function public.gatelog_create_customer_arrival(
  p_customer_name text, p_registration text, p_waste_types text[], p_actor text
) returns table(customer_id uuid, customer_name text, visit_id uuid)
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_name text := trim(p_customer_name);
  v_registration text := upper(trim(p_registration));
  v_customer_id uuid; v_vehicle_id uuid; v_visit_id uuid;
  v_label text; v_waste_id uuid;
begin
  if v_name = '' or length(v_name) > 120 then raise exception 'A valid customer/company name is required'; end if;
  if v_registration = '' or length(v_registration) > 20 then raise exception 'A valid vehicle registration is required'; end if;
  if coalesce(array_length(p_waste_types,1),0)=0 then raise exception 'Select at least one waste type'; end if;
  insert into public.gatelog_customers as customer_record(customer_name,active) values(v_name,true)
  on conflict (lower(customer_name)) where active do update set customer_name=excluded.customer_name
  returning customer_record.id, customer_record.customer_name into v_customer_id, v_name;
  insert into public.gatelog_vehicles(customer_id,registration,active) values(v_customer_id,v_registration,true)
  on conflict(customer_id,registration) do update set active=true returning id into v_vehicle_id;
  insert into public.gatelog_visits(customer_id,vehicle_id,vehicle_registration_snapshot,created_by)
  values(v_customer_id,v_vehicle_id,v_registration,coalesce(nullif(trim(p_actor),''),'SYSTEM')) returning id into v_visit_id;
  foreach v_label in array p_waste_types loop
    v_label := trim(v_label);
    if v_label <> '' then
      insert into public.gatelog_waste_types(label) values(v_label)
      on conflict(label) do update set label=excluded.label returning id into v_waste_id;
      insert into public.gatelog_visit_waste_types(visit_id,waste_type_id) values(v_visit_id,v_waste_id) on conflict do nothing;
    end if;
  end loop;
  insert into public.gatelog_audit(visit_id,actor,action,details)
  values(v_visit_id,coalesce(nullif(trim(p_actor),''),'SYSTEM'),'ARRIVAL',
    jsonb_build_object('registration',v_registration,'customerName',v_name,'wasteTypes',to_jsonb(p_waste_types),'customerCreated',true));
  return query select v_customer_id,v_name,v_visit_id;
end;
$$;
revoke all on function public.gatelog_create_customer_arrival(text,text,text[],text) from public,anon,authenticated;
grant execute on function public.gatelog_create_customer_arrival(text,text,text[],text) to service_role;
