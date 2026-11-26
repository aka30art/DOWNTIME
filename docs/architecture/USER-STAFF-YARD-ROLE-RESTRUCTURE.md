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


## Owner decision — unified YARD ROLE permission model (2026-11-26)

The owner explicitly approved replacing **both** existing application permission systems with one unified YARD ROLE model:

- The existing Central DOWNTIME tier permission system is to be superseded by the unified YARD ROLE model.
- The existing YARDHUB tier/section permission system is also to be superseded by that same unified YARD ROLE model.
- A single YARD ROLE assignment and its department-level access matrix will be the authoritative ordinary application permission model across DOWNTIME and YARDHUB.
- The four mutually exclusive department access levels are **Off**, **Read Only**, **Input**, and **Manage**.
- ROOTS classifications (DEV1 and protected ADMIN) remain a separate system-authority mechanism, not YARD ROLES.
- STAFF operational job roles remain separate from application permissions.

Implementation constraints:
1. Do not simply copy or rename either existing permission store and declare it unified. Define one canonical role/permission schema and a controlled compatibility/migration strategy.
2. Identify every Central DOWNTIME and YARDHUB permission consumer and migrate enforcement server-side before retiring either legacy permission source.
3. No legacy tier name (including OWNER, DEVACC, ADMIN, MANAGER, SUPERVISOR, USER, SPECTATOR or MECHANIC) automatically grants a new YARD ROLE or ROOTS classification. Produce an explicit owner-reviewed mapping.
4. Preserve the existing module and data boundaries until the unified authorization layer is implemented and regression-tested. Do not introduce cross-store writes or weaken existing authorization as an interim shortcut.
5. The unified model must enforce department-level Off/Read Only/Input/Manage semantics consistently in both applications, including direct API requests; UI visibility is not the security boundary.
6. Keep a compatibility/rollback path until all permission consumers have migrated and production verification passes.

This resolves Phase 1 Decision A. It does not by itself resolve cross-service transaction semantics for USER+STAFF+role assignment, individual legacy account mapping, incomplete STAFF matching, account lifecycle policy, or final field-level schema. No implementation, production data migration, merge or deployment is authorised by this decision alone.


## Owner decision — logical USER + STAFF + YARD ROLE creation (2026-11-26)

The owner approved a single logical account-creation operation that:
- creates the authenticated USER;
- creates exactly one linked operational STAFF profile;
- assigns the approved YARD ROLE and its department-level access configuration;
- exposes the account as active only after all required parts have been committed successfully.

The current Central Bank USER/STAFF payload and YARDHUB permission configuration are separate persistence boundaries. Therefore, this must **not** be implemented as two uncoordinated writes or described as a database-atomic transaction. Design a staged cross-store workflow with explicit states, idempotency keys, optimistic version checks, audit events, retry handling, compensation/rollback and reconciliation.

Required safety contract:
1. A newly created USER must not be able to log in or gain usable application access while its linked STAFF and required YARD ROLE assignment are incomplete.
2. The workflow must prevent duplicate USER records, duplicate STAFF records and duplicate role assignments on retry.
3. If any stage fails, either complete safely on retry or compensate to a consistent non-active state; never leave a partially provisioned active account.
4. The linked USER/STAFF identity relationship uses immutable IDs, not usernames or display names.
5. The canonical unified YARD ROLE model is the sole future authority for permissions in both DOWNTIME and YARDHUB. Legacy Central tiers and YARDHUB tiers remain compatibility inputs only during migration and cannot independently grant privileges after cutover.
6. Keep ROOTS classifications separate from ordinary YARD ROLE assignment. A normal account-creation flow cannot assign DEV1 or protected ADMIN; those require their dedicated authorised ROOTS workflows.
7. Preserve audit attribution and historical STAFF data. Account disablement, STAFF archive and permanent deletion remain distinct lifecycle actions.
8. Add fault-injection tests for failure after each stage, retry/replay tests, concurrent creation tests, version conflicts, compensation/reconciliation tests, and proof that incomplete accounts cannot authenticate or access either application.

This resolves the logical USER + STAFF + YARD ROLE creation boundary. It does not authorise production changes and does not settle individual legacy account mapping, incomplete existing USER/STAFF matching, or the full ordinary YARD ROLE catalogue.


## Owner decision — permanent identity and personnel reset (2026-11-26)

The owner corrected and explicitly approved a **permanent removal policy**, not disablement, archival or retention of other accounts.

### Identities to retain/reclassify
- `DEV` remains the immutable DEV root identity.
- The existing `DEVacc` identity is reclassified as protected `DEV1`.
- The designated existing `ADMIN` identity is reclassified as protected ROOTS `ADMIN`.
- `JAN` is the sole retained ordinary USER account.

The target identity set is therefore DEV, DEV1 (from DEVacc), protected ADMIN (from the designated Admin identity), and JAN. Do not create duplicate replacement accounts for these identities. Preserve or establish the linked STAFF identity required by the target USER/STAFF invariant for each retained identity; operational details must be verified rather than guessed.

### Permanent purge
- Permanently remove every other USER and STAFF account/profile.
- Permanently remove all data belonging to those removed USER/STAFF identities, including their account records, personnel profiles, associated photographs/media, profile metadata, assignments and other directly associated personnel records.
- This is not an archive, soft-delete or disable operation. No recoverable copy is to be retained as an application-level substitute for deletion.
- Before execution, inventory every dependent reference and classify records that contain mixed or shared business data. Remove the purged identities and their directly associated data without corrupting unrelated operational/business records or leaving broken references. Any ambiguous dependency must be surfaced for explicit owner review rather than guessed.
- Record a deletion manifest with exact identity IDs, affected data categories and counts; test the purge and its rollback/recovery implications in an isolated rehearsal before production execution. The owner’s desired final state is permanent erasure; a backup/rehearsal safeguard is a pre-execution control, not permission to retain deleted records in the live application.

### Execution boundary
This decision defines the intended migration outcome. It does **not** itself authorise immediate production deletion. No USER/STAFF data has been deleted or modified by recording this decision. Production purge requires a reviewed, exact deletion manifest, verified dependent-reference handling, approved execution window and explicit final go-ahead.

This decision supersedes any previous suggestion to merely disable or archive the other accounts.

## Production read-only inventory — initial identity reconciliation (2026-11-26)

Read-only inspection was performed against the authorised production project **ygwfipksbbprqynvbklk**, region **eu-west-1**. No writes, deletions, migrations or storage operations were performed.

Observed Central Bank payload version: **492**.
Observed YARDHUB tier configuration version: **26**.

### Current Central USER records (11)
| Username | Central legacy tier | Enabled |
|---|---|---|
| Callum | USER | true |
| Chris | SUPERVISOR | true |
| Dave | USER | true |
| Dean | SUPERVISOR | true |
| DEV | OWNER | true |
| Dowie | ADMIN | true |
| Jan | DEVACC | true |
| Jay | SUPERVISOR | true |
| Lee | MANAGER | true |
| Paul | USER | true |
| Paulie | USER | true |

### Current YARDHUB user-tier assignments (11)
| Username key | YARDHUB tier |
|---|---|
| callum | MECHA_2 |
| chris | SUPERVISOR |
| dave | USER |
| dean | SUPERVISOR |
| dev | OWNER |
| dowie | ADMIN |
| jan | DEVACC |
| jay | MECHA_1 |
| lee | MANAGER |
| paul | MECHA_2 |
| paulie | USER |

### Current STAFF directory
- 13 STAFF profile keys observed: Aaron, Big Harry, Chris, Daz, Dean, Dowie, Gigi, Jan, Lee, Mick, Ryan, Scotty and Shayne.
- STAFF profiles are currently keyed by display name, not stable linked identity IDs.
- Exact field-level dependency analysis remains outstanding.

### Current STAFF photo storage
Bucket **downtime-staff-photos** contains 4 objects:
- daz/216033c2-3cad-4926-990c-ea136df62434
- gigi/5f087f9e-4335-47dd-99ac-7f9ee457f77a
- jan/40d9f4f9-4303-4951-afcc-5a7a5738535f
- jan/f3b9d9c2-fa8b-451d-84ab-1fac2eb6f2c8

### Critical identity mismatch — execution blocked
The owner's intended mapping was stated as DEV → DEV, DEVacc → DEV1, Admin → ADMIN, with JAN retained as the sole ordinary USER. The live username inventory contains no username **DEVacc** and no username **Admin**. Instead:
- **Jan** is the username whose Central legacy tier and YARDHUB tier are both **DEVACC**.
- **Dowie** is the username whose Central legacy tier and YARDHUB tier are both **ADMIN**.
- The same **Jan** account therefore appears to be both the proposed DEV1 source (if “DEVacc” refers to its tier) and the explicitly retained JAN account.

No identity has been reclassified. No account, STAFF profile, session, audit record, photo, or other data has been removed. Do not infer that Jan should be DEV1 or that Dowie is the intended protected ADMIN without owner confirmation.

### Next inventory work
- Inspect full STAFF profile field shapes and appData compatibility copies.
- Inspect Central Bank sessions, audit, config-history and YARDHUB audit references by username.
- Inspect other tables and storage paths that may contain direct personnel references.
- Separate identity-owned data from shared operational history that must not be deleted.
- Produce a row-level deletion manifest with exact usernames, STAFF keys, object paths and dependent record counts only after the Jan/DEV1 and Dowie/ADMIN identity mapping is resolved.

This inventory is read-only and does not authorise or execute any purge.

## Owner decision — remove existing JAN identity at rollout (2026-11-26)

Owner confirms: remove the existing production account **Jan** completely as part of the restructure deployment. After deployment, DEV will create a new ordinary USER with username **JAN**. This is a new identity, not a rename, conversion or restoration. The new JAN must receive a newly generated stable user ID, linked STAFF ID, credentials and permissions through the approved USER creation flow. It must not inherit DEVACC/DEV1 authority, prior sessions, or the old account's permission assignments.

### Confirmed current removal scope from read-only production inspection
- Central USER record: username Jan, legacy tier DEVACC.
- YARDHUB user-tier assignment: username key jan → DEVACC.
- Central STAFF profile: STAFF key Jan; fields present: department, onSite, onSiteRole, photo, photoOriginalStored, photoPath, station, stationLocked.
- Central STAFF roster: one entry Jan.
- Central sessions: 42 rows for username Jan.
- STAFF photo bucket: two Jan-prefixed objects:
  - jan/40d9f4f9-4303-4951-afcc-5a7a5738535f
  - jan/f3b9d9c2-fa8b-451d-84ab-1fac2eb6f2c8
- The current Jan profile's photoPath points to the second object above.
- Historical daily operator assignments: 10 date rows (2026-11-16 through 2026-11-26, excluding 2026-11-22) contain Jan as operator_name, assigned_by and locked_by.
- Daily operator audit: 10 ASSIGNED records reference Jan as operator and actor.
- Central audit: actions include login/login-failed, save-settings, set-plant-status, staff photo/profile changes, tiers-save, user-save, user-delete and daily-operator assignment. Preserve audit history.
- YARDHUB access audit: 20 tier-permissions-save records by Jan. Preserve audit history.
- Central config-history query by actor Jan returned no rows.

### Purge versus historical record policy
At the deployment migration, remove the live identity-owned records: Central USER, linked STAFF profile and roster entry, YARDHUB user-tier assignment, all Jan sessions, and both Jan-owned STAFF photo objects. Remove or rewrite any compatibility copies of the live STAFF profile in the same atomic Central Bank update. Revoke any remaining session tokens as part of the operation.

Do **not** delete historical audit records or historical daily operator assignments/audit entries merely because they contain the display name Jan. Those are operational/audit history, not live identity ownership. Preserve their original attribution and dates unless a separately approved retention/legal policy requires otherwise. The new JAN account must not retroactively inherit or alter these historical records.

### Sequencing and safeguards
- Do not perform this purge now; it is a deployment-time operation after the new code and migration have passed acceptance and production rollout is explicitly approved.
- The migration must use exact username matching with case-insensitive safeguards, explicit row counts, idempotency, optimistic version checking and an auditable before/after result.
- Confirm the two exact storage object paths before deletion; delete only those two objects, never the entire photo bucket or another person's files.
- Verify Central Bank payload version increments once for the atomic USER/STAFF removal, YARDHUB config version increments for the separate assignment removal, Jan sessions are zero, both exact storage paths are absent, and historical audit/daily-operator rows remain unchanged.
- Confirm DEV still has root access and cannot be altered; do not change any other user or STAFF record.
- The new JAN account is created only after deployment, through the normal USER creation path, which creates the linked STAFF profile. It receives ordinary USER access only unless DEV later changes it through the approved controls.

This is an owner-approved future removal instruction, not permission to execute production changes before the deployment gate.
