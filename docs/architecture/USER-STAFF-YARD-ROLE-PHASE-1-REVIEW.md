# USER / STAFF / ROOTS / YARD ROLE — Phase 1 Source Review and Acceptance

Status: **Phase 1 architecture review complete — implementation and production reset remain separately gated**  
Review date: 2026-11-26  
Reviewed production baseline: `main` at `b08735da3e8b7dd4ad863bdf94bd672e3c25e846`  
Review scope: source, API, browser, database, workflow and regression-test dependency review  
Production impact: **None. Read-only review; no application code, data, migrations, configuration or deployment changed.**

## 1. Phase 1 decision

The Phase 1 architecture and compatibility review is complete for the purpose of approving the architecture record in PR #190.

This acceptance means:
- The target identity, ROOTS and YARD ROLE rules are sufficiently defined to serve as the controlling architecture.
- The existing identity, permission, operational and persistence dependencies are identified below.
- The target API contract, compatibility cutover, reset manifest structure and release gates are defined.
- Known current-state security and compatibility risks are explicitly recorded rather than treated as resolved.

This acceptance **does not** authorise application implementation, database migrations, production data changes, account deletion, identity reset, or production rollout. Those remain separate controlled releases requiring their own implementation tests and explicit release approval.

## 2. Review coverage and source baseline

The current `main` baseline was reviewed directly. The repository tree contains 163 tracked files, including:

| Surface | Reviewed inventory |
|---|---|
| Supabase Edge Functions | 7 request-handling functions plus the R&M PDF helper |
| Browser/runtime | `index.html`, `central-bank-admin.html`, `central-bank-client.js`, `yard-hub-settings.js`, `yard-hub-structure.js`, `repair-maintenance-app.js` |
| SQL migrations | All 33 files under `supabase/migrations/` |
| Supabase configuration/schema | `supabase/config.toml`, `supabase/schema.sql` |
| Regression contracts | 19 identity, access, STAFF, YARDHUB, R&M, GATELOG and photo-evidence tests identified and inspected |
| Automation | `.github/workflows/ci.yml`, `.github/workflows/pages.yml`, `.github/workflows/photo-evidence-cleanup.yml` |

The review distinguishes a tracked-file inventory from a runtime dependency. Unrelated source files were not treated as permission consumers merely because they exist in the repository.

## 3. Confirmed current architecture and dependencies

### 3.1 Central identity and session authority

Primary source: `supabase/functions/central-bank/index.ts`; client adapter: `central-bank-client.js`.

- The Central Bank JSON payload is the current USER and STAFF source of record.
- USER records are stored in `bank.users[]` with username, display name, legacy tier, enabled state and PIN salt/hash. There are no immutable USER or STAFF IDs in the current identity contract.
- The browser receives an opaque session token; the token hash is stored in `downtime_central_sessions`. Current session rows contain username, tier and expiry. Authenticated actions resolve the current USER by session username and derive permissions from the current tier.
- The browser adapter stores the session in tab-scoped `sessionStorage` and exposes legacy actions including `user-save`, `user-delete`, `staff-save` and `tiers-save`.
- `safeUser()` exposes the legacy tier in client responses.
- `user-save` and `staff-save` are separate writes. USER creation does not create its STAFF profile. USER deletion removes the USER and sessions but does not implement the target lifecycle contract.
- USER updates and deletes revoke sessions by username. This must become stable-ID based when usernames are mutable attributes rather than identity keys.
- The unauthenticated `list-users` action executes before session validation and returns enabled usernames, display names and legacy tiers. It currently supports the login selector but exposes more directory data than the login flow needs.
- `get-state`, settings writes, tracker writes, daily operator actions, STAFF actions and tier changes have independent legacy permission checks. The server-side checks, not browser visibility, are the enforcement boundary.

Target treatment:
- Bind sessions to immutable `userId`, not username or tier.
- Keep token hashes server-side; never accept a client-supplied tier, ROOTS class, role level or permission boolean as authority.
- Re-resolve active USER, ROOTS and YARD ROLE state server-side for every protected action.
- Replace account creation with one staged USER+STAFF provisioning workflow. A partially provisioned identity must remain non-active and unable to authenticate.
- Make public login discovery return only the minimum identifier needed for sign-in, or replace it with a non-enumerating login flow. Do not expose tier or ROOTS metadata before authentication.
- Version the API contract and make legacy mutation routes reject-only after cutover. Old cached clients must be forced to refresh and cannot fall back to legacy writes.

### 3.2 STAFF identity, operational records and name-keyed copies

Confirmed current structures:
- `bank.staff.roster[]`
- `bank.staff.profiles{}`, keyed by display name
- `bank.appData.staffRoster`
- `bank.appData.operatorProfiles`

STAFF profile writes, roster reconciliation and operational state saves are distinct from USER writes. The STAFF UI and server enforce department-specific operational positions, station eligibility, station locks, on-site state, archive state and photo handling.

A terminology collision exists in the current application: STAFF operational positions are labelled **YARD ROLE**, while the target architecture uses **YARD ROLE** for application access profiles. The target contract must keep these concepts separate:
- Application access profile: **YARD ROLE**.
- STAFF department/job assignment: `operationalRole` (UI label **STAFF POSITION**).
- Existing `onSiteRole` and current display labels remain compatibility aliases only until their consumers are migrated.

Target treatment:
- USER has immutable `userId` and exactly one immutable `staffId`.
- STAFF has immutable `staffId` and optional `linkedUserId`; one STAFF can link to at most one USER.
- Link records only by immutable IDs. Never infer links from names, usernames, photos or similar display values.
- STAFF-only workflows may maintain explicitly unlinked operational STAFF records, but can never create or grant a USER identity.
- Renaming a USER or STAFF display name must not break assignments, history, photos, reports or links.
- Keep operational department/position rules separate from application access rights.

### 3.3 YARDHUB permission authority

Sources: `yard-hub-settings.js`, `supabase/functions/yard-hub-settings-api/index.ts`, migration `20261123212500_yard_hub_access_control.sql`.

- YARDHUB currently has its own built-in, custom and retired tier catalogue.
- Its permission profiles include section modes such as `NONE`, `READ`, `INPUT` and `EDIT`.
- Per-user assignments are stored in `userTiers`, keyed by lower-cased username.
- The YARDHUB API authenticates against the Central Bank opaque session, then combines the current Central legacy tier and YARDHUB tier to resolve rights.
- The UI displays both tier systems.
- Saving a user currently performs a Central Bank USER write and a separate YARDHUB tier write. The two writes are not atomic; a failure can leave a partially updated account.
- The YARDHUB save RPC is service-role only and uses version checking plus a separate YARDHUB audit table.

Target treatment:
- One canonical YARD ROLE catalogue and department matrix is authoritative to both DOWNTIME and YARDHUB after cutover.
- Use exactly one level per ordinary role/department: OFF, Read Only, Input or Manage.
- The same resolver must govern module visibility and every server-side action.
- Do not silently map old Central tiers, YARDHUB tiers, custom tiers or per-user assignments to new roles.
- Cross-store provisioning is a staged workflow with idempotency, expected-version checks, retry, compensation, reconciliation and an inactive intermediate state. It is not described as a distributed database transaction.
- Retain the old permission stores only as read-only compatibility sources during a defined transition. Remove all legacy fallbacks and competing authority at the approved cutover.

### 3.4 Separate authorization surfaces

| Surface | Current enforcement | Required target treatment |
|---|---|---|
| Central Bank API | Opaque Central session; legacy Central tier booleans | Common USER/ROOTS/YARD ROLE resolver |
| YARDHUB Settings API | Central session + legacy Central tier + YARDHUB tier | Same resolver; privileged administration restricted to approved ROOTS classes |
| R&M API | Central session + Central tier + YARDHUB per-user tier/mode; includes legacy fallback when the YARDHUB table is absent | Map each R&M action to department level; remove legacy fallback at cutover |
| GATELOG API | Central session + legacy `canAccessYardHub`, `canManageAssignments`, `canExportReports` | Map each action to the approved GATELOG department level; actor attribution uses immutable USER ID |
| Central configuration control plane | Separate session check; currently DEV+OWNER or DEVACC | Preserve as a separate control-plane boundary. Do not automatically grant DEV1 or protected ADMIN configuration-registry access merely because they receive department Manage access |
| Spectator read | Supabase gateway JWT plus a separate access-code check; service-role read of shared tracker state | Preserve the separate read-only spectator boundary; do not turn it into a USER/STAFF login |
| Photo evidence | Service-role storage access; no Central session or actor check in create-upload, view or delete actions | Security remediation is required before this API can be relied on as an identity-bound media boundary |

Additional action-level dependencies:
- Daily operator assignment/unlock in the Central Bank API uses a hard-coded legacy tier allowlist.
- GATELOG Gateman assignment uses STAFF display names; its table stores a username-named field plus a name snapshot. The value is currently a STAFF name, not an authenticated USER.
- R&M returns permission booleans to the browser; the browser consumes these for machinery read/add/manage, preset management, fault create/edit/delete and exports.
- Central configuration administration is deliberately separate from account and permission management. Its current DEVACC allowance is legacy behaviour, not the target ROOTS model.

## 4. Security and compatibility findings requiring explicit release treatment

These findings pre-exist PR #190; the PR is documentation-only and does not introduce them.

### F1 — Photo evidence lacks application identity authorization

`supabase/functions/photo-evidence/index.ts` uses the service-role key for `create-upload`, `view` and `delete`, but those actions do not validate a Central Bank session, authenticated USER, ownership or actor. Only `cleanup` checks `PHOTO_CLEANUP_SECRET`. The private bucket and short-lived signed URLs do not themselves establish who may create, view or delete an attachment.

The current `tests/photo-evidence.mjs` verifies signed URLs, file size, expiry, private bucket and cleanup secret, but does not assert authenticated ownership or action authorization.

**Release requirement:** add and test server-side identity/ownership checks in a separately reviewed security change before treating photo evidence as identity-bound or including its objects in an identity reset. Do not broaden the scheduled cleanup workflow.

### F2 — Public login directory enumeration

The Central Bank `list-users` action returns enabled usernames, display names and tiers before opaque-session validation. This is not a ROOTS leak, but it exposes more account directory information than is required for login.

**Release requirement:** reduce pre-authentication disclosure to the minimum login identifier or adopt a non-enumerating login flow. Never expose ROOTS classification or access assignments before authentication.

### F3 — Independent Supabase Auth/RLS surface

`supabase/schema.sql` grants the Supabase `authenticated` role broad SELECT/INSERT/UPDATE policies on `downtime_shared_state`. The Central Bank data and newer operational tables use separate service-role-only access patterns. Realtime broadcast also has its own authenticated policy.

**Release requirement:** preserve this existing DOWNTIME shared-state and realtime boundary. Before cutover, verify whether any live client or credential can use the direct Supabase Auth path; do not assume the Central Bank session resolver automatically governs it. Do not change these policies as part of the documentation merge.

### F4 — Multiple historical identity representations

STAFF data and operational attribution use display-name keys/snapshots across Central Bank payload copies, daily operator assignments, GATELOG Gateman assignments, R&M records and audit events.

**Release requirement:** add stable IDs for new relationships and new audit events, but preserve existing display-name snapshots and historical attribution. Never bulk-rewrite history to newly created identities.

### F5 — Legacy privilege equivalence is broader than the target

Current tests and APIs treat DEVACC as DEV-equivalent in several control surfaces. Existing ADMIN tier can manage some user/permission settings; delegated ADMIN and supervisor allowlists also exist. The target ROOTS classes are DEV, DEV1 and protected ADMIN; legacy DEVACC and ordinary ADMIN tier strings must not be interpreted as the new protected classifications.

**Release requirement:** explicitly deny legacy DEVACC/OWNER/ADMIN tier strings any new ROOTS authority after cutover unless a fresh protected assignment exists. Protected ADMIN is a server-side ROOTS classification, not an ordinary role label.

### F6 — R&M legacy fallback

The R&M API contains fallback logic when the YARDHUB permission table is missing and derives access from legacy Central tier defaults. This is a compatibility fallback, not a safe post-cutover authority.

**Release requirement:** retain only during a bounded transition; remove it when the canonical YARD ROLE resolver becomes authoritative. Missing canonical configuration must fail closed.

## 5. Database, RPC, RLS and storage review

All 33 migrations were enumerated and inspected. The relevant architecture is:

- `downtime_central_bank` stores the Central Bank JSON payload. RLS is enabled; browser roles are revoked and service_role is granted access.
- `downtime_central_sessions` and `downtime_central_audit` are separate tables, RLS enabled, browser roles revoked, service_role only.
- `downtime_central_config_state` and `downtime_central_config_history` form a separate versioned control plane, RLS enabled, browser roles revoked, service_role only.
- `yard_hub_tier_config` and `yard_hub_access_audit` hold the separate legacy YARDHUB tier model. The `yard_hub_save_tier_settings` RPC is executable only by service_role and uses compare-and-swap versioning.
- `downtime_commit_central_bank` is a SECURITY DEFINER atomic payload/audit RPC, with execution revoked from public/anon/authenticated and granted only to service_role.
- R&M faults, notes, attachments, audit, machinery, model, preset and PDF-export tables use RLS with direct browser-role access revoked and service_role grants.
- GATELOG customer, vehicle, visit, waste, join, assignment and archive tables use RLS with direct browser-role access revoked and service_role grants. GATELOG write/statistics RPCs are restricted to service_role; Edge Function authorization is therefore the action-level gate.
- Daily operator assignment and audit tables are RLS-enabled and service-role-only.
- The staff-photo bucket is private. Static files under `assets/staff` are a different asset class and must not be confused with private bucket objects.
- The transient photo-evidence bucket uses private storage and 24-hour expiry metadata. Its separate scheduled cleanup runs every five minutes and is secret-gated.
- Spectator migrations revoke direct anon table access and route reads through the separate secure Edge Function.
- Realtime broadcast has a separate authenticated read policy and trigger.

No migration in this review authorises an identity reset. Service-role-only SQL access is not a substitute for correct Edge Function action authorization.

## 6. Canonical target contract

### 6.1 Identity records

USER:
- `userId`: immutable UUID primary identity.
- `staffId`: immutable required link to exactly one STAFF record.
- `username`: unique case-insensitive login attribute; mutable only through an audited update.
- `displayName`: presentation attribute.
- `credential`: salted PIN hash material only; never returned by an API.
- `status`: explicit provisioning/active/disabled lifecycle state.
- `yardRoleId`: ordinary access-role assignment, if applicable.
- `rootsClass`: protected server-owned classification; never accepted from ordinary account-edit payloads.

STAFF:
- `staffId`: immutable UUID primary identity.
- `linkedUserId`: nullable immutable USER link; unique when present.
- `displayName`, department, `operationalRole`, station, station-lock, on-site status, archive status and photo references remain operational attributes.
- A STAFF profile grants no authentication or application authority by itself.

Required invariants:
- Every newly provisioned USER has exactly one linked STAFF.
- A STAFF links to at most one USER.
- Username and display-name changes do not change identity links.
- STAFF archive does not disable USER.
- USER disablement revokes sessions but does not erase STAFF or historical records.
- DEV remains immutable and cannot be linked to a STAFF record.
- Incomplete provisioning remains non-active and cannot authenticate.
- No identity or permission assignment is inherited from the pre-reset population.

### 6.2 ROOTS

- DEV is the immutable root identity and the only authority that can browse/manage ROOTS and assign DEV1 or protected ADMIN.
- DEV1 and protected ADMIN receive automatic Manage across every department.
- DEV1 cannot view, inspect, edit, disable, delete or otherwise interact with DEV; cannot browse ROOTS or assign DEV1. DEV1 may assign protected ADMIN only through a narrowly scoped action.
- Protected ADMIN cannot interact with DEV or DEV1, browse ROOTS or assign protected classifications.
- ROOTS is hidden server-side system metadata, not a USER category or ordinary YARD ROLE.
- Legacy OWNER, DEVACC and ADMIN tier values never confer protected ROOTS status by themselves.

### 6.3 YARD ROLE matrix

Each ordinary YARD ROLE has exactly one level per department:

| Level | Permitted capability |
|---|---|
| OFF | No department tile or API access |
| Read Only | View only |
| Input | View, add and edit; no removal/deletion |
| Manage | Full supported department capabilities, including removal/deletion |

The server evaluates the same level for both UI availability and every API action. Export, bulk actions and other non-CRUD capabilities must be explicitly mapped during each department's action inventory; do not infer them from a UI flag or legacy permission boolean. ROOTS overrides are resolved separately and are not stored by populating ordinary YARD ROLE assignments.

### 6.4 API and session contract

Proposed versioned API contract for implementation:
- Login authenticates credentials and returns an opaque session token plus a minimal safe identity response and contract version.
- Session persistence stores token hash, immutable `userId`, expiry and identity/session version. It does not treat a client tier claim as authority.
- A single server-side resolver returns the current USER status, protected ROOTS classification and canonical YARD ROLE department level for each request.
- USER+STAFF provisioning accepts an idempotency key and expected versions, stages the Central Bank and role-store writes, records audit events and activates the USER only after all required stages reconcile.
- STAFF-only create/update/archive/restore remains distinct and cannot create or modify USER credentials.
- ROOTS assignment uses dedicated server actions with the DEV/DEV1 restrictions above.
- Role configuration and assignment writes use optimistic version checks and server-side validation.
- Every mutation records immutable actor/target IDs plus safe historical display-name snapshots.
- Legacy `user-save`, `user-delete`, `tiers-save` and `save-user-tier` writes become reject-only after cutover. The legacy STAFF-only path may remain only for explicitly unlinked operational STAFF and must never create a USER.
- Stale clients receive an explicit contract-version error, clear their cached session and refresh; there is no silent legacy permission fallback.

## 7. Identity-reset dependency manifest

The production reset is a separate migration and must be generated from live production data immediately before its separately approved execution. This review defines the manifest structure; it does not guess production counts or enumerate private objects.

The manifest must include:

1. **USER accounts:** exact immutable IDs and counts; retain only DEV. Record the protected DEV credential hash fingerprint without exposing credential material.
2. **Sessions:** exact session-row count and deletion scope. Revoke all existing sessions, including DEV sessions, at cutover; DEV identity and credential material remain.
3. **STAFF live records:** exact `staffId`/legacy key counts across `staff.roster`, `staff.profiles`, `appData.staffRoster` and `appData.operatorProfiles`. Remove live STAFF profiles as specified, without rewriting operational history.
4. **YARDHUB assignments:** enumerate and clear legacy per-user `userTiers`, custom/retired tier assignments and all legacy per-user permission grants. Do not map old assignments to new roles.
5. **STAFF media:** inventory private `downtime-staff-photos` objects and JSON references by exact object path and owner. Keep static `assets/staff` library assets unless separately classified as identity-owned.
6. **Photo evidence:** inventory `downtime-evidence` separately from STAFF photos. Do not delete it by display-name matching; resolve F1 before identity-bound cleanup.
7. **Preserved operational history:** retain tracker weeks, downtime records, reports, central and YARDHUB audit history, daily operator assignments/audit, GATELOG customers/vehicles/visits/waste/visit audit/Gateman assignment history, R&M faults/notes/audit/PDF archives and shared configuration history. Historical names remain snapshots.
8. **Control-plane and shared-state boundaries:** preserve Central configuration draft/published history, spectator access, shared-state RLS and realtime policies unless a separately approved change explicitly requires otherwise.

Required execution safeguards: exact before/after counts, object-path manifest, checksums where applicable, dry-run report, isolated rehearsal, idempotent operations, optimistic version checks, transaction boundaries, compensation/recovery plan, immutable audit evidence and explicit final production approval. No destructive operation may use fuzzy name matching.

## 8. Regression-test migration matrix

The following current tests are compatibility contracts, not proof of the target architecture. Retain them as historical baselines where useful, then replace legacy assertions deliberately with positive and negative tests for the new model:

- `access-rights-live-contract.mjs`, `admin-access-rights-delegation.mjs`: replace legacy permission booleans and delegated ADMIN semantics with the four-level department matrix and protected ROOTS tests.
- `devacc-security-contract.mjs`, `root-account-split-contract.mjs`, `central-bank-menu-access-contract.mjs`, `central-bank-admin-contract.mjs`, `central-config-admin-api-contract.mjs`, `central-config-admin-ui.mjs`: prove legacy DEVACC/OWNER/ADMIN tier strings cannot confer ROOTS; preserve the separate configuration control-plane boundary.
- `central-bank-api-contract.mjs`, `central-bank-client-contract.mjs`: test immutable-ID session binding, contract versioning, stale-client rejection, session revocation and no legacy write bypass.
- `daily-operator-register-contract.mjs`, `roster-regression.mjs`, `staff-modal-upgrade-contract.mjs`, `staff-originals-upload-contract.mjs`, `station-manager-contract.mjs`: prove stable STAFF IDs, operationalRole separation, station rules, archive separation and historical attribution preservation.
- `yard-hub-settings-contract.mjs`, `yard-hub-contract.mjs`: prove one role source, staged provisioning and server-side ROOTS boundaries.
- `repair-maintenance-contract.mjs`: prove every R&M action follows the canonical level and no legacy fallback remains after cutover.
- `gatelog-contract.mjs`, `gatelog-day-management-contract.mjs`, `gatelog-settings-archive-contract.mjs`, `gatelog-browser.mjs`: prove GATELOG actions and actor/STAFF attribution use stable IDs while preserving historical visit snapshots.
- `photo-evidence.mjs`: add authenticated owner checks, actor attribution, cross-user denial and cleanup isolation before relying on photo evidence in identity lifecycle operations.

Mandatory negative tests:
- Forged client ROOTS, role, tier, department-level and permission fields do not grant access.
- DEV1 and protected ADMIN cannot inspect or mutate each other's protected identities or DEV.
- A legacy DEVACC or ADMIN tier alone cannot gain ROOTS authority.
- Input cannot delete/remove; Read Only cannot write; OFF cannot read through an API.
- Stale clients and legacy write actions cannot restore retired permissions.
- Duplicate IDs, orphan links, concurrent writes and partial cross-store provisioning fail closed and are retry-safe.
- STAFF rename/archive does not change USER identity or erase operational history.
- Reset dry-run counts exactly match the approved manifest; no shared history or unrelated DOWNTIME data is removed.

## 9. Deployment and release boundary

The current GitHub workflow behaviour was inspected:
- `ci.yml` runs smoke tests and Central/R&M/YARDHUB/GATELOG Edge Function type checks on pull requests and main pushes.
- `pages.yml` runs browser smoke tests and builds a Pages artifact on pull requests. On pushes to `main`, it deploys to GitHub Pages and performs live-site verification.
- `photo-evidence-cleanup.yml` runs independently every five minutes and uses its own cleanup secret and Supabase credentials.
- At review time, `main` had branch protection disabled and no required status checks configured. Therefore checks must be verified explicitly before merging; GitHub will not enforce them through branch protection.

PR #190 contains documentation only. Merging it will trigger the existing Pages workflow on `main`, which redeploys the current site snapshot; it does not implement the new application architecture or reset production identities. The later application implementation and identity reset must each use separate reviewed release gates and rollback plans.

## 10. Phase 1 acceptance checklist

| Deliverable | Result |
|---|---|
| Repository tree inventory | Complete — 163 tracked files |
| Auth/API dependency review | Complete — all current Edge Function surfaces identified and relevant auth paths inspected |
| Browser permission/session review | Complete — primary shell, CDB page, Central client, YARDHUB settings/structure and R&M client reviewed |
| SQL/RPC/RLS/storage review | Complete — all 33 migrations, schema and Supabase function config inspected |
| Permission-consumer matrix | Complete — Central, YARDHUB, R&M, GATELOG, daily operator, control-plane, spectator and photo boundaries mapped |
| Canonical USER/STAFF/ROOTS/YARD ROLE contract | Complete — Section 6 |
| Reset dependency manifest structure | Complete — Section 7; live counts and object paths intentionally deferred to the production dry run |
| Regression-test migration matrix | Complete — Section 8 |
| Release and rollback separation | Complete — Section 9 |

**Phase 1 accepted for architecture-record merge only.** The findings F1–F6 are mandatory carry-forward requirements for the application implementation/security work. They are not silently waived by this acceptance. No production identity reset, application implementation, migration or production deployment of the new architecture is authorised by this document.
