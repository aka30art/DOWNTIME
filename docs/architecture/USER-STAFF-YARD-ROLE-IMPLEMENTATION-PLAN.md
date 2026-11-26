# USER / STAFF / YARD ROLE Restructure — Technical Review and Implementation Plan

Status: Planning gate — no implementation authorised by this document alone  
Architecture record: `docs/architecture/USER-STAFF-YARD-ROLE-RESTRUCTURE.md`  
Base reviewed: `main` at `b08735da3e8b7dd4ad863bdf94bd672e3c25e846`  
Review date: 2026-11-26  
Production impact: None. No application code, data, migrations, Supabase configuration, or deployment changed.

## 1. Review scope and source baseline

Reviewed the current production-branch source:
- `supabase/functions/central-bank/index.ts`
- `central-bank-client.js`
- `index.html`
- `tests/central-bank-tracker-contract.mjs`
- `package.json`
- `.github/workflows/ci.yml`

The current Central Bank implementation remains the authority for authenticated USER records, STAFF records and tier-based permissions. The browser adapter calls the Central Bank API; the browser does not directly access the bank table.

## 2. Findings from the current implementation

### 2.1 USER identity and authorization are tier-coupled

- `users[]` stores username, display name, tier, enabled status and PIN salt/hash.
- Login sessions store username and tier.
- Authorization derives the active tier from the current USER and looks up the corresponding tier permission profile.
- The server has special-case handling for OWNER/DEV, DEVACC and ADMIN.
- The `users` and `user-save` API paths expose and manipulate tier-based account state.
- The current `safeUser` response includes the tier.

Implication: YARD ROLES cannot safely replace tier labels alone. The authenticated identity, session claims, server authorization, permission profiles and UI assumptions must be migrated as one coordinated change. Existing tier permission profiles cannot be silently repurposed.

### 2.2 USER and STAFF are separate write workflows

- `user-save` creates or updates a USER and PIN credentials in one Central Bank payload write.
- `staff-save` separately creates or updates a STAFF profile.
- USER creation currently does not create a STAFF record.
- USER deletion currently removes the USER record and sessions; it does not implement the proposed explicit lifecycle separation from STAFF.
- STAFF archive/restore is currently a profile status change through the tracker settings save path.

Implication: the future USER create/update API must validate both record shapes and commit both together. The legacy STAFF workflow must remain available for operational-only STAFF entries, but must not create login identities.

### 2.3 STAFF identity is name-keyed

- `staff.profiles{}` is currently addressed by STAFF display name.
- `staff.roster[]` contains STAFF display names.
- Compatibility copies are maintained in `appData.operatorProfiles` and `appData.staffRoster`.
- Operational code, assignments, photos and UI paths use names as lookup keys in several places.

Implication: introducing stable IDs requires a compatibility period. It is unsafe to replace keys in one step or infer links from similar names. The migration must inventory every name-keyed consumer and preserve legacy lookups until all consumers are migrated and tested.

### 2.4 USER and STAFF UI are currently distinct

- The YARDHUB account modal collects username, display name, a YARDHUB tier, PIN and account status. It separately displays a protected DOWNTIME tier.
- STAFF management has its own modal and captures department, operational YARD ROLE, station, station-lock, on-plant status and photographs.
- Existing department-to-operational-role rules are already enforced in the STAFF UI and must be preserved as operational data rules, not confused with application access permissions.
- STAFF archive/restore is distinct from USER account disablement.

Implication: the unified USER creation workflow must include the existing STAFF operational fields while retaining the current operational department/role constraints. The existing YARDHUB/DOWNTIME module boundary and DOWNTIME's independent permission controls must not be casually collapsed.

### 2.5 Existing test infrastructure is extensive but contract-heavy

- `npm run test:central-bank` runs the Central Bank contract suite, including root-account, DEVACC, access-rights, admin delegation, and Phase 11 governance tests.
- `npm run test:smoke` includes the wider application, browser, GATELOG, mobile, STAFF and Central Bank suites.
- CI type-checks the Central Bank Edge Function and other production Edge Functions.
- Existing tracker contract tests assert current API names, UI labels and tier behaviour. These tests will need deliberate replacement/update as the new model is implemented; they must not simply be deleted or weakened.

Implication: new tests must prove the new model and the unaffected DOWNTIME/module boundaries. A passing legacy test suite alone will not prove the new identity architecture.

## 3. Non-negotiable implementation constraints

1. Keep the existing production Supabase project and Central Bank storage. Do not introduce a second database or authentication provider.
2. Do not use the staging Supabase project.
3. Keep DEV as the immutable root USER; preserve its credential hash unless a separately approved security migration requires otherwise.
4. Do not create USER accounts from legacy STAFF records.
5. A USER create/update operation that changes personnel fields must atomically maintain exactly one linked STAFF record.
6. Use immutable stable IDs for USER/STAFF links. Do not use usernames or display names as relational keys.
7. Keep STAFF operational presentation and staffing fields separate from application authorization.
8. Keep the future ordinary YARD ROLE catalogue and rights matrix undefined until the owner approves them.
9. Do not map old tier permissions to new YARD ROLE permissions automatically.
10. ROOTS is hidden system metadata, not a USER category or YARD ROLE. Only DEV sees the ROOTS category. DEV1 may invoke only the separately scoped ADMIN-assignment action. ADMIN has no ROOTS assignment capability.
11. Enforce every root assignment and isolation rule server-side. UI hiding is not a security boundary.
12. Keep unrelated DOWNTIME modules and their existing access controls unchanged.
13. Use staged changes, integrated tests, acceptance at each milestone, production verification and rollback capability.
14. No production migration or deployment until the owner explicitly approves the migration and rollout gate.

## 4. Target data contract

The following is a proposed logical contract. Exact field names and backwards-compatibility strategy must be finalised during Phase 1 before code changes.

### USER record

- Immutable `userId`.
- Immutable link `staffId`.
- Username/login identifier, unique case-insensitively.
- Display name.
- PIN salt and hash; never expose these in API responses.
- Enabled/account status.
- Ordinary YARD ROLE reference, only after the catalogue is approved.
- Protected root classification reference where applicable; never represent DEV1 or ADMIN as ordinary YARD ROLES.
- Created/updated metadata and audit linkage as appropriate.

### STAFF record

- Immutable `staffId`.
- Immutable `linkedUserId` for linked accounts; absent for legacy operational-only STAFF.
- Operational display name and existing STAFF fields.
- Department and operational YARD ROLE constrained by the current department rules.
- Station, station-lock, on-plant status, archive state, photographs and other existing operational metadata.
- Protected ROOTS assignment metadata for DEV1/ADMIN assignments, stored and returned only through authorised server paths.

### Invariants

- One USER links to exactly one STAFF record.
- One STAFF record links to at most one USER.
- A linked USER cannot silently lose or change its STAFF identity because a display name or username changes.
- Legacy operational-only STAFF may have no USER link.
- A USER cannot be created by the STAFF-only workflow.
- STAFF archive does not disable or delete USER.
- USER disable/delete lifecycle does not silently erase STAFF history.
- DEV cannot be assigned to a STAFF member and remains the fixed root USER.
- DEV1/ADMIN authority is derived from protected server-side assignment state, not client-supplied fields or a mutable ordinary role selector.

## 5. Staged implementation plan

### Phase 1 — Contract and compatibility design

Deliverables:
- Finalise exact USER and STAFF schema fields, immutable IDs and link constraints.
- Map every current reader/writer of `users[]`, `staff.roster[]`, `staff.profiles{}`, `appData.staffRoster` and `appData.operatorProfiles`.
- Identify every current permission check and session consumer that depends on `tier`.
- Define API versioning/compatibility behaviour for cached browser clients.
- Specify root assignment actions and the server authorization matrix.
- Specify how legacy STAFF records, incomplete USER records and duplicate/ambiguous names are represented.
- Specify how USER disablement, deletion, STAFF archive and restoration interact without deleting historical records.
- Record the final migration mapping format and rollback procedure.

Exit gate:
- No unresolved schema or API compatibility ambiguity.
- No unreviewed use of display names as identity keys in the target design.
- Owner approval of the data contract before implementation.

### Phase 2 — Additive identity foundation

Deliverables:
- Add stable IDs and explicit link metadata using a backwards-compatible, additive representation.
- Add deterministic normalization that does not mutate or discard legacy data unexpectedly.
- Add read-only diagnostics for duplicate IDs, orphan links, duplicate usernames and ambiguous name matches.
- Add migration preview/report generation with no write path to production.
- Add server-side validation helpers for one-to-one USER/STAFF relationships.

Tests:
- Existing payload normalization remains stable.
- Repeated normalization is idempotent.
- Duplicate IDs and conflicting links are rejected.
- Legacy operational-only STAFF remains visible and usable.
- No USER is auto-created from STAFF.
- Existing photos, station assignments, station locks, archive state and operational history remain intact.

Exit gate:
- All additive tests and existing Central Bank regression tests pass.
- Migration preview can account for every current USER and STAFF record without destructive guessing.

### Phase 3 — Atomic USER + STAFF lifecycle API

Deliverables:
- Introduce a version-checked USER create/update operation that validates and writes USER plus linked STAFF in one Central Bank payload commit.
- Require all existing STAFF operational details in the USER creation workflow.
- Make retries idempotent and prevent duplicate USER/STAFF pairs.
- Keep credential hashing server-side; never return PIN material.
- Preserve audit events and session invalidation for credential/account changes.
- Keep a separate STAFF-only create/update path for legacy operational-only records; explicitly reject attempts to create USER identities through it.
- Separate STAFF archive/restore from USER enable/disable/delete operations.

Tests:
- Successful USER creation creates exactly one linked STAFF.
- Invalid STAFF fields create neither USER nor STAFF.
- Missing/invalid PIN creates neither record.
- Concurrent version conflict creates neither partial record.
- Retry does not duplicate either record.
- Username/display-name changes do not break stable links.
- STAFF archive leaves USER active.
- USER disablement invalidates sessions without deleting STAFF history.
- USER deletion behaviour follows the separately approved lifecycle policy and never silently erases STAFF history.
- DEV cannot be modified, renamed, disabled, demoted, deleted or assigned to another STAFF identity.

Exit gate:
- Server contract tests prove atomicity, idempotency, concurrency safety and lifecycle separation.

### Phase 4 — Root authority and ROOTS controls

Deliverables:
- Implement protected DEV, DEV1 and ADMIN identity resolution.
- Implement ROOTS category visibility and DEV assignment controls.
- Implement DEV1's separate scoped ADMIN-assignment action without exposing ROOTS.
- Enforce the root hierarchy and interaction isolation on every relevant server action, including account reads, updates, disablement, deletion, role changes and session operations.
- Prevent client-supplied root classifications and ordinary role updates from escalating privileges.
- Keep root assignments attached to STAFF identity and resolve authority through its linked USER.

Tests:
- DEV can assign DEV1 and ADMIN.
- DEV1 cannot assign DEV1 and can assign ADMIN only through the scoped action.
- ADMIN cannot assign either root classification.
- Only DEV can query or browse ROOTS category data.
- DEV1 scoped ADMIN assignment does not return ROOTS metadata or expose category browsing.
- ADMIN and ordinary users cannot discover ROOTS through direct API calls, list/search/export routes or manipulated client requests.
- DEV1 cannot inspect, edit, disable, delete or otherwise interact with DEV.
- ADMIN cannot inspect, edit, disable, delete or otherwise interact with DEV or DEV1.
- Root protections hold even when requests bypass or manipulate the UI.
- Root classifications cannot be forged by ordinary USER/STAFF saves or tier/role edits.

Exit gate:
- Adversarial server-side authorization tests pass for every protected action.
- No ROOTS data leakage through normal state payloads or compatibility APIs.

### Phase 5 — YARD ROLE model and authorization migration

Deliverables:
- Owner-approved ordinary YARD ROLE catalogue and complete permission matrix.
- Replace tier-derived authorization with the approved YARD ROLE permission model.
- Explicitly preserve module boundaries, including the independent DOWNTIME Access & Rights behaviour unless separately authorised.
- Remove old tier permission dependencies only after all consumers have moved to the new authorization contract.
- Do not infer permission mappings from old tier names.

Tests:
- Full permission matrix tests for every role and protected root.
- Negative tests for privilege escalation and cross-module access.
- Existing DOWNTIME permissions and unrelated module access remain unchanged.
- Old tier fields cannot override or elevate new authorization.

Exit gate:
- Owner approves role catalogue and rights matrix.
- Full permission suite and cross-module regression suite pass.

### Phase 6 — UI integration

Deliverables:
- Make USER management the account creation/edit entry point.
- Include current STAFF operational fields in the USER creation/edit form.
- Keep credentials and account lifecycle controls clearly separate from operational STAFF presentation.
- Link STAFF directory entries to their USER account only for authorised viewers.
- Distinguish legacy operational-only STAFF from linked USER/STAFF.
- Preserve department-specific operational YARD ROLE rules, station assignment/lock controls, on-plant status, photographs and archive/restore.
- Hide ROOTS completely from everyone except DEV; provide DEV1 only the separate scoped ADMIN assignment action.
- Remove obsolete tier labels/selectors only after the new YARD ROLE model is approved and active.

Tests:
- Browser tests for create, edit, validation, duplicate prevention, archive/restore and account lifecycle.
- Desktop/mobile layout and keyboard/accessibility tests.
- UI visibility tests for DEV, DEV1, ADMIN and ordinary users.
- Direct API tests remain the security authority; UI tests are supplementary.

Exit gate:
- Browser flows pass on supported desktop/mobile viewports.
- UI cannot submit forbidden actions and server rejects forged requests.

### Phase 7 — Migration rehearsal and production rollout

Deliverables:
- Generate a deterministic migration plan and before/after counts.
- Produce an explicit review list for ambiguous identity matches and legacy tier accounts.
- Back up the current production Central Bank payload and verify recoverability.
- Rehearse migration against a production-equivalent isolated test fixture, not the staging Supabase project.
- Verify idempotency, audit trail, version checks, and rollback.
- Obtain explicit owner approval of the exact production migration plan.
- Deploy code and migration only at an approved milestone boundary.
- Verify production USER login, linked STAFF, root isolation, normal YARD ROLE permissions, operational roster, station assignments, photos and unrelated modules.
- Retain a tested rollback path.

Exit gate:
- All CI, Edge Function type checks, Central Bank contract tests, browser tests and production-equivalent verification pass.
- Owner explicitly approves production rollout.
- Post-deployment verification passes before the next phase proceeds.

## 6. Required test suites and gates

Minimum automated coverage:
- Schema normalization and compatibility.
- USER/STAFF one-to-one identity invariants.
- Atomic commit and optimistic version conflict handling.
- Retry/idempotency and duplicate prevention.
- PIN hashing, login, session invalidation and account disablement.
- DEV immutability.
- ROOTS confidentiality and assignment authority.
- DEV1/ADMIN isolation.
- Ordinary YARD ROLE permission matrix once approved.
- Legacy STAFF-only records and all operational metadata.
- Existing DOWNTIME, YARDHUB, GATELOG and Repair & Maintenance regression suites.
- Browser tests for account and STAFF workflows.
- Edge Function type checking.
- Production read-back verification and rollback rehearsal.

Existing test commands to retain and extend:
- `npm run test:central-bank`
- `npm run test:smoke`
- CI Edge Function type-check job.

Do not delete or weaken existing tests to make the migration pass. Update assertions only when the relevant behaviour is deliberately replaced and the new behaviour has equivalent or stronger coverage.

## 7. Principal risks and mitigations

| Risk | Mitigation |
|---|---|
| Name-keyed STAFF data is linked to the wrong USER | Do not guess; use deterministic matching evidence and owner review for ambiguous records |
| Existing UI clients continue sending legacy tier fields | Version the API contract and reject stale privilege-bearing fields after the compatibility window |
| ROOTS metadata leaks through generic state payloads | Keep root metadata out of generic payloads; use narrowly scoped server actions and explicit response allowlists |
| DEV1 scoped action accidentally exposes ROOTS | Separate endpoint/action with a minimal response; test category enumeration and metadata leakage |
| Existing operational workflows break during ID migration | Maintain compatibility adapters until all consumers use stable IDs; regression-test station, roster, photo and archive workflows |
| Partial USER/STAFF creation | One version-checked Central Bank commit; conflict and retry tests |
| Old tiers silently grant new privileges | No automatic mapping; owner-approved YARD ROLE matrix only |
| Unrelated module permissions change | Explicit cross-module regression tests and protected-scope review |
| Production migration cannot be reversed | Verified backup, deterministic migration, idempotency and rehearsed rollback before approval |

## 8. Decisions still required before implementation

These decisions are intentionally not guessed:
1. Final ordinary YARD ROLE names, definitions and permissions.
2. Whether DEV1 and ADMIN inherit every DEV/DEV1 capability beyond the authority equivalence and isolation rules already stated.
3. Exact ordinary USER suspension, departure, reactivation and permanent deletion policy.
4. Owner-reviewed mapping of current DEVACC/ADMIN and other legacy tiers.
5. Resolution of duplicate or ambiguous existing USER/STAFF names.
6. Exact list of required STAFF fields and which may have approved migration defaults for existing accounts.
7. Whether a USER may ever be linked to a replacement STAFF record after a departure/re-hire, or whether a new USER identity is required.

No code implementation should begin until Phase 1 is completed and the owner approves the contract. No production migration or deployment should occur without the separate rollout approval described above.


## 9. Phase 1 — verified implementation inventory

This section records what the current `main` source actually implements. It is a compatibility inventory, not an approval to change any of it.

### 9.1 Identity and authorization are split across two permission planes

| Plane | Current source of identity/access | Persistence | Important boundary |
|---|---|---|---|
| Central DOWNTIME identity | Central USER username, PIN hash, enabled state and legacy `tier` | `downtime_central_bank.payload.users[]`; session records in `downtime_central_sessions` | Central Bank Edge Function authenticates and enforces DOWNTIME permissions |
| YARD HUB access | Central USER identity/session plus separately assigned `hubTier` and section access | `yard_hub_tier_config` and related YARD HUB access configuration tables | YARD HUB settings API reads Central Bank identity but its tier updates do not write the Central Bank USER bank or revoke Central sessions |
| Repair & Maintenance access | YARD HUB user assignment and section-level access mode | YARD HUB access configuration | R&M resolves its access from the separate YARD HUB permission store |
| Operational STAFF | STAFF roster/profile and operational fields | Central Bank payload, with compatibility copies in `appData` | STAFF is not currently the login identity |

The current YARD HUB user editor deliberately displays the legacy DOWNTIME tier separately from the YARD HUB tier. The YARD HUB tier save path is isolated from Central Bank USER data. This separation is explicitly asserted by `tests/yard-hub-settings-contract.mjs`.

**Design consequence:** “YARD ROLE” must be defined against these existing permission planes before implementation. Replacing Central DOWNTIME tiers, YARD HUB tiers, operational STAFF role labels, or all three are materially different changes. No plane may be merged or removed by inference.

### 9.2 Current central authentication contract

- Bootstrap creates the fixed username `DEV` with legacy tier `OWNER`.
- Login validates the username/PIN against the Central Bank USER payload and stores an opaque session hash with username and tier.
- The session is 12-hour and the API reloads the current USER record before resolving the current tier and permission profile.
- The current safe USER response includes username, display name, enabled state and legacy tier; it excludes PIN salt/hash.
- The browser uses `central-bank-client.js` and the opaque session header.
- Central Bank writes use the singleton payload version compare-and-swap check.
- USER update/delete operations revoke sessions.
- The Edge Function is configured for its own opaque-session validation rather than the Supabase JWT gate.

### 9.3 Current Central Bank action inventory

The current Edge Function exposes these relevant actions:
- Identity/session: `bootstrap`, `list-users`, `login`, `logout`.
- State and operational writes: `get-state`, `save-state`, `save-settings`.
- USER/STAFF: `users`, `user-save`, `user-delete`, `staff-save`.
- STAFF media: `staff-original-upload`, `staff-photo-url`, `staff-photo-read`, `staff-photo-remove`.
- Permission configuration: `tiers-save`.
- Other central operational actions: `daily-operator-list`, `daily-operator-assign`, `daily-operator-unlock`, `set-plant-status`.
- Separate central configuration control-plane actions: `central-config-state`, `central-config-save-draft`, `central-config-publish`, `central-config-restore-draft`.

Any target contract must account for every action that reads or writes USER/STAFF data or resolves privilege. Updating only `user-save` and `staff-save` would be insufficient.

### 9.4 Current Central Bank and STAFF persistence

- Central USER records live in `bank.users[]`; they currently contain username, display name, legacy tier, enabled state and PIN salt/hash.
- Legacy tier permission profiles live in `bank.tiers{}`.
- STAFF profiles live in `bank.staff.profiles{}`, keyed by display name; `bank.staff.roster[]` stores names.
- `appData.operatorProfiles` and `appData.staffRoster` are compatibility copies used by tracker clients.
- `save-state`, `save-settings` and `staff-save` all contain STAFF-related preservation/validation logic. A stable-ID migration must cover all three write paths and the state hydration/compatibility code, not only the dedicated STAFF modal.
- Current station-lock and assignment protections must remain intact through any ID migration.
- STAFF photo operations use a private storage bucket and a separate original-photo library path; media records must remain associated with the correct STAFF identity after migration.

### 9.5 Current USER creation/edit surfaces

There are two coordinated but distinct current flows:
1. The YARD HUB account editor collects username, display name, PIN, enabled status and a YARD HUB tier. It also preserves/displays the existing DOWNTIME legacy tier separately.
2. The Central USER mutation bridge writes the DOWNTIME USER through the Central Bank API. YARD HUB tier changes are saved through the separate YARD HUB Settings API.

The current YARD HUB user editor does not collect the full STAFF operational profile. The STAFF modal separately collects name, department, operational role, station, station lock, on-plant status and photographs.

The target “create USER and automatically create STAFF” workflow therefore needs a defined cross-plane save contract. The Central USER + STAFF pair can be one Central Bank version-checked commit. If the same form also changes YARD HUB access configuration, that is a second persistence boundary today. A two-service operation cannot be described as atomic without a deliberate coordination design (for example, staged pending state plus finalization/compensation). Do not claim all three writes are atomic merely because USER and STAFF share one Central Bank payload.

### 9.6 Current role vocabularies that must not be conflated

| Current vocabulary | Current purpose | Future treatment |
|---|---|---|
| Central tiers: OWNER, DEVACC, ADMIN, MANAGER, SUPERVISOR, USER, SPECTATOR | DOWNTIME access and rights | User says existing TIERS are to become YARD ROLES; exact scope and permission migration require approval |
| YARD HUB tiers: OWNER, DEVACC, ADMIN, MANAGER, SUPERVISOR, MECHANIC, USER, SPECTATOR plus custom tiers | YARD HUB module/section access | Separate current permission plane; confirm whether it is included in the same YARD ROLE conversion |
| STAFF operational roles: Manager, Mechanic, Picking Line Crew, Floor Crew, Gateman, Main Operator | Operational job/department label | Remain operational STAFF data unless explicitly redefined |
| ROOTS classifications: DEV1, ADMIN | Protected root authority assigned to STAFF | Separate hidden system assignment; never an ordinary YARD ROLE |

Note: the string `ADMIN` currently exists both as a legacy tier and as the proposed protected ROOTS classification. The target schema must use unambiguous typed fields/enums and must not infer a root assignment from a legacy `tier === "ADMIN"` value.

### 9.7 Current migration baseline and additive persistence

- The Central Bank is a singleton JSON payload with optimistic versioning.
- Central USER sessions and audit history are separate tables.
- YARD HUB tier/access configuration and its audit records are in separate tables.
- The YARD HUB migration and contract explicitly require that its permission store does not write to or mutate the Central Bank bank, sessions, DOWNTIME tracker state or R&M records.
- The target design must decide whether that separation remains. Any proposal to move YARD HUB access into Central Bank or to coordinate writes across both stores requires a separate data-integrity design and explicit approval.
- No production data counts, duplicate report or user/STAFF matching report has yet been generated. Such diagnostics require a read-only production inventory under a separately approved access step; this document does not claim those records have been inspected.

## 10. Phase 1 contract decisions — blocking before code

The following decisions are the minimum needed to freeze the contract. They are not silently decided by the implementation plan.

### Decision A — scope of “existing TIERS become YARD ROLES”

Choose the target scope:
- Central DOWNTIME legacy tiers only.
- YARD HUB tiers only.
- Both permission planes become one unified YARD ROLE system.
- Both planes remain separate, but each receives its own role vocabulary and explicit mapping.

Until this is decided, the implementation must not remove or rename either permission plane.

### Decision B — relationship between ordinary YARD ROLE and operational STAFF role

Confirm that ordinary YARD ROLE means application access/permissions, while the STAFF operational role (Manager, Mechanic, Picking Line Crew, Floor Crew, Gateman, Main Operator) remains a separate job/department label. The proposed contract assumes they are separate.

### Decision C — atomicity boundary for USER + STAFF creation

The current architecture can atomically write USER + STAFF in the Central Bank payload. YARD HUB tier configuration is persisted separately. Confirm whether:
- the creation transaction must atomically include only USER + STAFF, with YARD HUB access assigned as a separate subsequent step; or
- account creation must include Central USER + STAFF + YARD HUB access as one logical transaction, requiring a designed cross-service transaction/finalization mechanism.

No multi-store atomicity is assumed without this decision.

### Decision D — DEV1 and ADMIN root identity lifecycle

Confirm whether root classifications are assigned to an existing linked USER/STAFF pair only, or whether a ROOTS assignment is permitted to create a linked USER as part of the assignment. The architecture currently assumes ROOTS assigns to an existing STAFF member whose linked USER already exists, because ROOTS is a STAFF assignment category.

### Decision E — legacy ADMIN naming collision

Confirm the migration policy for existing accounts whose current Central tier or YARD HUB tier is `ADMIN`. They must not become protected ROOTS ADMIN automatically. They remain legacy records pending explicit review until a new ordinary YARD ROLE mapping is approved.

### Decision F — existing USER records without STAFF matches

Confirm whether the migration may create a linked STAFF record with approved placeholder/incomplete operational fields for every existing USER, or whether accounts with missing department/role/station details must be held in a review queue before linking. No guessed operational details should be written.

### Decision G — STAFF photo identity

Confirm whether the existing name-based STAFF photo library paths should remain as compatibility aliases during migration, with stable STAFF IDs becoming the authoritative metadata key, or whether a separately approved photo migration is required. The existing storage objects must not be moved or deleted as a side effect of identity conversion.

## 11. Phase 1 completion status

Completed from source review:
- Current Central USER and session contract documented.
- Central Bank API action inventory documented.
- Current USER, STAFF and compatibility persistence paths documented.
- Current YARD HUB separate permission plane and its isolation requirements documented.
- Current STAFF operational role vocabulary distinguished from account permissions.
- Current test and migration boundaries identified.
- Cross-store atomicity risk identified.
- ROOTS/legacy ADMIN naming collision identified.

Not completed without owner decisions or approved read-only data access:
- Final role-plane scope.
- Final cross-store transaction boundary.
- Final root assignment lifecycle.
- Final legacy USER/STAFF match policy.
- Production duplicate/orphan inventory and before/after counts.
- Exact final field-level schema and migration mapping.

**Phase 1 remains at the decision gate. No implementation, migration, merge or production deployment is authorised by this review.**


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


## Superseding owner decision — clean USER/STAFF reset and department permission levels (2026-11-26)

This decision supersedes earlier conflicting retention/mapping assumptions in this plan. The target starting state is the existing immutable **DEV** root USER only. All other existing USER accounts and all existing STAFF profiles are removed by a future, explicitly approved deployment migration. DEV then creates all new USER accounts from scratch; every new USER receives exactly one newly linked STAFF profile and a fresh stable identity. DEV assigns DEV1 or protected ADMIN through the dedicated ROOTS workflow. No old identity, credentials, session, tier or permission assignment is inherited.

Preserve historical audit and shared operational/business records for traceability. Remove only live identity-owned records and media proven to belong to reset identities. The reset requires an exact deletion manifest, dependency review, rehearsal, idempotency, optimistic version checks, before/after verification, recovery/rollback planning and explicit final production approval. No production data is to be changed before that gate.

The canonical ordinary YARD ROLE permission matrix uses exactly one mutually exclusive level per role per department:

| Level | Meaning |
|---|---|
| **OFF** | Department tile disabled/inaccessible; no access. |
| **Read Only** | View information only; no changes. |
| **Input** | View, add and edit entries; cannot remove or delete. |
| **Manage** | Full department access and privileges, including removal and deletion where supported. |

These levels govern department tile availability and server-side actions. They are not four independent CRUD checkboxes. One level is selected for each role/department pair. The unified YARD ROLE model supersedes both legacy Central DOWNTIME and YARDHUB permission planes. ROOTS authority and STAFF operational job roles remain separate from ordinary YARD ROLE permissions.
## Owner decision — ROOTS department authority defaults (2026-11-26)

The owner confirms that protected ROOTS identities **DEV1** and **ADMIN** automatically receive **Manage** access across every department. They do not require individual ordinary YARD ROLE assignments or per-department permission selections to obtain this access. This automatic department authority is derived from protected ROOTS classification and enforced server-side.

- **DEV** retains full immutable root authority.
- **DEV1** automatically has Manage access across all departments, while remaining unable to view, inspect, edit, disable, delete or otherwise interact with DEV. DEV1 retains only the separately scoped ability to assign ADMIN; it cannot browse or administer ROOTS or assign DEV1.
- **ADMIN** automatically has Manage access across all departments, while remaining unable to view, inspect, edit, disable, delete or otherwise interact with DEV or DEV1. ADMIN cannot browse ROOTS or assign protected classifications.
- The ordinary YARD ROLE matrix (OFF, Read Only, Input, Manage) applies to ordinary users. ROOTS authority is a separate authorization layer and must not be represented by silently setting ordinary role matrix values.
- Root isolation and all department actions remain subject to server-side enforcement; UI visibility is not a security boundary.

This decision resolves whether DEV1 and ADMIN need per-department matrix configuration: **no**. Their Manage access is automatic by ROOTS classification, subject to the stated higher-root isolation rules. It does not authorize production changes or deployment.
