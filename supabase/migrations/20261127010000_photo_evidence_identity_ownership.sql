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

create or replace function public.prevent_downtime_attachment_identity_mutation()
returns trigger language plpgsql security definer set search_path = public
as $photo_owner$
begin
  if old.uploaded_by_user_id is distinct from new.uploaded_by_user_id
     or old.uploaded_by_staff_id is distinct from new.uploaded_by_staff_id
     or old.downtime_entry_key is distinct from new.downtime_entry_key
     or old.record_id is distinct from new.record_id
     or old.department is distinct from new.department
     or old.storage_path is distinct from new.storage_path then
    raise exception 'Photo evidence identity and record ownership are immutable';
  end if;
  return new;
end;
$photo_owner$;

drop trigger if exists downtime_attachments_identity_immutable on public.downtime_attachments;
create trigger downtime_attachments_identity_immutable
before update on public.downtime_attachments
for each row execute function public.prevent_downtime_attachment_identity_mutation();

revoke all on function public.prevent_downtime_attachment_identity_mutation() from public, anon, authenticated;
