# DOWNTIME — Simple Central Database

## One bank
The new `downtime_central_bank` table contains one singleton payload (`id=1`). It is the only central data store for the redesigned app:
- `appData`: tracker records, settings, report references, and operational data
- `users`: account list, salted PIN hashes, enabled state and tier
- `tiers`: editable privilege matrix
- `staff`: roster, staff details, and photo thumbnails/paths
- `statsSource`: tracker source records used to calculate KPIs and statistics

No separate STAFF table, settings table, or statistics table is required for the simplified application.

## Tier permissions
OWNER: full access, including user/staff management and tier settings.
ADMIN: user and staff management, settings and tracker edits.
MANAGER: read-only full operational information.
SUPERVISOR: tracker edit; no central user/staff/settings management.
USER: read-only full information.
SPECTATOR: limited read-only view; staff, assignments, dashboards and reports hidden.

## PIN handling
Never store PINs in plaintext. Store a per-user salted, slow password hash. Login/session verification and all writes must happen server-side; browser-side hiding alone is not an authorization control. Do not expose the bank table to browser roles; access through the authenticated server function only.

## Migration
Migration `20261120000001_simple_central_data_bank.sql` is additive. It copies existing downtime shared payload into the new bank only on initial seed. Existing `downtime_shared_state`, reports, evidence attachments, and storage objects are untouched. It will not overwrite a central-bank row once created.

## Release gate
Do not deploy this schema alone as an app cutover. The frontend still uses the legacy local roster/PIN flow and old shared-state sync. The central bank is not live-connected to that UI until the authentication/API adapter and migration/export path are completed and tested.
