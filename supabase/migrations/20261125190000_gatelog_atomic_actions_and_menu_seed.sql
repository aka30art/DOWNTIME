-- GATELOG atomic write operations and default launcher registration.
-- Only the YARD HUB configuration JSON and new GATELOG tables are affected.

create or replace function public.gatelog_create_arrival(
  p_customer_id uuid,
  p_registration text,
  p_waste_types text[],
  p_actor text
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_registration text := upper(trim(p_registration));
  v_vehicle_id uuid;
  v_visit_id uuid;
  v_label text;
  v_waste_id uuid;
begin
  if v_registration = '' or length(v_registration) > 20 then
    raise exception 'A valid vehicle registration is required';
  end if;
  if not exists (select 1 from public.gatelog_customers where id=p_customer_id and active=true) then
    raise exception 'Selected customer is unavailable';
  end if;
  if coalesce(array_length(p_waste_types,1),0)=0 then
    raise exception 'Select at least one waste type';
  end if;

  insert into public.gatelog_vehicles(customer_id,registration,active)
  values(p_customer_id,v_registration,true)
  on conflict(customer_id,registration) do update set active=true
  returning id into v_vehicle_id;

  insert into public.gatelog_visits(customer_id,vehicle_id,vehicle_registration_snapshot,created_by)
  values(p_customer_id,v_vehicle_id,v_registration,coalesce(nullif(trim(p_actor),''),'SYSTEM'))
  returning id into v_visit_id;

  foreach v_label in array p_waste_types loop
    v_label := trim(v_label);
    if v_label <> '' then
      insert into public.gatelog_waste_types(label) values(v_label)
      on conflict(label) do update set label=excluded.label
      returning id into v_waste_id;
      insert into public.gatelog_visit_waste_types(visit_id,waste_type_id)
      values(v_visit_id,v_waste_id) on conflict do nothing;
    end if;
  end loop;

  insert into public.gatelog_audit(visit_id,actor,action,details)
  values(v_visit_id,coalesce(nullif(trim(p_actor),''),'SYSTEM'),'ARRIVAL',
    jsonb_build_object('registration',v_registration,'wasteTypes',to_jsonb(p_waste_types)));
  return v_visit_id;
end;
$$;

create or replace function public.gatelog_register_departure(
  p_visit_id uuid,
  p_actor text
) returns table(id uuid,time_out timestamptz,status text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  return query
  update public.gatelog_visits v
     set status='DEPARTED',time_out=now(),departed_by=coalesce(nullif(trim(p_actor),''),'SYSTEM')
   where v.id=p_visit_id and v.status='ON_SITE'
  returning v.id,v.time_out,v.status;
  if found then
    insert into public.gatelog_audit(visit_id,actor,action,details)
    values(p_visit_id,coalesce(nullif(trim(p_actor),''),'SYSTEM'),'DEPARTURE','{}'::jsonb);
  end if;
end;
$$;

revoke all on function public.gatelog_create_arrival(uuid,text,text[],text) from public,anon,authenticated;
revoke all on function public.gatelog_register_departure(uuid,text) from public,anon,authenticated;
grant execute on function public.gatelog_create_arrival(uuid,text,text[],text) to service_role;
grant execute on function public.gatelog_register_departure(uuid,text) to service_role;

-- Seed GATELOG into both saved menu versions without replacing other admin edits.
update public.downtime_central_config_state s
set draft_payload=jsonb_set(
  coalesce(s.draft_payload,'{}'::jsonb),'{yardHubMenu}',
  jsonb_set(
    coalesce(s.draft_payload->'yardHubMenu','{}'::jsonb),'{departments}',
    case when exists(select 1 from jsonb_array_elements(coalesce(s.draft_payload #> '{yardHubMenu,departments}','[]'::jsonb)) d where d->>'id'='gatelog')
      then coalesce(s.draft_payload #> '{yardHubMenu,departments}','[]'::jsonb)
      else coalesce(s.draft_payload #> '{yardHubMenu,departments}','[]'::jsonb) || jsonb_build_array(jsonb_build_object('id','gatelog','kind','gatelog','title','GATELOG','description','CUSTOMER & SITE ENTRY MANAGEMENT','enabled',true,'order',jsonb_array_length(coalesce(s.draft_payload #> '{yardHubMenu,departments}','[]'::jsonb)),'protected',true,'submenus','[]'::jsonb))
    end,true),true),
published_payload=jsonb_set(
  coalesce(s.published_payload,'{}'::jsonb),'{yardHubMenu}',
  jsonb_set(
    coalesce(s.published_payload->'yardHubMenu','{}'::jsonb),'{departments}',
    case when exists(select 1 from jsonb_array_elements(coalesce(s.published_payload #> '{yardHubMenu,departments}','[]'::jsonb)) d where d->>'id'='gatelog')
      then coalesce(s.published_payload #> '{yardHubMenu,departments}','[]'::jsonb)
      else coalesce(s.published_payload #> '{yardHubMenu,departments}','[]'::jsonb) || jsonb_build_array(jsonb_build_object('id','gatelog','kind','gatelog','title','GATELOG','description','CUSTOMER & SITE ENTRY MANAGEMENT','enabled',true,'order',jsonb_array_length(coalesce(s.published_payload #> '{yardHubMenu,departments}','[]'::jsonb)),'protected',true,'submenus','[]'::jsonb))
    end,true),true)
where s.id=1;
