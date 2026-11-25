# DOWNTIME Production Release Runbook

**Status:** PREPARATION IN PROGRESS — NOT AUTHORISED FOR LIVE CUTOVER  
**Baseline:** `main` and recovery branch `backup-full-recovery-2026-11-25-0014` both resolve to `f5b3f73768399e3ca712a0ced86697c4498b0e6f`.  
**Environment boundary:** all current development and integration changes are restricted to staging. Production is read-only until a separate release authorisation is given.

## 1. Release scope

The current application release scope is:

1. YARD HUB authenticated launcher and shared session.
2. DOWNTIME tracker, central state, user/role administration, staff roster/profiles, assignments, plant overview, weekly reporting and evidence workflows.
3. REPAIR & MAINTENANCE machinery register, fault register, permissions, notes/evidence and PDF archive.
4. Central Data Bank and the DEV-only Master Configuration capability, subject to the production endpoint decision in section 6.

FLOOR and CHECK SHEETS are reserved tiles and are explicitly outside this release scope. They must not be represented as implemented modules.

## 2. Verified repository baseline

- Repository: `aka30art/DOWNTIME`
- Baseline commit: `f5b3f73768399e3ca712a0ced86697c4498b0e6f`
- Recovery ref: `backup-full-recovery-2026-11-25-0014`
- GitHub comparison of recovery ref against `main`: identical; zero commits ahead or behind.
- CI on the baseline had previously passed smoke tests and Edge Function type checks.
- Pages workflow on the baseline had previously passed test, build, deployment and post-deployment verification.

The recovery ref is a repository recovery point. It is not, by itself, a full database backup or a verified restore of Supabase storage.

## 3. Environment snapshot — 25 November 2026

### Production

- GitHub Pages: `https://aka30art.github.io/DOWNTIME/`
- Supabase ref: `ygwfipksbbprqynvbklk`
- Project status at inspection: `ACTIVE_HEALTHY`
- Region: `eu-west-1`
- Database engine: PostgreSQL 17

Production Edge Function versions observed during read-only inventory:

| Function | Version | Status |
|---|---:|---|
| `central-bank` | 13 | ACTIVE |
| `repair-maintenance-api` | 13 | ACTIVE |
| `yard-hub-settings-api` | 7 | ACTIVE |
| `photo-evidence` | 1 | ACTIVE |
| `spectator-read` | 3 | ACTIVE |

Production contains the Central Bank, configuration control-plane, YARD HUB access-control, Repair & Maintenance and machinery registry tables. The production machine-settings table was independently inspected and includes `model_dropdown_enabled`, `asset_selector_enabled` and `registration_enabled`.

### Staging

- Supabase ref: `phfojlqezudbjslfrnyw`
- Project status at inspection: `ACTIVE_HEALTHY`
- Region: `eu-west-1`
- Database engine: PostgreSQL 17

Staging Edge Function versions after this session's staging-only alignment:

| Function | Version | Status |
|---|---:|---|
| `central-bank` | 7 | ACTIVE |
| `repair-maintenance-api` | 10 | ACTIVE |
| `yard-hub-settings-api` | 3 | ACTIVE |
| `photo-evidence` | 1 | ACTIVE (session-gated branch build) |

The R&M API and YARD HUB Settings API were deployed from the current repository source to staging. Their production counterparts were not changed.

The following additive migrations were applied to staging from the repository migration files:

- `rm_machine_model_catalog` — creates per-category machine settings and make/model catalogue tables and seeds six machine categories.
- `rm_asset_selector_visibility` — adds the independent registered-machine selector visibility flag.
- `rm_registration_field_setting` — adds the optional registration-field visibility flag.
- `photo_attachment_privilege_hardening` — revokes all table privileges on `downtime_attachments` from `PUBLIC`, `anon` and `authenticated`, retaining CRUD access for `service_role`.
- `central_state_realtime_broadcast` — adds the authenticated private Broadcast read policy, metadata-only notification function and version-change trigger for the central bank.

Post-application SQL verification confirmed the two R&M settings tables and all three per-category flags. Six categories are present, with each flag enabled by default. The staging make/model catalogue currently contains zero entries; this is an empty staging catalogue, not evidence that production catalogue data should be overwritten.

The staging privilege audit now confirms that anonymous/authenticated roles have no SELECT or INSERT privileges on `downtime_attachments`, RLS is enabled, and `service_role` retains the required access. The Realtime policy, trigger and trigger function are now present in staging and match the intended migration contract. A real authenticated two-browser/device event-propagation test is still outstanding.

**Migration-ledger caveat:** the staging connector recorded applied migrations with generated apply-time versions (for example, `20261125002131` and `20261125003404`) rather than the repository filename versions. Staging schema is aligned for the identified changes, but this existing project is not yet a canonical `supabase db push` baseline. Do not run the full repository migration directory against this staging project until the version ledger has been reconciled or a fresh migration-clean staging clone has been created. The private Realtime migration is now idempotent (drops and recreates only its named policy/trigger, and replaces its trigger function) to permit safe schema revalidation.

Staging is a test environment, not a production data replica. Its machinery/fault rows differ from production counts. Do not copy staging operational records into production.

## 4. Authentication, authorisation and synchronisation

Current repository implementation uses:

- Username/PIN authentication through the Central Bank Edge Function.
- Salted PBKDF2-SHA256 PIN hashes; plaintext PINs are not returned to the browser.
- Opaque high-entropy session tokens, with token hashes stored server-side.
- Twelve-hour session expiry.
- Login failure throttling based on recent failed attempts.
- Server-side tier checks for protected operations.
- Compare-and-swap version checks for central state and configuration writes.
- Private Realtime notifications that carry state-version metadata only; clients re-read authorised state through the API.
- RLS and restricted browser privileges on protected tables.

These are source and contract-level facts. They do not substitute for a final live-like penetration test, multi-user concurrency test or device-to-device acceptance test.

**Photo-evidence security finding:** the currently deployed production `photo-evidence` v1 endpoint accepts upload, view and delete actions without validating a Central Bank session or tier permission. The current branch adds opaque-session validation, server-side permission checks and origin-restricted CORS, and updates the browser to send the session header. The corrected function is deployed to staging as `photo-evidence` v1. CI has exercised the staging endpoint and confirmed unauthenticated upload, view and delete requests are rejected with HTTP 401. The earlier 18/18 staging lifecycle/photo acceptance run is historical evidence for OWNER bootstrap/login, six-tier access, PIN/session lifecycle, throttling, concurrency protection, and private STAFF photo upload/retrieval with metadata preservation. It does not establish the newer photo-evidence endpoint's authenticated per-tier upload/view/delete matrix or the separate `canDeleteRecords` enforcement. The dedicated staging E2E runner functions are currently disabled (HTTP 410), and the staging bank has no active users/sessions. Do not repeat bootstrap verification; use the prior completed lifecycle evidence. Only the newer photo endpoint role matrix remains to be executed with an approved staging session. The live function has deliberately not been changed during this preparation work.

The older PR #47 proposal for a separate Auth/central-sync implementation is stale and diverges significantly from current main. Do not merge it or apply its old migration chain. Current repository Central Bank architecture is the source of truth for continued work.

## 5. Staging acceptance gates still required

The environment alignment completed during this session is a prerequisite, not final acceptance. Before a release can be marked ready:

- Run the complete repository smoke suite and browser tests against the current branch.
- Type-check every deployed Edge Function source using the repository's Deno workflow.
- Complete authenticated staging tests for YARD HUB, DOWNTIME, user/role administration, STAFF, station assignments, plant overview, reports and REPAIR & MAINTENANCE.
- Test at least two independent browser sessions/devices for state propagation and simultaneous-update conflicts.
- Verify session expiry, logout, disabled account, insufficient privilege and lockout behaviours.
- The corrected photo-evidence function is already deployed to staging and its CI type-check, privilege contract, and unauthenticated 401 checks have passed. Complete only the remaining authenticated per-tier endpoint matrix: OWNER/DEVACC, ADMIN, MANAGER, SUPERVISOR, USER and SPECTATOR, testing upload, view and delete against the effective `canEditTracker`, `canViewDashboards` and `canDeleteRecords` values. Reuse the previously verified bootstrap/lifecycle evidence; do not rerun it.
- Verify report/PDF generation, private archive access and evidence upload/read/delete permissions.
- Verify R&M asset creation/edit/archive, fault-to-asset relationships, per-category model/asset/registration settings and historical unassigned records.
- Test failure recovery: dropped network, API errors, stale version, interrupted upload, retry and safe refresh without silent loss of unsaved edits.
- Capture desktop and mobile browser QA evidence and inspect console/network failures.
- Verify staging backup and restore procedure, including database, storage buckets and Edge Function source/configuration.
- Confirm the staged DEV test identity lifecycle. The previous staging DEV account/session was deliberately removed after its earlier successful bootstrap/login/configuration lifecycle test; no active DEV test account remains after that cleanup. The Vault bootstrap secret must be handled only through the approved secure setup flow and must never be copied into source, logs or chat.

A passing static contract test must not be reported as proof of live runtime behaviour.

## 6. Production endpoint and configuration decision

The current published `central-bank-admin.html` is intentionally configured to point to the isolated staging Supabase project. The Pages workflow verifies that it contains the staging project URL and excludes the production project URL and production publishable key.

This is an intentional isolation guard, not a production-ready administrative endpoint. Before any live cutover, the owner must decide and approve one of these outcomes:

- Keep Master Configuration strictly in staging and exclude the admin page from the production release; or
- Provision a separate production-safe DEV control-plane endpoint and credentials, then verify production isolation and permissions with dedicated tests.

Do not simply replace the staging URL/key with production values. Verify endpoint authorisation, data boundaries, bootstrap controls, config history, RLS and rollback first.

The Central Bank source diff has been narrowed to one known feature block: production `central-bank` v13 lacks the seven repository lines that normalise Master Configuration navigation labels and the module registry in the configuration payload. Staging `central-bank` v7 matches the current repository source byte-for-byte. Production's R&M API v13 and YARD HUB Settings API v7 also match the repository source byte-for-byte. No production function update is included in this preparation branch.

## 7. Production release sequence — only after approval

1. Freeze the exact release commit and record its SHA.
2. Create and verify a fresh production recovery point: database backup/PITR restore point where available, schema/migration inventory, table row-count/consistency snapshot, storage object inventory and Edge Function source/configuration inventory.
3. Rehearse the exact additive migration sequence on a fresh staging restore or an equivalent production-shaped clone.
4. Run final smoke, security, multi-device and data integrity acceptance gates.
5. Review every production migration and API/function diff. Confirm no destructive SQL, no staging URL/key in production assets, and no service-role secret in client code.
6. Apply approved database migrations to production in the documented order, with immediate post-migration verification.
7. Deploy approved Edge Functions to production and verify their versions, hashes, authentication behaviour and API contracts.
8. Publish the approved Pages artifact only after the backend is healthy and the production endpoint configuration is confirmed.
9. Execute post-deploy smoke checks and a controlled operational acceptance checklist.
10. Monitor errors, audit logs and state-version conflicts. Keep the rollback window open until acceptance is complete.

No step above is authorised by this preparation runbook. Each production mutation requires explicit approval.

## 8. Rollback principles

- Preserve the previous Pages artifact/commit and exact Edge Function source/config for each production deployment.
- Prefer forward-fix for additive schema changes. Do not drop newly created tables/columns during a rushed rollback if live writes may have begun.
- If a frontend/API incompatibility occurs, restore the previous Pages asset and compatible Edge Function version as a matched pair.
- Restore database data only from a verified, timestamped backup/restore point after assessing writes made since that point.
- Verify storage bucket objects and access policies separately; a database restore does not prove storage recovery.
- Record the incident, affected version, chosen rollback boundary and post-restore validation.

## 9. Pre-existing open pull requests

The repository had several open pull requests during this preflight. They are not part of this release branch and were not modified:

| PR | Scope | Current relationship to main | Disposition |
|---|---|---|---|
| #47 | Earlier cross-device central-sync/Auth architecture | 156 commits ahead, 232 behind; not mergeable | Superseded by the current Central Bank architecture. Do not merge the old central-sync/username-auth functions or migration chain. |
| #54 | Portrait weekly PDF redesign | 1 commit ahead, 141 behind; not mergeable; draft | Rebase/review separately if the report redesign is still required. |
| #63 | Isolated UI Preview Lab | 1 commit ahead, 133 behind; mergeable; draft | Keep isolated and mock-only. It is not a production module or deployment candidate. |
| #40 | JAN-only USERS / spectator changes | 3 commits ahead, 238 behind; not mergeable | Requires product/permission reconciliation before any port or merge. |
| #14 | Overview exit/fullscreen controls | 3 commits ahead, 293 behind; not mergeable | Port selectively only if still required. |
| #11 | Pages live-preview verification | 1 commit ahead, 295 behind; not mergeable | Superseded by current Pages workflow checks; do not merge as-is. |

Do not merge these PRs as a batch. Any still-required feature must be reviewed against the current `main`, ported to a fresh branch and tested independently.

## 10. Current release disposition

**NOT READY FOR LIVE CUTOVER.**

Latest verified PR checks:

- DOWNTIME CI run `45519354195`: full smoke suite, all four Edge Function type-checks, staging photo unauthenticated-action test and photo metadata privilege contract passed.
- Pages workflow run `45519354366`: browser smoke and artifact build passed; the deploy job was skipped for the pull request.

Staging has the current R&M and YARD HUB API sources, the corrected photo-evidence v1 function, R&M settings migrations, photo metadata privilege hardening, and the private central-state Realtime policy/trigger. The staging Central Bank is at version 34 with zero users after cleanup. The earlier 18/18 lifecycle/photo suite is retained as historical evidence for the scope recorded in section 4; it is not proof of the newer photo-evidence role matrix. The staging E2E runner functions are disabled (HTTP 410), so a fresh authenticated test requires a newly provisioned, approved staging session. The Realtime trigger was exercised by a guarded staging-only version increment; end-to-end event receipt by two real clients has not yet been verified.

The production/source diff inventory is complete: Central Bank production v13 requires the Master Configuration navigation/module normalisation block from current repository source; production R&M v13 and YARD HUB Settings API v7 match repository source; production photo-evidence v1 still lacks the new DOWNTIME session and tier checks. These function updates are release-time work and have not been applied.

Remaining blockers are authenticated photo-evidence acceptance, actual two-device Realtime propagation and conflict testing, complete workflow acceptance on staging, a verified database/storage/function backup and restore rehearsal, and the production Master Configuration endpoint decision.

Production Pages, production database and production Edge Functions were not modified during this preparation work.
