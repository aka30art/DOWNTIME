# DOWNTIME — Simple Central Data Core

## Design decision
Keep the existing Supabase project and existing shared-state model. No new authentication/session framework is required for the central data cutover.

One shared payload in `downtime_shared_state` is the canonical source of truth for app-wide data:
- tracker / weeks / reports / statistics (existing shared tracker payload)
- USERS: username, PIN, tier, enabled status
- STAFF: name, photo reference, station assignment, active status, order
- settings: areas, reasons, presets, configuration

USERS and STAFF are separate collections within the central payload; they are not merged. JAN is an ordinary USERS record and must not be reinserted by app defaults after deletion. User tier/permissions remain part of the existing model.

## Device behavior
- All devices load the canonical payload at startup and refresh from the same source.
- Changes write back to the shared payload; other devices refresh/poll or receive realtime updates.
- Local browser storage is cache only and never the permanent authority for USERS, STAFF, settings, or tracker records.
- When simultaneous writes happen, the app must avoid silent whole-payload overwrites. A simple version check / conflict retry is sufficient.
- Preserve existing tracker/report history and the current user tier behavior.

## Simplicity constraints
- No additional Supabase project.
- No new custom session framework as part of this cutover.
- No email accounts, invitations, or recovery workflows.
- No new layers unless required by the existing backend.
- Reuse the existing Supabase table and current sync path where possible.

## Implementation and release
Build and validate in a PR preview only. Test add/edit/delete USERS and STAFF on Device A, verify Device B sees changes after refresh/live update, verify reload persistence, permissions and JAN behavior, and check concurrent edits. No production schema mutation or deployment until acceptance tests pass.
