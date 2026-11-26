-- Atomic GATELOG Gateman assignment and lock operations.
create or replace function public.gatelog_assign_gateman(
  p_duty_date date,
  p_gateman_username text,
  p_gateman_name text,
  p_actor text
)
returns setof public.gatelog_daily_gateman_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  insert into public.gatelog_daily_gateman_assignments (
    duty_date, gateman_username, gateman_name, assigned_by, assigned_at,
    is_locked, locked_by, locked_at, updated_by, updated_at
  ) values (
    p_duty_date, trim(p_gateman_username), trim(p_gateman_name), trim(p_actor), now(),
    false, null, null, trim(p_actor), now()
  )
  on conflict (duty_date) do update
    set gateman_username = excluded.gateman_username,
        gateman_name = excluded.gateman_name,
        assigned_by = excluded.assigned_by,
        assigned_at = now(),
        updated_by = excluded.updated_by,
        updated_at = now()
    where not public.gatelog_daily_gateman_assignments.is_locked
  returning *;
end;
$$;

create or replace function public.gatelog_lock_gateman(
  p_duty_date date,
  p_actor text
)
returns setof public.gatelog_daily_gateman_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.gatelog_daily_gateman_assignments
     set is_locked = true,
         locked_by = trim(p_actor),
         locked_at = now(),
         updated_by = trim(p_actor),
         updated_at = now()
   where duty_date = p_duty_date
     and is_locked = false
     and gateman_username is not null
  returning *;
end;
$$;

revoke all on function public.gatelog_assign_gateman(date,text,text,text) from public, anon, authenticated;
revoke all on function public.gatelog_lock_gateman(date,text) from public, anon, authenticated;
grant execute on function public.gatelog_assign_gateman(date,text,text,text) to service_role;
grant execute on function public.gatelog_lock_gateman(date,text) to service_role;
