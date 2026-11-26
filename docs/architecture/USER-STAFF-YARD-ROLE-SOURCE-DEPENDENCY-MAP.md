# USER / STAFF / ROOTS / YARD ROLE — Source Dependency Map

Status: Phase 1 technical inventory; source inspection only
Reviewed: 2026-11-26
Target architecture: `docs/architecture/USER-STAFF-YARD-ROLE-RESTRUCTURE.md`
Production impact: None. No application code, database data, migrations, configuration or deployment changed.

## 1. Scope and confidence

This inventory records concrete source dependencies confirmed by inspection of the current `main` branch. It is a dependency map, not a claim that every repository consumer has been exhaustively enumerated. The GitHub repository search did not return reliable indexed code matches, so the files below were fetched and inspected directly. A complete repository-wide consumer census remains an exit requirement before implementation.

## 2. Confirmed identity and session authority

### Central Bank Edge Function
File: `supabase/functions/central-bank/index.ts`
Inspected source baseline: `868f6deb2d08048d24de7be3ecf9bbf0c41541b8`

Confirmed responsibilities and dependencies:
- Defines legacy tier catalogue and default tier permission profiles near the top of the file.
- Normalizes `bank.tiers` and enforces locked privileges.
- Stores USER records in `bank.users[]`; current record fields include username, displayName, tier, enabled, PIN salt and PIN hash.
- `safeUser()` returns username, tier, enabled and displayName.
- Login creates rows in `downtime_central_sessions` with token hash, username, tier and expiry.
- Authenticated requests resolve the current USER by session username, then derive privileges from the current USER tier and `bank.tiers[tier]`.
- Root handling is currently special-cased using DEV + OWNER, DEVACC tier and ADMIN tier. These are legacy implementation semantics and must not be mistaken for the new ROOTS classification.
- `get-state` filters USER visibility using current permission booleans and returns a bank-derived state payload.
- `user-save` creates/updates USER records and revokes sessions for the affected username.
- `user-delete` removes a USER and its sessions; it does not implement the new USER/STAFF linked lifecycle.
- `staff-save`, `save-settings` and other state-save paths write STAFF-related data separately.
- Daily operator assignment/unlock routes contain explicit legacy tier allowlists.
- Tracker save/delete/archive routes enforce legacy permission booleans.

Implications:
- The current session schema and authorization resolver are tier-coupled.
- The new root authority cannot be safely added as a client-provided tier or inferred from legacy tier strings.
- All authenticated actions need a common server-side authorization resolver before legacy tier-derived checks can be retired.
- USER/STAFF creation must replace the current independent `user-save` and STAFF write sequence with the approved staged provisioning workflow. Existing endpoints need explicit compatibility decisions; they must not remain an alternate bypass.
- Session compatibility, token revocation and current-user reload semantics must be preserved or deliberately versioned.

## 3. Confirmed browser API adapter

File: `central-bank-client.js`
Inspected source baseline: `69fe6d718100b37e36a1811a3c6d3dc223765091`

Confirmed API methods include:
- `saveUser()` → `user-save`
- `deleteUser()` → `user-delete`
- `saveStaff()` → `staff-save`
- `saveTiers()` → `tiers-save`
- Shared login/logout/session handling uses the Central Bank session token stored in browser session storage.

Implications:
- The adapter is a compatibility boundary for UI modules.
- New provisioning, root assignment and unified role APIs should be introduced here with explicit response/version handling.
- Cached or older clients must not be able to invoke legacy endpoints to bypass the new server-side model.

## 4. Confirmed STAFF persistence and compatibility copies

Primary file: `supabase/functions/central-bank/index.ts`

Confirmed structures:
- `bank.staff.roster[]`
- `bank.staff.profiles{}`, currently keyed by STAFF display name
- `bank.appData.staffRoster`
- `bank.appData.operatorProfiles`

Confirmed write paths include:
- `save-state` / operational state paths that reconcile profile data.
- `save-settings` validation and persistence for incoming roster/profile data.
- `staff-save` for separate STAFF create/update.
- Staff profile/roster compatibility synchronization between `bank.staff` and `bank.appData`.

Operational STAFF fields validated or handled include department, on-site state, on-site operational role, station and station-lock, plus photo-related profile fields.

Implications:
- Stable USER/STAFF IDs require an additive compatibility period or a coordinated conversion of every name-keyed consumer.
- The same STAFF information is represented in more than one payload location. The canonical write/read direction and compatibility retirement rules must be explicit.
- A clean reset must remove live identity-owned profile/roster copies only after exact ownership and dependencies are established.
- Historical operator assignments and audit attribution must not be rewritten to new identities.

## 5. Confirmed YARDHUB tier and access-rights implementation

Files:
- `yard-hub-settings.js` — baseline `600edb513f28a7d716c90579c4beda6cf58a2fb5`
- `supabase/functions/yard-hub-settings-api/index.ts` — baseline `d0a6415efb9a5e7d7124970b260379348ef44748`
- Existing persistence migration: `supabase/migrations/20261123212500_yard_hub_access_control.sql`

Confirmed behaviour:
- YARDHUB has a separate tier catalogue, custom tiers, retired tiers, per-tier section permission profiles and username-keyed `userTiers`.
- The browser UI separately displays Central DOWNTIME legacy tier and YARDHUB tier.
- USER save currently calls the Central Bank user-save flow and then separately calls YARDHUB `save-user-tier`.
- The UI explicitly warns that Central USER and YARDHUB tier writes are separate; failure can leave the first save committed without the second.
- YARDHUB API authenticates by looking up the Central Bank session token hash, then reads the current Central USER record.
- YARDHUB API derives settings/admin rights from both legacy Central tier and YARDHUB tier.
- YARDHUB permission configuration is persisted in `public.yard_hub_tier_config` through `yard_hub_save_tier_settings`, with a separate version.
- Existing section permissions include floor, check sheets, repair maintenance and machinery-related permissions. The current UI uses separate mode controls; these are not the new unified department matrix.
- YARDHUB API has its own protected tier and assignment logic.

Implications:
- The new USER provisioning workflow must explicitly coordinate the Central Bank and YARDHUB stores. It must not be described as a single database transaction.
- One canonical YARD ROLE schema and assignment model must supersede both legacy permission planes after migration.
- Existing YARDHUB tier configuration and RPC cannot be retired until every consumer has migrated and rollback/cutover conditions are met.
- Current tier labels, including ADMIN and DEVACC, are not evidence of future ROOTS classification.

## 6. Confirmed STAFF and YARDHUB UI integration points

Files inspected:
- `yard-hub-settings.js`
- `index.html`

Confirmed:
- YARDHUB settings currently exposes separate USERS and TIERS views.
- STAFF management is exposed through separate application UI flows and server actions.
- Current UI uses legacy tier-derived checks to expose Staff Management and YARDHUB settings.
- Current UI displays separate Central and YARDHUB tier labels and uses separate save paths.

Implications:
- The future YARDHUB administration destination must combine USER management, STAFF directory/management and Access and Rights without collapsing operational STAFF job roles into application YARD ROLE permissions.
- Existing DOWNTIME Settings cards must remain until their YARDHUB replacements pass UI, API and permission tests.
- UI checks are presentation only; the API must enforce all authorization.

## 7. Confirmed test and CI contracts

Files:
- `tests/central-bank-tracker-contract.mjs`
- `tests/yard-hub-settings-contract.mjs`
- `tests/yard-hub-contract.mjs`
- `package.json`
- `.github/workflows/ci.yml`

Confirmed test expectations include:
- Legacy tier names and root-like special cases.
- Current USER/STAFF API action names.
- Separate YARDHUB tier configuration and Central Bank session validation.
- Separate YARDHUB permission persistence and R&M permission resolution.
- Explicit protection of the DOWNTIME bank/session/operational data from YARDHUB-only permission writes.
- Existing Staff Management auto-access rules based on legacy tiers.
- Test scripts include `npm run test:central-bank` and `npm run test:smoke`; CI performs Edge Function type checks.

Implications:
- Tests must be intentionally migrated to the new contract, not deleted or weakened.
- New negative tests must prove that old API paths, forged client fields and stale clients cannot restore legacy privileges.
- Existing module/data isolation assertions must remain and be expanded where necessary.

## 8. Initial dependency register

| Domain | Current authority / store | Confirmed consumers or writers | Required target treatment |
|---|---|---|---|
| USER credentials and account | Central Bank `users[]` | Central Bank login, user-save, user-delete, safeUser, browser adapter | Keep DEV; replace all other identities at approved reset; introduce immutable IDs and staged provisioning |
| Sessions | `downtime_central_sessions` | Central Bank login/auth/logout; YARDHUB API session validation | Preserve secure token validation; define ID-based identity binding and revocation |
| Legacy DOWNTIME rights | Central Bank `tiers{}` | Central Bank authorization, tracker and daily operator actions, UI permission checks | Migrate every consumer to unified server-side YARD ROLE or ROOTS resolver |
| STAFF | Central Bank `staff.roster`, `staff.profiles` | staff-save, save-settings, save-state, tracker/operator workflows and UI | Stable IDs, exactly one linked STAFF per new USER; preserve operational-only semantics only where explicitly approved |
| STAFF compatibility | `appData.staffRoster`, `appData.operatorProfiles` | Central Bank normalization/save paths and application consumers | Identify all readers; maintain compatibility until safe retirement |
| YARDHUB rights | `yard_hub_tier_config` | YARDHUB settings API/UI and R&M API | Migrate to one canonical role store; legacy store compatibility only during transition |
| Administration UI | YARDHUB settings and DOWNTIME Settings | index.html and yard-hub-settings.js | Consolidate in YARDHUB; remove old cards only after replacement verified |
| Audit/history | Central Bank and YARDHUB audit tables | account, staff and permission actions | Preserve history; record new stable actor/target IDs for future actions |

## 9. Outstanding source census — must complete before Phase 1 exit

The following work is not yet verified exhaustively:
1. Repository-wide enumeration of every reference to `bank.users`, `user.tier`, `session.tier`, `bank.tiers`, `userTiers`, `yard_hub_tier_config`, `staffRoster`, `operatorProfiles`, `staff.roster` and `staff.profiles`.
2. Full list of Edge Functions and browser modules that read/write those fields, including Repair & Maintenance, exports, analytics, station assignment, attendance/operator tooling and administrative actions.
3. Every authorization boolean and action-level check, mapped to the new four-level department contract.
4. All database functions, migrations, views, policies and scheduled tasks that depend on either legacy permission store.
5. Every session consumer and whether any client caches role/tier claims beyond the current request.
6. All STAFF photo/object references and all identity-linked data dependencies required for the reset manifest.
7. Exact API compatibility/version strategy and the point at which legacy routes become reject-only.

No implementation should begin until this census is complete, the canonical schema/API contract is documented, and the Phase 1 exit review is accepted.


## 10. Expanded repository tree inventory and additional confirmed consumers

Reviewed feature-branch tree: `0ba5368295bc20a2bd74e48e5a7d06693071d045`. The recursive Git tree contains 163 tracked files. The inventory below identifies additional files that must be included in the source census; tree presence alone does not imply a runtime dependency.

### Additional server-side authorization surfaces

- `supabase/functions/central-config-admin/index.ts`: independently resolves the current Central USER and gates the configuration control plane using DEV + OWNER and DEVACC legacy semantics. This is a separate server-side root check and must be reconciled with the new ROOTS authority without broadening the control plane accidentally.
- `supabase/functions/repair-maintenance-api/index.ts`: separate R&M API and authorization surface. Its permission resolution and all write/delete/export actions must be mapped to the unified department model. The YARDHUB API currently also carries R&M section permission fields, so the migration must establish one authoritative resolution path.
- `supabase/functions/gatelog-api/index.ts`: separate operational API. Its authorization and actor attribution need explicit review to confirm whether it consumes Central USER/tier state or a separate gate-log assignment model.
- `supabase/functions/photo-evidence/index.ts`: photo evidence API and storage access boundary. Confirm whether STAFF identity, uploader identity or session claims are used for authorization and metadata attribution.
- `supabase/functions/spectator-read/index.ts`: separate read-only state route. Confirm its session/role assumptions and preserve the spectator security boundary during role migration.

### Additional browser/runtime consumers

- `index.html`: primary application shell and broad runtime. Confirmed legacy tier permission defaults, locked role profiles, permission resolver, Central Bank access checks, Access and Rights rendering, settings-section access, daily operator management and STAFF profile/roster compatibility reads. This file contains a large concentration of client-side presentation checks; each corresponding server action remains the security authority.
- `central-bank-admin.html`: Central Bank administration UI. It currently describes the separate Central and YARDHUB tier authorities and exposes legacy OWNER/DEVACC language. This control-plane UI must be reconciled with the target architecture, while preserving its distinct configuration-registry purpose and DEV-only security boundary.
- `yard-hub-settings.js`: YARDHUB USERS, TIERS, per-user tier assignment and permission editor.
- `yard-hub-structure.js`: YARDHUB structure/menu client; review for role-based menu visibility or cached access assumptions.
- `repair-maintenance-app.js`: R&M browser module; review every capability check and action for a second permission source.
- `central-bank-client.js`: shared session and Central Bank API adapter.
- `assets/staff/staff-image-library.js`, `assets/staff/staff-images.json`, `assets/staff/README.md` and `assets/staff/originals/**/README.md`: static STAFF image library and source documentation. These are distinct from private bucket objects and must be classified separately in the reset/media manifest.

### Additional database and automation inventory

The recursive tree contains migrations for:
- Central Bank storage/auth/audit and configuration control plane.
- YARDHUB access control.
- Daily operator register.
- R&M module, machinery registry, presets, catalogue and PDF archive.
- GateLog customer/site entry, arrival/statistics, daily gateman assignment, atomic actions, visit management, report archive and waste-type activation.
- Spectator read-only state and secure Edge Function access.

Relevant current files include `supabase/schema.sql`, `supabase/config.toml`, `supabase/migrations/20261123212500_yard_hub_access_control.sql`, `supabase/migrations/20261125010000_daily_operator_register.sql` and `supabase/migrations/20261126114151_central_bank_atomic_state_audit.sql`. Each SQL function, policy, grant and trigger still requires a direct dependency check; the tree inventory is not proof of their absence or independence.

Scheduled automation present in the repository includes `.github/workflows/photo-evidence-cleanup.yml`. Review its service credentials, storage bucket scope and deletion criteria before defining the STAFF reset media procedure. Do not repurpose or broaden this cleanup workflow as part of the identity reset without separate approval.

### Expanded regression-test register

In addition to the initial contracts, the tree includes these tests that must be reviewed and retained or deliberately migrated:
- `tests/access-rights-live-contract.mjs`
- `tests/admin-access-rights-delegation.mjs`
- `tests/central-bank-admin-contract.mjs`
- `tests/central-bank-api-contract.mjs`
- `tests/central-bank-client-contract.mjs`
- `tests/central-bank-menu-access-contract.mjs`
- `tests/central-config-admin-api-contract.mjs`
- `tests/central-config-admin-ui.mjs`
- `tests/daily-operator-register-contract.mjs`
- `tests/devacc-security-contract.mjs`
- `tests/root-account-split-contract.mjs`
- `tests/roster-regression.mjs`
- `tests/staff-modal-upgrade-contract.mjs`
- `tests/staff-originals-upload-contract.mjs`
- `tests/station-manager-contract.mjs`
- `tests/yard-hub-settings-contract.mjs`
- `tests/yard-hub-contract.mjs`
- `tests/repair-maintenance-contract.mjs`
- `tests/photo-evidence.mjs`

These test filenames identify likely contracts, not their complete assertions. Their source must be read before finalizing the test migration matrix.

## 11. Census status after expanded tree review

The recursive feature-branch tree has now been enumerated (163 tracked files), and the additional server, browser, database, automation and regression-test surfaces above have been added to the review register.

**The repository-wide source census is still open.** A complete line-level scan of every candidate source file and a full SQL/RPC/policy/trigger review have not yet been completed. The GitHub code-search index returned no usable results for the attempted identifier queries, and the connector imposed a tool-call limit during the attempted bulk file scan. No absence claim is therefore made for files not directly inspected.

Phase 1 remains incomplete. Next source-review pass must:
1. Inspect the additional Edge Functions and browser modules listed above, including all authorization and actor attribution branches.
2. Read every relevant test listed above and map each assertion to the new role model or a preserved non-role boundary.
3. Enumerate all SQL function definitions, RLS policies, grants, triggers and scheduled workflows in the migrations.
4. Build a permission-consumer matrix: action/API route → current permission source → target department → required OFF/Read Only/Input/Manage behaviour → ROOTS override/isolation → negative tests.
5. Build the identity-reset dependency manifest: USER IDs, STAFF IDs, sessions, profile/roster copies, photo objects, actor references, audit/history and shared operational records.

No application implementation, data reset, migration, merge or deployment is authorized by this documentation update.
