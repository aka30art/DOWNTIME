# Central Data Bank — Release and Isolation Policy

Status: controlling release policy for all Central Data Bank phases.

## 1. Release each phase independently

Every phase follows this sequence:

1. Complete the phase on its own feature branch.
2. Run the required automated checks and browser tests.
3. Review the changed-file list and confirm the phase has not crossed its approved scope.
4. Create a recovery point and record the exact base and head commits.
5. Merge only after all required checks pass and the phase is approved.
6. Deploy that completed phase as a separate release.
7. Run post-deployment smoke checks and confirm the existing applications still work.
8. Record the deployed commit and release verification before starting the next phase.

No later phase may be bundled into an earlier phase's release. No phase is considered complete merely because it has merged; deployment and post-deployment verification are separate gates.

## 2. Central Data Bank isolation boundary

The Central Data Bank is an administration surface. It must not become a runtime dependency of any operational application.

Protected applications and surfaces:

- YARD HUB main menu and launcher
- DOWNTIME
- FLOOR
- CHECK SHEETS
- Repairs & Maintenance (R&M)

CDB work must not change their runtime code, launch behaviour, navigation, authentication flow, operational records, permissions, or application availability unless a separately scoped change is explicitly approved.

In particular:

- Do not modify `index.html` or shared launcher code for CDB-only work.
- Do not modify operational database tables, tracker state, R&M records, or their migrations for CDB-only work.
- Do not modify operational Edge Functions for CDB-only work.
- Do not make any operational application depend on the CDB page, its JavaScript, or its availability.
- Keep CDB administration endpoints and credentials separate from operational application configuration.
- Never use production credentials or production write operations in development or staging tests.

If a proposed CDB feature requires crossing one of these boundaries, stop and present the exact dependency, affected files/data, and a separate change plan before proceeding.

## 3. Development and staging

- Develop and test CDB changes against the designated non-production Central Bank project only.
- Verify the target project identity before any write-capable test. A project URL or key must not be assumed to be staging based on its name or appearance.
- Do not run write tests against production.
- Do not use the production GitHub Pages site as a staging environment.
- The repository's GitHub Pages deployment is a single shared site. A Pages deployment replaces the site's published artifact; a feature-branch Pages deployment or partial-folder deployment must not be used as a preview because it could replace or disrupt the live HUB and its applications.
- Until a separate staging host/site is provisioned and verified, use pull-request CI, browser tests, and retained build artifacts as the staging gate. These are not to be represented as a publicly deployed staging URL.
- A dedicated CDB staging URL may be introduced only on a separate hosting project/site with independent deployment permissions and a confirmed non-production Central Bank endpoint. It must not share the production Pages deployment target.

## 4. Required checks before each merge

At minimum, run and pass:

- Full repository smoke suite.
- Central Data Bank static and browser contracts, including authentication, authorisation, draft/publish/restore, and responsive layout.
- DOWNTIME regression tests.
- R&M regression tests.
- YARD HUB launcher and settings isolation tests.
- Supabase Edge Function type checks for affected functions.
- Build verification.
- Changed-file/scope review confirming only approved CDB files and tests changed.

A failure blocks the phase release. Fix the cause; do not remove, skip, weaken, or bypass a test merely to obtain a green result.

## 5. Required checks after deployment

After deployment:

- Verify the deployed commit matches the approved merge commit.
- Verify the HUB menu loads and launches DOWNTIME.
- Verify DOWNTIME login, core tracker workflow, and return-to-HUB navigation.
- Verify R&M opens and its core read/write workflows remain available.
- Verify other released HUB destinations remain unchanged and available.
- Verify the CDB page loads and points to the intended environment.
- Confirm no unexpected production data changes or schema changes occurred.

If any protected application fails a post-deployment check, stop further releases and roll back the CDB release using the recorded recovery point.

## 6. Rollback and release record

For every phase, record:

- Phase name and scope.
- Base commit and approved head commit.
- Changed files.
- CI and browser-test run identifiers and results.
- Recovery point / rollback commit.
- Merge commit and deployment identifier.
- Post-deployment verification results.

Rollback the CDB release only. Do not perform broad repository resets or revert unrelated operational changes as a response to a CDB-only fault.

## 7. Authority and change control

This policy applies to all future Central Data Bank phases. Any exception requires explicit approval before implementation. Production deployment is a separate gate from merge and must never be inferred from permission to develop or merge a phase.
