# Central API (PR48 implementation)

Function: `central-bank`. Deploy only after PR review/acceptance.

## Actions
- `bootstrap`: one-time OWNER creation, protected by secret `DOWNTIME_BOOTSTRAP_CODE`; only if no enabled users exist.
- `login`: username/PIN validation (PBKDF2-HMAC-SHA256, 150k rounds, per-account random salt), opaque 256-bit session token stored hashed, 12-hour session.
- `get-state`: returns central bank data and caller tier after session validation.
- `save-state`: tracker writes with version compare-and-swap.
- `users`, `user-save`, `user-delete`: tier-gated user administration.
- `staff-save`: central staff/profile data.
- `staff-photo-url`, `staff-photo-read`: private bucket signed photo URLs.
- `tiers-save`: OWNER-only privilege matrix editing.
- `logout`: revokes server session.

## Before deployment
Set `DOWNTIME_BOOTSTRAP_CODE` as a Supabase secret; it is not stored in source. Keep function `verify_jwt=false` only because the function validates its own opaque session header on protected actions. Validate Origin, rate limiting/lockout, token/session invalidation, bootstrap concurrency, storage policies, and end-to-end tests before production deployment. Frontend integration remains the release gate.
