# DOWNTIME — DEV-preserving USER / STAFF reset

Status: implementation candidate on `feat/preserve-dev-roots-reset-2026-11-27`.

## Controlling decision

The existing immutable DEV account is retained exactly as it exists before the reset. Its USER UUID, PIN salt, PIN hash, OWNER tier, ROOTS bootstrap binding and currently executing DEV session remain unchanged.

The reset removes every other DOWNTIME USER account, all STAFF roster entries, all STAFF profile records, and all objects in the dedicated `downtime-staff-photos` storage bucket. Compatibility copies in `appData.staffRoster` and `appData.operatorProfiles` are cleared.

DEV1 and ADMIN are protected ROOTED role definitions only. They are not created as USER accounts, login credentials, or STAFF profiles. The definitions are stored in a separate DEV-only catalogue and are returned only by the DEV-authorised ROOTS directory endpoint.

## Preserved architecture

- Central Bank USER and STAFF schemas and management workflows.
- Existing USER ↔ STAFF identity-link model for future accounts.
- Canonical ordinary YARD ROLE definitions and all five department permission matrices.
- Four access levels: OFF, READ ONLY, INPUT and MANAGE.
- ROOTS authority resolver and future assignment/revocation lifecycle.
- Legacy global tier permission profiles and non-user-specific configuration.
- Staff-role configuration catalogue.
- Operational records, operational evidence, report archives and historical audit rows.

Existing USER-to-YARD ROLE and ROOTS assignments are revoked because they point to identities being removed. Username-based legacy YARD HUB assignments are cleared; the permission profiles themselves are retained.

## ROOTED role definitions

The DEV-only catalogue contains two protected definitions:

- **DEV1** — automatic MANAGE authority across departments, may manage ordinary YARD ROLE definitions and may assign ADMIN ROOTS; cannot browse the ROOTS directory, assign DEV1, reclassify or revoke ROOTS.
- **ADMIN** — automatic MANAGE authority across departments and may manage ordinary YARD ROLE definitions; cannot browse the ROOTS directory or assign, reclassify or revoke ROOTS.

Only DEV can retrieve the definitions. Future assignment to a USER/STAFF identity remains a separate lifecycle action. Neither definition creates an identity.

## Reset execution

The reset is one-time and requires:
1. An authenticated session whose immutable USER ID matches the ROOTS bootstrap DEV ID.
2. The current DEV PIN.
3. Exact typed confirmation: `KEEP DEV - CLEAR USERS STAFF PHOTOS`.
4. A version-checked database transaction.

The Edge Function removes objects only from `downtime-staff-photos`, verifies that bucket is empty, then invokes the atomic database reset. It does not delete from operational evidence, PDF archive, R&M evidence or R&M report buckets. The database transaction preserves the current DEV session and removes all other Central Bank sessions.

If photo deletion succeeds but the database transaction fails, the reset is not marked complete; the UI reports that photos were removed and permits a safe retry. The database reset is idempotently gated by `downtime_identity_reset_runs`.

## Explicit exclusions and retention limits

- Supabase Auth infrastructure users are not the DOWNTIME Central Bank USER directory and are not deleted by this reset.
- Historical audit rows are retained for accountability and may contain historical actor labels or identifiers.
- Operational records are retained; staff names already embedded in operational history are not rewritten by this reset.
- Provider backups and point-in-time recovery snapshots may retain deleted data until their retention period expires. Live deletion is not equivalent to immediate physical erasure from historical backups.
- The current repository search did not return tracked `assets/staff/originals` or `original.png` files. The reset deletes live objects in the dedicated Supabase STAFF photo bucket.

## Release gates

1. Run the full DOWNTIME smoke suite, identity contract, ROOTS/YARD ROLE tests, browser acceptance and all Edge Function type-checks.
2. Apply the additive migration to staging and deploy both affected Edge Functions to staging.
3. Verify DEV-only role catalogue visibility, preserved DEV authentication, zero remaining STAFF photos, and unchanged operational evidence counts.
4. Merge only after all gates pass.
5. Apply the migration and deploy the two Edge Functions to production.
6. The live identity reset itself is initiated by DEV in the application with the existing DEV PIN; it is not run automatically during deployment.
7. Verify the resulting directory contains exactly the original DEV record, no STAFF profiles or roster entries, and the DEV-only DEV1/ADMIN role definitions.
