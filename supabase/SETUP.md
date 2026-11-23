# DOWNTIME LIVE — Supabase setup

## 1. Create a Supabase project
Create a project at https://supabase.com and keep its database password private.

## 2. Run the database schema
Open Supabase Dashboard → SQL Editor → New query. Paste the contents of `supabase/schema.sql` and click Run.

## 3. Configure app connection
In Project Settings → API, copy:
- Project URL
- Publishable/anon key

These are intended for browser use. **Never share the service_role/secret key.**

## 4. Security model
The included schema permits database access only for authenticated Supabase users. The app integration must include sign-in before reading/writing shared state. Do not relax RLS to public/anon for convenience.

## 5. Existing local data
The app currently stores state in browser localStorage. Cloud migration must be implemented with a one-time import option and must not overwrite existing local data automatically. Take a manual export first.

## 6. STAFF originals upload configuration

DOWNTIME's canonical STAFF image upload writes full-resolution PNG originals to `assets/staff/originals/<staff>/original.png` through the Central Bank Edge Function.

Before enabling this feature, create a GitHub fine-grained personal access token with access restricted to the `aka30art/DOWNTIME` repository and **Contents: Read and write** permission. Configure it as the Supabase Edge Function secret named `GITHUB_STAFF_IMAGE_TOKEN`. Do not put this token in the app, repository files, logs, or chat. The Edge Function rejects uploads if the secret is missing.

The app only accepts the known STAFF destinations (Jan, Mick, Gigi, Daz, Shayne), PNG originals, and a 5 MB upload cap. Upload actions require the authenticated session and `canManageStaff` permission. The GitHub token should be rotated and revoked when no longer required.

