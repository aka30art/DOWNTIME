# DOWNTIME — Simple Central Data Core

## Current implementation model
Use the existing Supabase project only. The central application has three independently managed domains:

- **Tracker / shared settings:** `downtime_shared_state` row `id=1`, including weeks, reports, statistics, areas, reasons and presets.
- **USERS:** `downtime_app_users` central account records, managed by the `central-users` function. Usernames, display names, tier and enabled state are central. PINs are never stored in plaintext; server-side PBKDF2 hashes are used. Sessions are server validated.
- **STAFF:** independent `staffRoster` collection in the shared tracker payload, with staff profile data (photo thumbnail/reference, station, on-site status) in `operatorProfiles`. STAFF membership does not create or remove a USERS account.

JAN remains the protected **OWNER / ROOT ADMIN**. The central OWNER record cannot be renamed, demoted, disabled, PIN-reset, or deleted through ordinary central USERS management. OWNER rights require a validated central session; the legacy local PIN path is no longer an OWNER/admin path.

## Device behavior
- All central-account devices read and write the same shared tracker payload.
- Central writes use versioned compare-and-swap to prevent silent whole-payload overwrites.
- The app polls for remote updates; central shared data is refreshed when a newer version is found.
- STAFF add/remove and profile edits write to the shared payload, not to a local roster.
- Local browser storage is cache and migration backup only, never the permanent authority for USERS, STAFF, settings, or tracker records.
- On a CAS conflict, the local attempted payload is saved as a conflict draft on that device, the remote payload is loaded, and an export control is provided so the draft can be recovered before further edits.

## Migration behavior
- Legacy login roster migration leaves JAN as the only local/offline fallback choice.
- Legacy local privilege overrides are cleared during migration.
- Legacy STAFF roster is migrated into the shared `staffRoster` payload when that field is missing.
- Existing staff profiles remain in the shared payload.

## Simplicity constraints
- No additional Supabase project.
- Reuse existing username-auth, central USERS and central-sync functions already present in PR #47.
- No email accounts, invitations, or recovery workflows.
- No new layers unless required by the existing backend.

## Validation status
- Browser smoke coverage is being updated to exercise central OWNER login, central USER read-only permissions, central USERS creation, STAFF independence, and a mocked two-browser shared-payload sync.
- The mocked two-browser test is **not** proof of real Supabase cross-device acceptance. Real-device / real-backend verification, refresh persistence, concurrent edits, and final CI green status remain required before merge.

## Release
Build and validate in PR preview only. No production schema mutation, merge, or deployment until real cross-device acceptance passes.
