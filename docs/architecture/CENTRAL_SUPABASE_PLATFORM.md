# Central Supabase Platform Architecture

Status: Controlling architecture for the DOWNTIME ecosystem.

Snapshot date: 26 November 2026.

## 1. Single-database decision

The existing **DOWNTIME Supabase project** is the one and only database for the ecosystem:

- Project: `DOWNTIME`
- Project ID: `ygwfipksbbprqynvbklk`
- Region: `eu-west-1`

DOWNTIME, YARD HUB, GATELOG, Repair & Maintenance and future modules are application areas within this one project. There are no separate departmental databases, duplicate identity stores, or parallel staff directories.

For this work, do not create, access, configure, test against, deploy to, or migrate data through any staging project or Supabase development branch. Development checks are performed against repository source, deterministic local tests and CI. Production preflight checks are read-only until a specific additive production change is ready.

## 2. Keep the architecture simple

A shared project does not mean putting every department's records into one table. Keep the existing module tables and Edge Function APIs. Reuse shared platform services where the business entity is genuinely shared. Do not create new schemas, tables, APIs or identity flows merely to make the architecture look more normalised.

The existing production database already contains the core modules. This is an extension of the live platform, not a migration from multiple departmental production databases.

## 3. Identity boundary: USER is not STAFF

These are distinct concepts:

- **USER** is an authenticated system identity. Only USER records sign in and receive application permission tiers.
- **STAFF** is an operational personnel record. A staff member can be assigned to a shift, station or gate duty without having a system account.
- Creating, archiving or restoring STAFF must never create, disable or delete USER accounts.
- USER records must not be used as a substitute for operational STAFF records.
- There is one Central Bank authentication and session authority. No staff login, account-link table, secondary identity provider, or separate staff bootstrap is permitted.
- On-site roles such as Gateman, Forklift Driver or Supervisor are operational labels, not application permission tiers.

## 4. Canonical STAFF directory

Use the existing Central Bank staff collection as the single source of truth:

- `downtime_central_bank.payload.staff.roster` holds the staff roster.
- `downtime_central_bank.payload.staff.profiles` holds each staff member's operational profile.
- `appData.staffRoster` and `appData.operatorProfiles` remain compatibility fields while existing DOWNTIME and YARD HUB screens consume them. They must be kept consistent with the canonical `staff` collection.
- `appData.staffRoles` stores configurable on-site role definitions.
- Archive and restore records; do not physically delete them through normal staff workflows.
- Archived staff remain available for historical records but are excluded from active operator and Gateman choices.
- Role removal is rejected while that role is assigned. Role renames update affected staff profiles.
- Staff lifecycle and role changes are appended to the existing Central Bank audit history.
- Existing station assignments, assignment locks, plant availability, photos and historical references must be preserved.

Do not introduce `staff_management`, `yard_hub_staff_*`, a separate staff Edge Function, or a new STAFF database. Do not turn STAFF names into user accounts. The existing JSON-backed Central Bank model is the least disruptive approach for the current platform and data volume; a separate relational staff model is not required for this feature.

## 5. GATELOG integration

GATELOG continues to use its existing production tables and `gatelog-api` Edge Function. Its daily Gateman selector reads active STAFF from the Central Bank directory, not from `payload.users`.

The legacy `gatelog_daily_gateman_assignments.gateman_username` column and RPC argument are retained for compatibility. New assignments write the selected STAFF roster key into that legacy-named field; it must never be resolved as a USER account for new operations. The current production inventory contains one historical assignment whose value resolves to an existing USER but not to a STAFF roster entry. Preserve that row and its `gateman_name` display snapshot unchanged. Mark it as a retained historical/unlinked assignment in the UI; do not silently map, delete or rewrite it. Replacing it requires an authorised operator to explicitly select an active STAFF member.

Customer, vehicle, visit, waste-type, assignment and audit data remain owned by GATELOG. Each visit retains its own vehicle-registration snapshot and its own waste-type line items. Reusable customer and vehicle directories remain separate master records linked to individual visit history.

## 6. Verified DOWNTIME production baseline

The following read-only inventory was checked directly against the DOWNTIME project on 26 November 2026:

| Resource | Current production state |
|---|---:|
| Central Bank data version | 472 |
| Central USER accounts | 11 |
| Central STAFF roster entries | 8 |
| Central STAFF profile entries | 13 |
| Central Bank audit rows | 574 |
| Central Bank session rows | 80 |
| GATELOG customers | 3 |
| GATELOG vehicles | 3 |
| GATELOG visits | 0 |
| GATELOG visit/waste links | 0 |
| GATELOG daily Gateman assignments | 1 |
| GATELOG audit rows | 16 |

The live database also contains the existing DOWNTIME reports and photo evidence tables, YARD HUB tier configuration and access audit, daily operator assignments, and Repair & Maintenance assets, faults, notes, attachments, presets, models, settings and audit history.

The deployed Edge Functions at the inventory checkpoint were `central-bank` v15 and `gatelog-api` v6. The production migration history ended at `20261126062959_gatelog_waste_type_activation`.

No departmental data needs to be copied into a new database. These are existing production records and must be preserved in place. Never assume a table is empty based on an earlier test environment or a previous inventory.

## 7. PR #187 integration contract

PR #187 extends the existing Central Bank STAFF directory and changes GATELOG's daily Gateman choice from USER to STAFF.

Its atomic settings migration adds `public.downtime_commit_central_bank`. This function performs the Central Bank state update and the associated audit writes in one transaction, with optimistic version checking. Its SECURITY DEFINER search path is fixed; execution is revoked from PUBLIC, `anon` and `authenticated`, and granted only to `service_role`.

The production inventory confirmed this RPC was not installed. The branch's migration is additive: it creates the missing function and does not copy, rewrite, delete or seed any existing production data.

**Production migration checkpoint — 26 November 2026:** the migration was applied to DOWNTIME as `20261126114151_central_bank_atomic_state_audit`. The resulting function was verified with signature `downtime_commit_central_bank(bigint,jsonb,text,jsonb,jsonb)`, SECURITY DEFINER enabled, an empty search_path, and EXECUTE granted only to `service_role`. `anon` and `authenticated` cannot execute it. The Central Bank version and row count, audit count, session count, and GATELOG customer, vehicle, visit, assignment and audit counts were identical before and after the migration.

The dependent Edge Functions are not yet deployed at this checkpoint. Do not deploy a function that calls this RPC until its production signature and grants have been verified.

## 8. Security and data integrity

1. Keep service-role credentials server-side; never expose them in browser code.
2. Authenticate users through the existing Central Bank session flow.
3. Check all module permissions server-side in the relevant Edge Function.
4. Preserve department boundaries through the existing table grants, RLS and API authorization. Do not add blanket public policies to silence security advisor findings.
5. Keep state changes and audit writes atomic where the operation requires both.
6. Retain optimistic version checks for Central Bank state.
7. Keep GATELOG's customer, vehicle, visit and assignment relationships intact.
8. Do not rename or drop legacy columns until all clients, Edge Functions and historical records have been migrated and verified.
9. Review RLS/security findings resource by resource; an advisor notice is not permission to change access policies blindly.

## 9. No-staging development and production release

1. Make changes on the feature branch and review the complete diff.
2. Run the repository's contract, browser and smoke tests locally where available; require CI success on the exact candidate commit.
3. Run read-only production preflight checks for current schema, migration history, function versions, critical row counts and relevant constraints.
4. Preserve a recoverable production backup/export and record pre-change invariants before any production write. The additive RPC migration has a simple rollback: drop the newly created function if it has not become a dependency.
5. Apply the additive RPC migration to the DOWNTIME project only.
6. Verify the function signature, SECURITY DEFINER setting, empty search path, and EXECUTE grants.
7. Deploy the matching `central-bank` and `gatelog-api` function versions to DOWNTIME only after the migration verification passes.
8. Merge and publish the matching frontend only after CI and integrated regression checks pass.
9. Verify the live login, STAFF create/update/archive/restore, role validation, GATELOG Gateman selection, assignment locking, and USER-count invariance. Confirm existing customer, vehicle, visit, assignment and audit records remain intact.
10. Keep rollback sources and pre-change counts until post-release verification is complete.

There is no staging deployment or staging acceptance gate in this workflow. If a required live authenticated check cannot be performed safely, stop at that release gate rather than claiming it passed.

## 10. Acceptance criteria

- DOWNTIME remains the sole Supabase project and source of truth.
- No staging project or Supabase development branch is used for this work.
- DOWNTIME, YARD HUB, GATELOG and Repair & Maintenance continue on the same production database.
- STAFF and USER remain separate; STAFF never requires a login.
- One canonical staff directory feeds the relevant operational selectors.
- Archive, restore, role changes and audit history work without deleting historical records.
- GATELOG Gateman selection uses active STAFF and does not depend on USER accounts.
- Existing production records and permission boundaries are preserved.
- All production changes are additive or demonstrably reversible, with verification and rollback evidence.
