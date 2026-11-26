# STAFF MANAGEMENT — staging acceptance tests

## Implemented scope
- Personnel directory: display name, on-site role and Active / Archived state.
- Configurable on-site role directory.
- Append-only activity history.
- Optional account-link data model reserved for a future immutable Central Bank account ID.
- No contact fields, employment dates, employment history, credentials or app-permission editing.

## Verified
- [x] Dedicated `staff_management` schema created in `DOWNTIME-staging`.
- [x] Four isolated tables created; all have RLS enabled.
- [x] `anon` and `authenticated` have no schema usage, table DML or RPC execute permission.
- [x] `service_role` has schema usage but no schema CREATE permission.
- [x] Database RPC is owned by `postgres`, runs as SECURITY DEFINER with a fixed search path, and is executable only by `service_role`.
- [x] RPC bootstrap returns ten seeded roles and an empty staff directory.
- [x] Audit table has a trigger preventing UPDATE and DELETE.
- [x] Account link table uses an external UUID identity key; username-based linking is blocked.
- [x] Dedicated `staff-management-api` deployed to staging, version 3.
- [x] Deno type-check for the new Edge Function passed in GitHub Actions.
- [x] API tier defaults aligned with Central Bank role defaults, including the restricted SPECTATOR view and role-specific management defaults.
- [x] Production database has no `staff_management` schema or RPC.
- [x] Production Edge Functions and frontend configuration were not changed.
- [x] Standalone frontend exists on `feature/staff-management-staging`; it is not linked from the production launcher.

## Pending authenticated tests
The staging Central Bank currently has zero user accounts and zero active sessions. Do not copy production users or create a second authentication system to work around this.

When an authorised staging test account is provisioned through the existing staging account process, run:

1. Sign in through the staging Central Bank; confirm the production session remains unchanged.
2. Confirm a user with `canViewStaff` can view the directory but cannot create, edit, archive or change roles.
3. Confirm a user with `canManageStaff` can create and edit a staff record.
4. Confirm role assignment is independent of YARD HUB app permission tiers.
5. Confirm archiving preserves the record and restore returns it to Active.
6. Confirm role creation, edit, deactivate and reactivate work.
7. Confirm each mutation writes an audit row with the correct actor and before / after data.
8. Confirm audit rows cannot be updated or deleted.
9. Confirm disabled, expired and missing sessions are rejected.
10. Confirm account-link and unlink requests return HTTP 409 until an immutable Central Bank account UUID exists.
11. Confirm all STAFF MANAGEMENT data remains inaccessible to anon/authenticated direct database clients.
12. Confirm no staging request is sent to the production Supabase project.

## Release boundary
This PR is draft. Do not merge or deploy to production until the authenticated test suite passes, the account identity contract is resolved, and a separate production milestone is explicitly approved.
