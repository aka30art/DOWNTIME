-- Protected ROOTS assignments are separate from ordinary YARD ROLE permissions.
-- The only bootstrap authority is the immutable DEV USER ID captured by the lifecycle migration.
create table if not exists public.downtime_roots_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  staff_id uuid not null unique,
  roots_class text not null check (roots_class in ('DEV1','ADMIN')),
  assigned_by_user_id uuid,
  assigned_by_username text not null,
  assigned_by_display_name text not null,
  created_at timestamptz not null default now(),
  constraint downtime_roots_identity_ids_distinct check (user_id <> staff_id)
);

create table if not exists public.downtime_roots_assignment_audit (
  id bigint generated always as identity primary key,
  assignment_id uuid not null references public.downtime_roots_assignments(id) on delete restrict,
  user_id uuid not null,
  staff_id uuid not null,
  roots_class text not null check (roots_class in ('DEV1','ADMIN')),
  actor_user_id uuid,
  actor_username text not null,
  actor_display_name text not null,
  action text not null check (action in ('ROOTS_DEV1_ASSIGNED','ROOTS_ADMIN_ASSIGNED')),
  created_at timestamptz not null default now()
);

alter table public.downtime_roots_assignments enable row level security;
alter table public.downtime_roots_assignment_audit enable row level security;
revoke all on public.downtime_roots_assignments from public, anon, authenticated;
revoke all on public.downtime_roots_assignment_audit from public, anon, authenticated;
grant select on public.downtime_roots_assignments to service_role;
grant select on public.downtime_roots_assignment_audit to service_role;
revoke insert, update, delete on public.downtime_roots_assignments from service_role;
revoke insert, update, delete on public.downtime_roots_assignment_audit from service_role;

create or replace function public.prevent_downtime_roots_audit_mutation()
returns trigger language plpgsql security definer set search_path = public
as $audit$
begin
  raise exception 'ROOTS assignment audit records are immutable';
end;
$audit$;

drop trigger if exists downtime_roots_assignment_audit_immutable on public.downtime_roots_assignment_audit;
create trigger downtime_roots_assignment_audit_immutable
before update or delete on public.downtime_roots_assignment_audit
for each row execute function public.prevent_downtime_roots_audit_mutation();

comment on table public.downtime_roots_assignments is 'Protected DEV1/ADMIN registry, separate from ordinary YARD ROLE permissions.';
comment on table public.downtime_roots_assignment_audit is 'Append-only audit of protected ROOTS assignments and lifecycle changes.';
