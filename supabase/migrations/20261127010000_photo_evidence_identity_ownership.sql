-- Immutable uploader identity for DOWNTIME photo evidence.
-- Existing rows remain NULL-owned and are manageable only by a Manage-authorised user.
alter table public.downtime_attachments
  add column if not exists uploaded_by_user_id uuid,
  add column if not exists uploaded_by_staff_id uuid;

alter table public.downtime_attachments
  drop constraint if exists downtime_attachments_uploader_link_check;

alter table public.downtime_attachments
  add constraint downtime_attachments_uploader_link_check
  check (uploaded_by_staff_id is null or uploaded_by_user_id is not null);

create index if not exists downtime_attachments_uploader_user_idx
  on public.downtime_attachments (uploaded_by_user_id)
  where uploaded_by_user_id is not null;

comment on column public.downtime_attachments.uploaded_by_user_id is
  'Immutable USER identity that authorised the upload. NULL is reserved for legacy attachments; only Manage-authorised users may access or replace them.';
comment on column public.downtime_attachments.uploaded_by_staff_id is
  'Immutable linked STAFF identity snapshot for the uploader, when the USER has a linked STAFF profile.';
