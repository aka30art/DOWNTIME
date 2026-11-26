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
