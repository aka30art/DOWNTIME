# STAFF Management Upgrade — Release Notes

## Scope

This release replaces the inline STAFF controls with profile cards and one shared profile modal for existing and new members. It adds profile photo management, station assignment and locking, ON/OFF PLANT status, and a blank Add New Member flow.

## Deployment architecture

The tracker UI is deployed through GitHub Pages. The Central Bank Edge Function is deployed separately; the Pages workflow does not deploy Supabase functions.

## Production backend status — 22 November 2026

The DOWNTIME Production `central-bank` Edge Function is deployed at **version 8**. Its deployed source has been checked and includes:

- `staff-photo-remove`, restricted to `canManageStaff`, removing objects from the private `downtime-staff-photos` bucket and writing an audit event.
- Server-side station-lock preservation in `save-state`, `save-settings`, and the legacy `staff-save` action. A locked station can only be reassigned through an explicit unlock in Staff Settings.

This confirms the production backend source has the required handlers and lock guards. It does not replace an authenticated end-to-end smoke test of actual production photo operations.

## Release sequence

1. Merge this PR into `main` after approval. The GitHub Pages workflow builds and deploys the updated tracker UI.
2. Run a controlled production smoke test using a designated test STAFF profile: create the profile, upload/read/remove its photo, set and unlock a station, and verify ON/OFF PLANT behaviour and station-lock preservation. Do not use or modify an operational staff member's records for this test.
3. Remove the designated test profile and confirm the USER accounts and historical operational records remain unchanged.

The production Edge Function is already deployed separately; no Supabase deployment is performed by the GitHub Pages workflow.

## Data and history

- STAFF remains separate from USER accounts and login credentials.
- Removing a STAFF member removes the roster/profile entry only; historical operational records are retained.
- Existing staff names are not editable in the profile modal, avoiding changes to historical name references.
- OFF PLANT preserves the configured station and lock metadata. Plant Overview excludes OFF PLANT operators from active station cards.
- Station lock state is protected by server-side checks, not only by disabled UI controls.

## Verification in this PR

- DOWNTIME CI #611 passed, including the complete smoke suite, Playwright browser flows, role/permission cases, photo lifecycle, station-lock write-path tests, mobile modal checks and Central Bank Edge Function type-check.
- Pages feature-branch verification #1317 passed. The production build and deploy jobs were correctly skipped because this PR branch is not `main`.
- The latest feature-branch Pages duplicate test #1316 also passed.
- No unresolved PR review threads were present at final review.

The PR is ready for review and merge. It has not been merged or deployed to GitHub Pages.
