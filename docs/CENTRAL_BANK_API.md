# DOWNTIME Central Bank API

Function: `central-bank` in `supabase/functions/central-bank/index.ts`.

The function is designed to be deployed with `verify_jwt=false` because it validates its own opaque session header for protected actions. The database bank, session and audit tables remain service-role-only.

## Actions
- `bootstrap`: one-time OWNER creation guarded by the encrypted `downtime_bootstrap_code` Supabase Vault secret, retrieved by a service-role-only SQL function. It refuses to run once an enabled account exists and uses central row version CAS. It refuses to run once an enabled account exists and uses central row version CAS.
- `list-users`: returns enabled login choices only (username, display name and tier); it never returns PIN hash or salt fields.
- `login`: validates username and PIN using PBKDF2-HMAC-SHA256 (150,000 iterations, per-user random salt); creates a random 256-bit opaque session token, stores only its SHA-256 hash, and expires the session after 12 hours. Failed attempts are recorded and throttled after five attempts for a username in five minutes.
- `get-state`: returns the payload according to the caller's tier. It strips PIN secrets and filters user lists, STAFF data, assignments, dashboards and reports according to server-side privileges.
- `save-state`: accepts tracker app data only from `canEditTracker` accounts. It uses version compare-and-swap and preserves settings, STAFF and archive fields outside the caller's privilege.
- `users`, `user-save`, `user-delete`: tier-gated USER administration. Only OWNER may grant or modify OWNER accounts. USER changes and deletions revoke target sessions.
- `staff-save`: STAFF profile and roster updates for `canManageStaff` accounts.
- `staff-photo-url`, `staff-photo-read`: signed upload and read URLs for the private `downtime-staff-photos` bucket.
- `set-plant-status`: permission-checked central plant status update using version compare-and-swap.
- `tiers-save`: OWNER-only editable tier privilege matrix.
- `logout`: revokes the caller's opaque session.

## Browser integration
The main tracker loads the central browser adapter in `central-bank-client.js`. It uses the central login, central state, CAS save, manual refresh and five-second polling actions. Plant Overview uses the session inherited from the opener tab and the same central API for state and plant-status updates.

PDF reports and evidence continue to use their existing report tables and storage buckets. This is deliberate archive preservation; they are not rewritten by the central-bank migration.

## Environment and production release gate
Set `DOWNTIME_BOOTSTRAP_CODE` as a Supabase secret before any deployment; never commit it to source. Keep the central-bank tables and audit/session tables inaccessible to browser roles. The allowed browser origin is currently `https://aka30art.github.io`.

The migrations and function are not deployed to production by this PR. Before production activation, deploy to a non-production Supabase project and validate bootstrap, real API authorization for every tier, failed-login throttling, session revocation, photo upload/read, CAS conflicts, cross-device polling, preservation of report/evidence archives, and rollback/recovery. Do not merge, run production migrations or deploy before the full acceptance gate has passed.
