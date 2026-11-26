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
