# DOWNTIME — Cross-device sync remediation audit (2026-11-20)

## Goal
Move every shared application data domain to one authenticated, central source of truth. Device-local storage may only be a cache/offline queue—not the authoritative record.

## Audited main
- `index.html` at main blob `c6d72969222d17ed3f593f68fb3bd833254d9d64` (114 KB).
- Supabase project `DOWNTIME` (`ygwfipksbbprqynvbklk`) is active/healthy, region eu-west-1.
- Existing central table: `public.downtime_shared_state` (single row, JSON payload). Realtime publication currently includes only this table.
- Existing central tables: `downtime_reports`, `downtime_attachments`.
- App initializes Supabase using public anon key and currently does not establish a Supabase Auth session in the inspected main source.
- Tracker state persists in browser `localStorage`, then is pushed to the shared JSON state. Existing cloud writes are whole-payload writes; no version/CAS conflict protection was identified in inspected source.
- STAFF roster `plantDowntime.staffRoster.v1`, USER roster `plantDowntime.operatorRoster.v1`, privileges `plantDowntime.operatorPrivileges.v1`, and PIN overrides `plantDowntime.operatorPins.v1` are stored in browser localStorage. They do not sync.
- Settings/configuration (areas, reasons, presets) are part of tracker state or local-only keys; they must be audited individually during implementation.
- Operator profiles/photos are not yet verified as a unified central data model. Existing photo-evidence service is a separate function/storage flow.
- `downtime_shared_state` RLS policies currently permit any Supabase authenticated user to read, insert and update the shared state. PDF archive policies also permit authenticated-user access. There is no current authenticated application account/session flow in inspected client code, so authorization must be fixed before exposing data through new tables.
- Supabase Auth user provisioning and app_metadata tier provisioning are not currently wired into the app.

## Open PR conflict
PR #40 `Restrict USERS to JAN and remove Spectator mode` is open and would remove USER-management UI, remove legacy USERS data, and clear local PIN/privilege data. This conflicts with the requirement for central USERS management and six-tier privileges. It must be reconciled rather than merged blindly.
Other open PRs: #14 Plant Overview exit/fullscreen; #11 post-deploy preview URL verification; #5 Lee roster change. These need rebase/compatibility review during integration.

## Current data domains to centralize
1. USERS: auth identity, enabled state, display name, tier, assigned scope; no client-readable PIN/plaintext credential storage.
2. STAFF: canonical roster, station assignment, photo reference, active state, sort order.
3. Operator/profile data: separate staff/operator mapping and profile metadata; no mixing STAFF and USERS.
4. Privileges: server-side enforced role/tier claims and database policies; UI visibility is not authorization.
5. Settings: areas, reasons, presets, plant configuration and settings versions.
6. Downtime: normalized records preferred over opaque full-payload replacement; preserve weekly tracker semantics during migration.
7. Plant Overview: shared plant status, assignments, roster, and realtime updates.
8. Media: central storage with authenticated access; photo evidence retention and expiry rules preserved.
9. Reports/archive: central archive metadata and storage with role-aware access.

## Proposed phased implementation (safe rollout)
- Phase 0: Audit, baseline inventory, migration design, PR checks. This PR starts Phase 0/1.
- Phase 1: Additive central schema, optimistic concurrency/versioning, RLS, audit trail, realtime publication, schema tests. No live data migration yet.
- Phase 2: Supabase Auth, secure Jan-owner bootstrap (requires owner identity and credential set outside source control), tier-aware server authorization, revocation/session controls.
- Phase 3: App data adapters and realtime subscriptions for USERS, STAFF, settings, tracker state, plant overview, photos and archive. Conflict-safe mutation APIs and explicit offline queue/status.
- Phase 4: One-time import of device-local data with preview, conflict resolution, and verified backup. Laptop is not automatically assumed to be authoritative; user must choose/confirm source when data differs.
- Phase 5: Cross-device acceptance tests, RLS tests, migration rollback/backup procedure, CI, merge, deploy, and post-deploy verification.

## Critical migration safeguards
- Never overwrite existing local data silently. Capture/export backup first.
- Do not merge conflicting local rosters or settings by arbitrary last-write-wins.
- Never put service-role keys in the browser, Git, logs, or test artifacts.
- Do not enable permissive anon policies.
- No live schema rollout or UI cutover until authenticated access is established and tested.
- Existing tracker behavior, tier semantics, and Jan owner protections must be preserved.

## Remediation progress update — 2026-11-20 18:03 UTC
- Contract test assertions corrected in commit `67d0b4f8ed4541fe20f3df6b0aa8b3023755b66d`.
- Verified PR CI run `44789085882` (run #127): completed successfully; smoke job passed, including `test:sync-contract` in the smoke script chain.
- Verified tracker workflow run `44789085869` (run #377): browser smoke tests passed; deploy/build stages were skipped for this PR branch (no deployment occurred).
- Supabase live schema inventory rechecked: only existing `downtime_shared_state`, `downtime_reports`, and `downtime_attachments` tables are present. Proposed central users/staff/config/audit tables and tracker version column are NOT live.
- Live migration list contains no PR #47 proposed migration. No live schema mutation was performed.
- Existing live Edge Functions are `photo-evidence` and `spectator-read`; no central-sync Auth/provisioning function is present.
- Authentication implementation is blocked on a product/security decision: keep PIN-style operator login or move to strong email/password (or another strong credential) for Supabase Auth. Short PINs alone are not suitable as standalone internet-facing authentication without an explicitly designed server-side risk-control scheme. Do not create/bootstrap Jan credentials until the owner's identity and credential provisioning method are supplied securely.
- Remaining work is still Phase 2 Auth/bootstrap, followed by shared-data adapters, realtime/conflict/offline support, migration/backup, and multi-device acceptance testing. CI passing here validates the audit/schema contract—not cross-device functionality.

## Authentication direction — username-only, no email (2026-11-20)

- Owner explicitly rejected email-based account workflows. No email fields, email invitations, email login, email-based recovery, or email requirements are part of DOWNTIME.
- Required login identity is a unique username. Credentials are provisioned and managed without email addresses. The application must never expose or store plaintext passwords.
- The staged Supabase Auth invitation and Auth-backed central USERS endpoints are obsolete and must not be deployed or used. Supabase Auth's standard email/phone identity model is not the requested username-only model.
- Authentication requires a custom server-side design: password hashing with a strong password KDF, rate-limited login, opaque high-entropy session tokens with only token hashes stored server-side, expiry/rotation/revocation, disabled-account checks, protected OWNER bootstrap, and audit records. Tier/privilege decisions are server authoritative, never client-supplied.
- Because GitHub Pages and Supabase Edge Functions are different origins, browser session transport and storage must be explicitly security-tested. Do not use localStorage as an authentication-token store or silently adopt pseudo-email accounts. Validate cookie/CORS behavior and session protections before selecting the final session transport.
- Direct client access to protected Supabase tables must remain blocked until the custom session can be securely validated and authorization enforced. Shared data mutations should go through server endpoints that validate the custom session and tier before service-role operations, or a separately validated secure RLS/JWT integration.
- This is an architecture pivot, not a finished login system. No credentials/bootstrap secrets are created, no endpoint is deployed, and no production migration is applied.

## Remaining phases
- Phase 0: Audit and source baseline.
- Phase 1: Additive central schema, versioned writes, audit, realtime, and policy contract tests.
- Phase 2: Username-only custom authentication, session lifecycle, protected OWNER bootstrap, and server-side authorization.
- Phase 3: App adapters and realtime sync for USERS, STAFF, settings, tracker, plant overview, photos, and archive; conflict-safe writes and offline queue.
- Phase 4: Preview/export, backup, and explicit conflict-resolved migration from local data.
- Phase 5: Cross-device acceptance tests, RLS/API security tests, rollback plan, CI, then separately authorized merge/deploy.

## Critical migration safeguards
- Never overwrite local data silently; capture/export backup first.
- No arbitrary last-write-wins for roster/settings conflicts.
- Never place service-role keys in browser code, Git, logs, or tests.
- No permissive anonymous access.
- No production schema rollout or UI cutover until username-only authentication and authorization are tested.
- Preserve tracker behavior, tier semantics, STAFF/USERS separation, and Jan OWNER/ROOT protection.
