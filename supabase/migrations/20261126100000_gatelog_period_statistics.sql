-- GATELOG period statistics: full-history aggregates computed in PostgreSQL.
-- GATELOG-only function; no DOWNTIME tracker tables or records are modified.
create or replace function public.gatelog_period_statistics(p_today date)
returns table(
  period_key text,
  total_visits bigint,
  most_common_waste_type text,
  average_minutes numeric,
  completed_visits bigint
)
language sql
security invoker
set search_path = public, pg_temp
as $periods$
  with period_ranges(period_key,start_date,end_date) as (
    select 'daily', p_today, p_today + 1
    union all
    select 'weekly', p_today - ((extract(isodow from p_today)::integer) - 1), p_today - ((extract(isodow from p_today)::integer) - 1) + 7
    union all
    select 'monthly', date_trunc('month',p_today)::date, (date_trunc('month',p_today) + interval '1 month')::date
    union all
    select 'all_time', null::date, null::date
  ),
  totals as (
    select p.period_key,
      count(v.id)::bigint as total_visits,
      count(v.id) filter (where v.status='DEPARTED' and v.time_out is not null)::bigint as completed_visits,
      round(avg(extract(epoch from (v.time_out-v.time_in))/60)
        filter (where v.status='DEPARTED' and v.time_out is not null and v.time_out>=v.time_in)) as average_minutes
    from period_ranges p
    left join public.gatelog_visits v
      on (p.start_date is null or v.visit_date >= p.start_date)
     and (p.end_date is null or v.visit_date < p.end_date)
    group by p.period_key
  ),
  common_waste as (
    select p.period_key, (
      select wt.label
      from public.gatelog_visits v
      join public.gatelog_visit_waste_types vw on vw.visit_id=v.id
      join public.gatelog_waste_types wt on wt.id=vw.waste_type_id
      where (p.start_date is null or v.visit_date >= p.start_date)
        and (p.end_date is null or v.visit_date < p.end_date)
      group by wt.label
      order by count(*) desc, wt.label asc
      limit 1
    ) as label
    from period_ranges p
  )
  select t.period_key,t.total_visits,coalesce(w.label,'—'),t.average_minutes,t.completed_visits
  from totals t join common_waste w using(period_key)
  order by case t.period_key when 'daily' then 1 when 'weekly' then 2 when 'monthly' then 3 else 4 end;
$periods$;
revoke all on function public.gatelog_period_statistics(date) from public, anon, authenticated;
grant execute on function public.gatelog_period_statistics(date) to service_role;
