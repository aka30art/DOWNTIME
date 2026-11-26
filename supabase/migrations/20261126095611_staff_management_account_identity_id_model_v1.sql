drop index if exists staff_management.staff_account_links_active_username_uidx;
alter table staff_management.staff_account_links
  drop constraint if exists staff_account_links_username_length,
  drop column if exists account_username,
  add column account_identity_id uuid;
alter table staff_management.staff_account_links
  alter column account_identity_id set not null;
create unique index staff_account_links_active_identity_uidx
  on staff_management.staff_account_links (account_identity_id)
  where unlinked_at is null;
comment on column staff_management.staff_account_links.account_identity_id is 'Immutable YARD HUB account identifier from Central Bank. No username-based substitute is permitted.';
