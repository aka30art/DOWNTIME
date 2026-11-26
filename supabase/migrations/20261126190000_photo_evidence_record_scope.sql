-- Associate photo evidence with its operational DOWNTIME record.
-- NULL record_id is retained only for pre-existing attachments during compatibility.
alter table public.downtime_attachments
  add column if not exists record_id text,
  add column if not exists department text not null default 'DOWNTIME';

alter table public.downtime_attachments
  drop constraint if exists downtime_attachments_department_check;

alter table public.downtime_attachments
  add constraint downtime_attachments_department_check
  check (department = 'DOWNTIME');

create index if not exists downtime_attachments_record_department_idx
  on public.downtime_attachments (department, record_id);

comment on column public.downtime_attachments.record_id is
  'Operational record identity. NULL is reserved for legacy attachments and is resolved against the existing tracker payload.';
comment on column public.downtime_attachments.department is
  'Authorization scope for the associated operational record.';
