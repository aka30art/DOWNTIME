# DOWNTIME Central Bank API

Function: `central-bank` in `supabase/functions/central-bank/index.ts`.

The function is designed to be deployed with `verify_jwt=false` because it validates its own opaque session header for protected actions. The database bank, session and audit tables remain service-role-only.

## Actions
- `bootstrap`: one-time OWNER creation guarded by the encrypted `downtime_bootstrap_code` Supabase Vault secret, retrieved by a service-role-only SQL function. It refuses to run once an enabled account exists and uses central row version CAS.
- `list-users`: returns enabled login choices only (username, display name and tier); it never returns PIN hash or salt fields.
- `login`: validates username and PIN using PBKDF2-HMAC-SHA256 (150,000 iterations, per-user random salt); creates a random 256-bit opaque session token, stores only its SHA-256 hash, and expires the session after 12 hours. Failed attempts are recorded and throttled after five attempts for a username in five minutes.
- `get-state`: returns the payload according to the caller's tier. It strips PIN secrets and filters user lists, STAFF data, assignments, dashboards and reports according to server-side privileges.
- `central-admin-state`: returns the full Central Data Bank administration workspace only to tier `ADMIN` and the immutable `JAN` / `OWNER` root account. Every other authenticated identity receives HTTP 403. The legacy whole-bank action remains restricted to ADMIN/JAN. The redesigned Central Data Bank Admin uses dedicated `central-config-*` actions against a separate configuration control plane; normal tracker clients continue using the tier-filtered `get-state` action.
- `save-state`: accepts tracker app data only from `canEditTracker` accounts. It uses version compare-and-swap and preserves settings, STAFF and archive fields outside the caller's privilege.
- `users`, `user-save`, `user-delete`: tier-gated USER administration. Only OWNER may grant or modify OWNER accounts. USER changes and deletions revoke target sessions.
- `staff-save`: STAFF profile and roster updates for `canManageStaff` accounts.
- `staff-photo-url`, `staff-photo-read`: signed upload and read URLs for the private `downtime-staff-photos` bucket.
- `set-plant-status`: permission-checked central plant status update using version compare-and-swap.
- `tiers-save`: ADMIN-tier and JAN-root-only editable tier privilege matrix. ADMIN/JAN are the only identities allowed to grant or change another user's or tier's privileges.
- `logout`: revokes the caller's opaque session.

## Browser integration
The main tracker loads the central browser adapter in `central-bank-client.js`. It uses the central login, central state, CAS save, manual refresh and five-second polling actions. Plant Overview uses the session inherited from the opener tab and the same central API for state and plant-status updates.

PDF reports and evidence continue to use their existing report tables and storage buckets. This is deliberate archive preservation; they are not rewritten by the central-bank migration.

## Environment and production release gate
Store `downtime_bootstrap_code` encrypted in Supabase Vault before bootstrap; only the service role can retrieve it through the restricted SQL function. Never commit the code to source. Keep the central-bank tables and audit/session tables inaccessible to browser roles. The allowed browser origin is currently `https://aka30art.github.io`.

The migrations and function are not deployed to production by this PR. Before production activation, deploy to a non-production Supabase project and validate bootstrap, real API authorization for every tier, failed-login throttling, session revocation, photo upload/read, CAS conflicts, cross-device polling, preservation of report/evidence archives, and rollback/recovery. Do not merge, run production migrations or deploy before the full acceptance gate has passed.

## Central configuration control plane

The Central Data Bank Admin interface is a configuration management workspace, not an account or permission editor. Access & Rights remains the separate permission editor. The control plane stores four classes of master data:

- Organisation identity and locale/time-zone defaults.
- Site, plant, area and station registries.
- Controlled operational libraries such as area presets, downtime reasons, daily task templates, equipment categories, event categories and statuses.
- Global defaults including the operating week, operating days, shift schedules, shift presets and break allowance.

The additive migration `20261122060000_central_configuration_control_plane.sql` creates `downtime_central_config_state` and `downtime_central_config_history`. Both tables have RLS enabled, browser-role grants revoked, and service-role access only. Initial version 1 is copied from relevant existing preset/schedule values as an isolated snapshot.

The configuration API uses the same opaque central session and enforces the ADMIN tier or the immutable JAN/OWNER identity on every `central-config-*` action. It provides:
- `central-config-state`: read draft, published snapshot, versions and history.
- `central-config-save-draft`: validate and save a new draft snapshot using expected draft/next-version checks.
- `central-config-publish`: explicitly move the published version pointer to the validated draft.
- `central-config-restore-draft`: restore a selected history snapshot as a new draft. Publishing remains a separate action.

**Publication is currently isolated to the configuration registry.** The tracker does not yet consume these published values. The new page and API do not write configuration changes into `downtime_central_bank.appData`, operational records, user accounts, STAFF records, report archives or evidence storage. A later integration from the published registry into live tracker defaults must be separately designed, tested and released. Do not connect the published payload to normal tracker state as a side effect of this work.
