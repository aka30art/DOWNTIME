# USER / STAFF / YARD ROLE Restructure

Status: Architecture phase — proposed target model  
Base: `main` at `b08735da3e8b7dd4ad863bdf94bd672e3c25e846`  
Production impact: None. This document does not change application code, database data, Supabase configuration, authentication, or deployment.

## 1. Purpose

Replace the current tier-centred account model with a USER-centred identity model, separate operational STAFF presentation from application access, and introduce a hidden, system-managed ROOTS assignment category for STAFF. The access-and-rights matrix is a later, separately approved phase.

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

`ROOTS` is a hidden, system-managed assignment category used only to assign the protected classifications `DEV1` and `ADMIN` to STAFF members (and therefore to their linked USER identities).

- ROOTS is not a normal USER category, account tier or ordinary YARD ROLE.
- The ROOTS category itself is visible and browsable only by DEV. It is not displayed in ordinary USER or STAFF interfaces, menus, lists, searches, exports, or API responses.
- DEV alone can assign DEV1 to a STAFF member.
- DEV and DEV1 can assign ADMIN to a STAFF member.
- DEV1's authority to assign ADMIN is a narrowly scoped action only. It must not expose the ROOTS category, its directory, its configuration, or the DEV1-assignment capability to DEV1.
- ADMIN and ordinary users cannot see ROOTS or assign either protected classification.
- ROOTS is a protected system category and cannot be deleted, renamed, exposed as an ordinary role, or managed through ordinary role controls.

### DEV1

- Protected ROOTS classification assigned by DEV to a STAFF member.
- Its linked USER has authority intended to match DEV, subject to the explicit isolation rule.
- DEV1 cannot view, inspect, edit, disable, delete, or otherwise interact with DEV.
- DEV remains protected from DEV1 actions at the server boundary.
- DEV1 can perform the narrowly scoped assignment of ADMIN to STAFF, without gaining visibility of the ROOTS category or the ability to assign DEV1.

### ADMIN

- Protected ROOTS classification assigned by DEV or DEV1 to a STAFF member.
- Its linked USER has authority intended to match DEV1, subject to the explicit isolation rules.
- ADMIN cannot view, inspect, edit, disable, delete, or otherwise interact with DEV or DEV1.
- ADMIN cannot view ROOTS or assign DEV1 or ADMIN.
- Higher-root isolation must be enforced on every server action, not only the account-management screen.

## 4. ROOTS assignment and protection matrix

| Actor | ROOTS category visible? | Assign DEV1 to STAFF | Assign ADMIN to STAFF | Interact with DEV | Interact with DEV1 | Interact with ADMIN |
|---|---:|---:|---:|---:|---:|---:|
| DEV | Yes | Yes | Yes | Self/root | Yes | Yes |
| DEV1 | No | No | Yes — scoped action only | No | Self/root | Yes |
| ADMIN | No | No | No | No | No | Self/root |

The DEV1 ADMIN-assignment action must be presented independently of the ROOTS category interface. It must not reveal ROOTS or any other ROOTS management capability. This table records assignment and isolation requirements only. It does not define the future rights of ordinary YARD ROLES.

## 5. Proposed persistence model

The current Central Bank payload contains:
- `users[]` with username, display name, tier and credential hash fields.
- `staff.roster[]` and `staff.profiles{}`, currently keyed by staff display name.
- Compatibility copies in `appData.staffRoster` and `appData.operatorProfiles`.
- Tier-keyed permission profiles in `tiers{}`.

Target model:
- Each USER has a stable `userId`, an ordinary YARD ROLE or a protected root assignment reference, credentials, account status and a `staffId`.
- Each linked STAFF profile has a stable `staffId` and `linkedUserId`, plus operational fields and any DEV-assigned ROOTS classification.
- ROOTS assignment is held as protected system metadata associated with the STAFF identity; it is not exposed as an ordinary role selector.
- The STAFF directory is derived from linked STAFF records; it is not a second authentication directory.
- DEV is the immutable system USER. DEV1 and ADMIN are assigned to STAFF members through the hidden ROOTS system category, and the linked USER inherits the corresponding protected root identity for authorization. They are not ordinary YARD ROLES.

Implementation must retain the existing Central Bank single-payload storage and optimistic version checks unless a verified technical requirement proves otherwise. No second database, auth provider, or standalone STAFF database is introduced.

## 6. Migration requirements

1. Inventory all current USER accounts, STAFF roster entries, profiles, archived entries and legacy compatibility copies.
2. Produce a deterministic mapping from each existing USER to an existing STAFF record where a match is reliable.
3. Do not auto-merge records based solely on similar display names when identity is ambiguous.
4. Preserve operational history, station assignments, photos, on-site status, archive state and audit history.
5. Create a linked STAFF profile for every existing USER that has no unambiguous matching profile, using the approved migration defaults and marking incomplete operational details for later completion.
6. Preserve standalone legacy STAFF records as operational-only records unless the owner explicitly decides they should receive login accounts. Do not create USER accounts as a side effect of STAFF migration.
7. Migrate the current DEV/OWNER identity to protected DEV without changing its credential hash or requiring a reset, unless a separately approved security migration requires it.
8. Do not automatically promote existing DEVACC or ADMIN tier accounts into DEV1 or ADMIN ROOTS STAFF assignments. Their mapping requires explicit owner review because the new root hierarchy is not equivalent to the old tier system.
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
- The ROOTS category and its management interface are visible only to DEV. DEV can assign DEV1 and ADMIN there. DEV1 receives a separate, narrowly scoped action to assign ADMIN to a STAFF member; this action must not reveal or open ROOTS. ADMIN and ordinary users see no ROOTS interface or protected-classification assignment action.
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
- DEV alone can see the hidden ROOTS category and assign DEV1 to a STAFF member.
- DEV and DEV1 can assign ADMIN to a STAFF member; DEV1's assignment path does not expose ROOTS.
- ROOTS is never exposed as a normal USER category or YARD ROLE.
- No STAFF creation path can create a USER account.
- USER and STAFF share a stable identity link that survives name changes.
- STAFF presentation edits cannot mutate credentials or account authority.
- STAFF archive/removal cannot delete or disable USER.
- DEV is immutable and unassignable at the server layer.
- ROOTS is a protected hidden system category; only DEV can see the category interface, and it cannot be deleted.
- DEV1 cannot interact with DEV.
- ADMIN cannot interact with DEV or DEV1.
- Assignment rules for DEV1 and ADMIN are enforced server-side.
- Existing records and historical operational data survive migration.
- Legacy tier permissions are not silently reused as YARD ROLE permissions.
- Automated tests cover authorization bypasses, duplicate creation, concurrency conflicts, migration idempotency and compatibility.
- CI, browser tests and production-equivalent verification pass before any production rollout.


## Owner decision — YARDHUB administration consolidation (2026-11-26)

The owner approved the proposed destination for account, personnel and permission administration:

- USER account management is to be located in YARDHUB.
- STAFF operational directory and personnel management is to be located in YARDHUB.
- The new **Access and Rights** function is to be located in YARDHUB.
- The three corresponding cards (**USERS**, **STAFF**, and **ACCESS AND RIGHTS**) are to be removed from DOWNTIME Settings only after their replacement YARDHUB workflows are implemented, tested and verified. Do not remove the existing DOWNTIME controls prematurely and leave administration inaccessible.
- YARDHUB Access and Rights is visible only to protected DEV, DEV1 and ADMIN identities, subject to server-side authorization. ROOTS remains hidden: DEV can administer DEV1/ADMIN assignments; DEV1 has only the separately scoped ability to assign ADMIN; ADMIN cannot browse or administer ROOTS.
- Ordinary YARD ROLE permissions are configured per department using four mutually exclusive levels: **Off**, **Read Only**, **Input**, and **Manage**. Read Only permits viewing only; Input permits viewing and adding entries; Manage permits viewing, adding, editing and removing entries.
- Operational STAFF job roles remain distinct from application access permissions.

This decision confirms the administration destination and UI direction. It does not yet resolve the separate Phase 1 questions about which existing permission planes are converted into YARD ROLES, cross-store transaction semantics, legacy account mapping, or exact migration details. No accounts are to be deleted or reclassified in production based solely on this decision. Preserve historical records and audit attribution; any retirement/reclassification must be an explicit, reviewed migration with rollback.


## Owner decision — unified YARD ROLE permission model (2026-11-26)

The owner approved the recommended direction:

- The existing Central DOWNTIME tier permission plane and the existing YARDHUB tier/section permission plane are to be replaced by **one unified YARD ROLE permission model**.
- YARD ROLE is the application authorization model across departments and modules, configured using the agreed mutually exclusive levels: **Off**, **Read Only**, **Input**, and **Manage**.
- The two existing permission stores are legacy persistence/authorization sources to be retired through a staged migration. They must not remain competing authorities after cutover.
- ROOTS (DEV1 and protected ADMIN classifications) remains a separate, hidden system-authority mechanism, not a YARD ROLE and not part of the ordinary department permission matrix.
- STAFF operational job roles remain separate from YARD ROLE permissions.
- Existing permissions must not be silently copied by matching legacy tier names. A reviewed mapping and explicit fallback policy are required for every existing account and department.
- Preserve server-side enforcement, audit history, session safety, Central Bank optimistic versioning and the existing YARDHUB/R&M data boundaries unless a separately approved migration design explicitly changes them.
- Do not remove either legacy permission store or its enforcement until the unified model is implemented, tested, rehearsed and approved for cutover.

This resolves Phase 1 Decision A in favour of a unified model. It does not by itself approve a production migration, account deletion/reclassification, or deployment.
