# USER / STAFF / YARD ROLE Restructure

Status: Architecture phase — proposed target model  
Base: `main` at `b08735da3e8b7dd4ad863bdf94bd672e3c25e846`  
Production impact: None. This document does not change application code, database data, Supabase configuration, authentication, or deployment.

## 1. Purpose

Replace the current tier-centred account model with a USER-centred identity model, separate operational STAFF presentation from application access, and introduce a protected ROOTS category. The access-and-rights matrix is a later, separately approved phase.

## 2. Domain model

### USER

A USER is an authenticated application identity. USER accounts can interact with and use/manage YARDHUB subject to the YARD ROLE and the permission model that will be specified later.

A USER creation workflow must collect:
- Login identity and credentials (username and PIN under the current authentication mechanism).
- Display name.
- All operational/personnel information currently collected by STAFF creation.
- YARD ROLE assignment, once the role catalogue is approved.

Creating a USER creates its linked STAFF record as one atomic Central Bank payload update. A failed save must create neither record. Editing a USER's personnel details updates the linked STAFF presentation record without creating a duplicate. Account credentials and account status remain USER properties.

### STAFF

STAFF is an operational directory and visual presentation record only. It answers who is working, what they are operating, where they are, their department, station, on-site status and other operational details.

STAFF is not an authentication principal and does not independently grant application access or privileges. A STAFF profile must not be treated as a login account.

The USER-to-STAFF relationship is one-to-one for ordinary USER accounts. The relationship must use stable immutable IDs, not display names or usernames as primary keys. Names and usernames can change without breaking the link.

A STAFF record may be archived from operational views without deleting or disabling its USER account. Account deletion/disablement must be an explicit USER lifecycle action and must not be triggered by STAFF presentation changes.

### YARD ROLES

The existing account TIERS are to be replaced by YARD ROLES. The final YARD ROLE catalogue and access/rights mapping are deliberately not defined in this phase.

The old tier permission profiles must not silently become the new YARD ROLE permissions. Until the replacement permission matrix is approved and implemented, no production authorization behaviour is changed.

## 3. Protected root identities

### DEV

- Fixed root USER identity: `DEV`.
- Highest system authority; full privileges.
- Cannot be assigned to another account.
- Cannot be edited, renamed, disabled, demoted or deleted through ordinary application workflows.
- Bootstrap/initialization remains the only permitted creation path if the installation has not yet been initialized.
- Protection must be enforced by the server, not only by hiding UI controls.

### ROOTS category

Introduce a dedicated protected account category named `ROOTS`.
- The category is visible only to DEV.
- Only DEV can assign DEV1.
- ROOTS cannot be deleted or removed through ordinary account-management operations.
- DEV1 and ADMIN are protected root classifications, not ordinary YARD ROLES.
- Their management controls and account records must not be exposed to non-DEV users through list, search, export, API response, or client-side state.

### DEV1

- Root classification with authority intended to match DEV.
- DEV can assign DEV1.
- DEV1 must not be able to view, inspect, edit, disable, delete, or otherwise interact with DEV.
- DEV remains protected from DEV1 actions at the server boundary.

### ADMIN

- Root classification with authority intended to match DEV1.
- DEV and DEV1 can assign ADMIN.
- ADMIN must not be able to view, inspect, edit, disable, delete, or otherwise interact with DEV or DEV1.
- Higher-root isolation must be enforced on every server action, not only the account-management screen.

## 4. Root assignment and protection matrix

| Actor | Assign DEV1 | Assign ADMIN | Interact with DEV | Interact with DEV1 | Interact with ADMIN |
|---|---:|---:|---:|---:|---:|
| DEV | Yes | Yes | Self/root | Yes | Yes |
| DEV1 | No | Yes | No | Self/root | Yes |
| ADMIN | No | No | No | No | Self/root |

This table records assignment and isolation requirements only. It does not define the future rights of ordinary YARD ROLES.

## 5. Proposed persistence model

The current Central Bank payload contains:
- `users[]` with username, display name, tier and credential hash fields.
- `staff.roster[]` and `staff.profiles{}`, currently keyed by staff display name.
- Compatibility copies in `appData.staffRoster` and `appData.operatorProfiles`.
- Tier-keyed permission profiles in `tiers{}`.

Target model:
- Each USER has a stable `userId`, a protected classification (ordinary YARD ROLE or ROOTS classification), credentials, account status and a `staffId`.
- Each linked STAFF profile has a stable `staffId` and `linkedUserId`, plus operational fields.
- The STAFF directory is derived from linked STAFF records; it is not a second authentication directory.
- DEV, DEV1 and ADMIN are represented as protected USER classifications and are not assigned ordinary STAFF YARD ROLE permissions by implication.

Implementation must retain the existing Central Bank single-payload storage and optimistic version checks unless a verified technical requirement proves otherwise. No second database, auth provider, or standalone STAFF database is introduced.

## 6. Migration requirements

1. Inventory all current USER accounts, STAFF roster entries, profiles, archived entries and legacy compatibility copies.
2. Produce a deterministic mapping from each existing USER to an existing STAFF record where a match is reliable.
3. Do not auto-merge records based solely on similar display names when identity is ambiguous.
4. Preserve operational history, station assignments, photos, on-site status, archive state and audit history.
5. Create a linked STAFF profile for every existing USER that has no unambiguous matching profile, using the approved migration defaults and marking incomplete operational details for later completion.
6. Preserve standalone legacy STAFF records as operational-only records unless the owner explicitly decides they should receive login accounts. Do not create USER accounts as a side effect of STAFF migration.
7. Migrate the current DEV/OWNER identity to protected DEV without changing its credential hash or requiring a reset, unless a separately approved security migration requires it.
8. Do not automatically promote existing DEVACC or ADMIN tier accounts into DEV1 or ADMIN ROOTS. Their mapping requires explicit owner review because the new root hierarchy is not equivalent to the old tier system.
9. Do not map old MANAGER, SUPERVISOR, USER or SPECTATOR tiers to new YARD ROLES until the new catalogue is approved.
10. Make migration idempotent, version-checked, auditable and reversible before production execution.

## 7. Atomic USER creation/update requirements

- Validate all USER and STAFF fields before writing.
- Create USER and STAFF records in one version-checked payload commit.
- Assign stable IDs once; retries must not create duplicate linked records.
- Reject duplicate usernames and duplicate stable identity links.
- Update shared personnel fields consistently.
- Keep PIN hashing and session invalidation behaviour secure.
- Protect root identities against forbidden changes server-side.
- Record actor, target and operation in the existing audit stream.
- Return a conflict without partial writes when the Central Bank version has changed.

## 8. UI implications

- USER management becomes the account-creation and account-editing entry point.
- The USER creation form includes the current STAFF operational fields.
- The linked STAFF profile is displayed and maintained through the operational STAFF directory, with a clear link back to its USER account for authorised managers.
- STAFF-only legacy entries remain clearly distinguishable as operational-only until linked.
- ROOTS is a separate hidden category, visible only to DEV. DEV1 and ADMIN cannot browse the category or inspect higher roots.
- Do not expose old TIERS as if they were YARD ROLES.
- Do not build the final YARD ROLE selector until the role catalogue is approved.

## 9. Explicitly out of scope for this phase

- Final YARD ROLE names and definitions.
- Final access-and-rights matrix for ordinary YARD ROLES.
- Whether DEV1 and ADMIN inherit all DEV/DEV1 capabilities beyond the stated root authority equivalence and isolation constraints.
- Detailed account suspension, departure, reactivation and permanent deletion policy for ordinary USER accounts.
- Production data migration or deployment.
- Changes to unrelated DOWNTIME modules.

## 10. Acceptance criteria for the implementation phase

- USER creation creates exactly one linked STAFF record atomically.
- No STAFF creation path can create a USER account.
- USER and STAFF share a stable identity link that survives name changes.
- STAFF presentation edits cannot mutate credentials or account authority.
- STAFF archive/removal cannot delete or disable USER.
- DEV is immutable and unassignable at the server layer.
- ROOTS is visible only to DEV and cannot be deleted.
- DEV1 cannot interact with DEV.
- ADMIN cannot interact with DEV or DEV1.
- Assignment rules for DEV1 and ADMIN are enforced server-side.
- Existing records and historical operational data survive migration.
- Legacy tier permissions are not silently reused as YARD ROLE permissions.
- Automated tests cover authorization bypasses, duplicate creation, concurrency conflicts, migration idempotency and compatibility.
- CI, browser tests and production-equivalent verification pass before any production rollout.
