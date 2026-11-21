# DOWNTIME — Simple Central Database

## Central data model
The redesigned tracker uses one singleton row in `downtime_central_bank` (`id=1`) for its shared operational state:
- `appData`: weekly tracker records, settings/presets, plant status, report references and other operational state
- `users`: usernames, display names, enabled state, tier and salted PIN hashes
- `tiers`: editable privilege matrix
- `staff`: separate STAFF roster, profiles and private photo paths/thumbnails
- `statsSource`: the source records used for operational statistics

PDF reports and photo evidence continue to use the existing report/evidence tables and storage buckets. They are intentionally retained as separate archive infrastructure so the central-bank cutover does not delete or rewrite historic files.

## Tier permissions
- OWNER: full access, including USER / STAFF management and privilege matrix changes.
- ADMIN: USER / STAFF management, settings and tracker edits.
- MANAGER: read-only access to full operational information.
- SUPERVISOR: tracker edits; no USER / STAFF / settings management.
- USER: read-only access to all operational information, including STAFF, assignments, dashboards and reports.
- SPECTATOR: restricted read-only access; no STAFF/operator details, station assignments, dashboards or reports.

The API enforces permissions. Client-side visibility and disabled controls are usability measures, not the security boundary.

## Authentication and sessions
PINs are never stored in plaintext. The Edge Function verifies salted PBKDF2-HMAC-SHA256 hashes (150,000 iterations). Successful login returns a random opaque session token; only its SHA-256 hash is stored in `downtime_central_sessions`. Sessions expire after 12 hours and are revoked when a USER is changed or removed. Failed logins are audited and throttled per username.

The browser must never access `downtime_central_bank` directly. All central reads and writes pass through the authenticated `central-bank` Edge Function. Bootstrap is allowed once, only while there is no enabled USER, and requires the one-time bootstrap code stored encrypted in Supabase Vault. Only the service role can retrieve it through a database function; browser roles cannot execute that function.

## Synchronisation and concurrency
The main tracker loads the central payload after login, saves edits with a version compare-and-swap (CAS), and polls the central version for changes from other devices. A stale write is rejected with a conflict response; the client retains the local snapshot and requires refresh/reconciliation rather than overwriting a newer central version.

Plant Overview also reads central state and writes plant status through a dedicated permission-checked CAS action. The separate PDF report/evidence archive remains connected to the existing storage and report infrastructure.

## Non-destructive migration
Migration `20261120000001_simple_central_data_bank.sql` creates and seeds the singleton central bank additively from the existing shared tracker payload. Migration `20261120000002_central_auth_and_audit.sql` adds central sessions, audit records and the private STAFF photo bucket. The seed uses `ON CONFLICT DO NOTHING`; it does not overwrite an existing central bank row.

The migrations do not drop or truncate `downtime_shared_state`, report records, evidence records or storage objects. Do not remove the legacy source until production cutover, data reconciliation and rollback acceptance are complete.

## Current release state
The main tracker and Plant Overview frontends are integrated with the central API in PR #48. CI includes static contracts and mocked browser tests for central login, PIN rejection, tier boundaries, CAS writes and central polling.

**Not yet production active:** the migrations have not been applied to production and the Edge Function has not been deployed. The central login flow therefore is not active on the live site yet.

## Acceptance gate before merge or deployment
1. Deploy the schema and function to a non-production Supabase project and complete OWNER bootstrap.
2. Test every tier against real API responses, including server-side redaction and forbidden writes.
3. Test adding, editing, disabling, deleting and resetting the PIN for USERS; verify session revocation and login throttling.
4. Test STAFF roster/profile/photo upload and signed photo reads from another device.
5. Test concurrent tracker edits, stale-write rejection, central polling and manual conflict recovery across devices.
6. Verify existing live tracker records, PDF reports and evidence files remain available through the migration and cutover.
7. Test rollback and restore procedures before production activation.

Do not merge, apply production migrations or deploy until the acceptance gate is complete and explicitly approved.
