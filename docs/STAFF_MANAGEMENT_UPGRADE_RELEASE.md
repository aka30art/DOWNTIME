# STAFF Management Upgrade — Release Notes

## Scope

This release replaces the inline STAFF controls with profile cards and one shared profile modal for existing and new members. It adds profile photo management, station assignment and locking, ON/OFF PLANT status, and a blank Add New Member flow.

## Required release sequence

The tracker is deployed through GitHub Pages. The Central Bank Edge Function is deployed separately; the Pages workflow does not deploy Supabase functions.

Before merging this PR into `main`:

1. Deploy the updated `central-bank` Edge Function to the configured DOWNTIME production Supabase project from this same reviewed source revision:
   ```sh
   supabase functions deploy central-bank --project-ref "$DOWNTIME_PRODUCTION_PROJECT_REF"
   ```
2. Verify the deployed function includes:
   - `staff-photo-remove`, restricted to `canManageStaff`, removing objects from the private `downtime-staff-photos` bucket and writing an audit event.
   - station-lock enforcement on `save-state`, `save-settings`, and the legacy `staff-save` action. Reassignment of a locked profile requires an explicit unlock through Staff Settings.
3. Run the production smoke checks for staff photo upload/read/removal and locked-station preservation.
4. Merge this PR. GitHub Pages then builds and deploys the updated tracker UI from `main`.

Do not merge the UI ahead of the Edge Function deployment: the new photo-removal action is not available on the currently deployed production function.

## Data and history

- STAFF remains separate from USER accounts and login credentials.
- Removing a STAFF member removes the roster/profile entry only; historical operational records are retained.
- Existing staff names are not editable in the profile modal, avoiding changes to historical name references.
- OFF PLANT preserves the configured station and lock metadata. Plant Overview excludes OFF PLANT operators from active station cards.
- Station lock state is protected by server-side checks, not only by disabled UI controls.

## Verification in this PR

The PR CI covers the application smoke suite, Playwright browser flows, role/permission cases, photo lifecycle, the station-lock write paths, and the Central Bank Edge Function type-check. The production Supabase deployment remains a separate, explicitly authorised release action.
