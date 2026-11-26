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
