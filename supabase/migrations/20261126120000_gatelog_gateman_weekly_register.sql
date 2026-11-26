-- GATELOG Gateman assignments, weekly register counts and simplified period statistics.
-- Additive GATELOG-only objects. Existing DOWNTIME tracker assignments are not read or modified.

create table if not exists public.gatelog_gateman_assignments (
  duty_date date primary key,
  gateman_name text not null check (length(btrim(gateman_name)) between 1 and 80),
  is_locked boolean not null default true,
  assigned_by text not null,
  assigned_at timestamptz not null default now(),
  locked_by text not null,
  locked_at timestamptz not null default now(),
  updated_by text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.gatelog_gateman_audit (
  id bigint generated always as identity primary key,
  duty_date date not null,
  action text not null check (action in ('ASSIGNED','UNLOCKED','REASSIGNED')),
  gateman_name text,
  previous_gateman text,
  actor text not null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists gatelog_gateman_audit_date_idx
  on public.gatelog_gateman_audit(duty_date,created_at desc);
alter table public.gatelog_gateman_assignments enable row level security;
alter table public.gatelog_gateman_audit enable row level security;
revoke all on public.gatelog_gateman_assignments,public.gatelog_gateman_audit from public,anon,authenticated;
grant all on public.gatelog_gateman_assignments,public.gatelog_gateman_audit to service_role;
grant usage,select on sequence public.gatelog_gateman_audit_id_seq to service_role;

drop function if exists public.gatelog_period_statistics(date);
create function public.gatelog_period_statistics(p_today date)
returns table(period_key text,total_visits bigint,most_common_waste_type text)
language sql security invoker set search_path=public,pg_temp
as $stats$
  with ranges(period_key,start_date,end_date) as (
    select 'daily',p_today,p_today+1
    union all
    select 'weekly',p_today-((extract(isodow from p_today)::integer)-1),p_today-((extract(isodow from p_today)::integer)-1)+7
    union all
    select 'monthly',date_trunc('month',p_today)::date,(date_trunc('month',p_today)+interval '1 month')::date
  ), totals as (
    select r.period_key,count(v.id)::bigint total_visits
    from ranges r left join public.gatelog_visits v
      on v.visit_date>=r.start_date and v.visit_date<r.end_date
    group by r.period_key
  ), common_waste as (
    select r.period_key,(
      select wt.label
      from public.gatelog_visits v
      join public.gatelog_visit_waste_types vw on vw.visit_id=v.id
      join public.gatelog_waste_types wt on wt.id=vw.waste_type_id
      where v.visit_date>=r.start_date and v.visit_date<r.end_date
      group by wt.label order by count(*) desc,wt.label asc limit 1
    ) label
    from ranges r
  )
  select t.period_key,t.total_visits,coalesce(w.label,'—')
  from totals t join common_waste w using(period_key)
  order by case t.period_key when 'daily' then 1 when 'weekly' then 2 else 3 end;
$stats$;
revoke all on function public.gatelog_period_statistics(date) from public,anon,authenticated;
grant execute on function public.gatelog_period_statistics(date) to service_role;

create or replace function public.gatelog_week_register_counts(p_week_start date)
returns table(visit_date date,total_visits bigint)
language sql security invoker set search_path=public,pg_temp
as $counts$
  select d::date,count(v.id)::bigint
  from generate_series(p_week_start::timestamp,(p_week_start+5)::timestamp,interval '1 day') d
  left join public.gatelog_visits v on v.visit_date=d::date
  group by d order by d;
$counts$;
revoke all on function public.gatelog_week_register_counts(date) from public,anon,authenticated;
grant execute on function public.gatelog_week_register_counts(date) to service_role;
