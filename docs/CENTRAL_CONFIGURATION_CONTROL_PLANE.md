# DOWNTIME — Central Data Bank Configuration Control Plane

## Responsibility boundary

**Central Data Bank Admin manages configuration data. Access & Rights manages people, tiers and permissions.**

The configuration workspace does not create users, reset PINs, manage STAFF profiles, or duplicate the tier-permission editor. Those existing functions remain in their existing application areas.

The only identities authorised to enter Central Data Bank Admin or change tier permissions are:
- An account whose tier is exactly `ADMIN`.
- The immutable root identity `JAN` with tier `OWNER`.

The rule is checked by the central Edge Function on every configuration API action. Hiding menu items is only a UI convenience; HTTP 403 is the security boundary.

## Configuration domains

1. **Organisation** — organisation name, primary site code, IANA time zone and locale.
2. **Plant & Areas** — site, plant/facility, area and station registries.
3. **Operational Libraries** — area presets, downtime reasons, daily task templates, equipment categories, event categories and operational statuses.
4. **System Defaults** — week start, operating days, break allowance, shift schedule and saved shift presets.
5. **Version History** — immutable configuration snapshots with actor, timestamp, parent version, action and note.

The data model is intentionally extensible. Future master-data groups can be added through a new schema version and validator rather than overloading the operational tracker payload.

## Safe configuration lifecycle

`Edit → Validate → Save Draft → Review → Publish`

- Editing the form changes only the local editor state.
- Save Draft validates input on the server and creates a versioned snapshot.
- Publish is a separate, explicit action and confirmation.
- Restoring a prior snapshot creates a new draft; it does not roll back or overwrite the published version.
- Publishing only changes the configuration registry's published payload/version.

## Isolation from the running tracker

The migration creates two new tables:
- `downtime_central_config_state` stores the current draft and published configuration pointers/payloads.
- `downtime_central_config_history` stores version snapshots.

The migration seeds v1 from existing area/reason/task and shift preset values, but it does so as a detached copy. The draft and published configuration tables are not used by the tracker client. The new Edge Function actions do not update `downtime_central_bank.appData` or any operational record.

Therefore, saving or publishing a configuration version through the new Central Data Bank UI does not change current tracker behaviour. A future app integration that reads published configuration must be treated as a separate change, with compatibility checks, CI, browser QA and an explicit release.

## Security and data access

- Both new tables have RLS enabled.
- Browser roles `public`, `anon` and `authenticated` have no table grants.
- Only the Edge Function's service role accesses the tables.
- The browser only communicates through the authenticated central Edge Function using the opaque `x-downtime-session` token.
- All `central-config-*` actions have a shared ADMIN/JAN server-side allow-list.
- The Edge Function validates time zone, list types, duplicate entries, list size, schema version, break duration and configuration size before saving.
- Expected version values are checked to reject stale writes.
- Every new draft, publish and restore is recorded in the central audit log.

## Current implementation and release boundary

The new control room, API actions and migration are developed on the isolated branch `feature/central-config-management-2026-11-22`, created from `backup-2026-11-22-central-bank-admin-prework`.

This work must not be merged or deployed until CI, Edge Function type-checking, contract tests, browser QA and database migration review are green. The migration and Edge Function must be tested against a non-production Supabase project first. No production migration or production Edge Function update is part of the implementation branch work.
