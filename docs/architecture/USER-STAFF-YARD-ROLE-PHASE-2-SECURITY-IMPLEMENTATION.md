# USER / STAFF / YARD ROLE — Phase 2 Security Implementation

Status: draft implementation on PR #195, stacked on the PR #194 identity foundation. This document records code-level changes and the remaining cutover boundaries. It does not authorise migration application, seeding, production/staging changes, deployment, account changes or identity reset.

## F1 — Photo evidence identity ownership

Implemented in this branch:
- Interactive photo evidence actions require a valid immutable USER ID from the authenticated Central Bank session.
- New attachment rows record immutable uploader USER and optional linked STAFF IDs.
- Database trigger prevents changing uploader identity, entry key, record ID, department or storage path after insertion.
- Viewing and replacing an attachment require the original uploader or DOWNTIME Manage permission. Deletion remains Manage-only.
- Original-uploader view/replacement is ownership-based and does not require Management VIEW. New-record upload requires Management ENTER; attaching to an existing record requires EDIT or MANAGE; deletion requires MANAGE.
- Legacy attachments with no uploader ID are Manage-only; no inferred owner or historical backfill is attempted.
- Upload/delete audit details include immutable actor IDs and owner IDs where available.
- Scheduled expiry cleanup remains separate and unchanged.

The ownership migration is pending. Existing ownerless rows remain ownerless until normal expiry/cleanup or a separately approved migration decision.

## F2 — Pre-authentication login directory

The current unauthenticated `list-users` response contains usernames only. It does not expose display names, tiers, USER IDs, STAFF IDs or ROOTS classifications. This is retained as the minimum login identifier needed by the existing login flow. A non-enumerating login flow remains a possible later improvement.

## F3 — Independent Supabase Auth / RLS surface

The existing `downtime_shared_state` authenticated Supabase Auth/RLS and Realtime boundary is deliberately unchanged. Central Bank opaque sessions do not implicitly govern that separate surface. Before cutover, inventory live clients and credentials that can still use direct Supabase Auth, and decide whether that surface remains supported or needs a separately reviewed migration.

## F4 — Historical identity representations

New ROOTS assignments and photo-evidence ownership use immutable USER/STAFF IDs. Existing display-name snapshots and historical attribution are not rewritten. Legacy GATELOG and R&M audit records continue to preserve their existing actor snapshots; a separate additive actor-ID migration is still required before treating all historical and new audit events as identity-linked.

## F5 — Protected ROOTS separation

Implemented in this branch:
- ROOTS is stored in a separate service-role-only registry; no ROOTS classifications are seeded.
- DEV is recognised only as the immutable DEV bootstrap identity. DEV1 and protected ADMIN require a matching server-loaded USER/STAFF assignment.
- Legacy OWNER, DEVACC and ordinary ADMIN tier labels do not imply ROOTS authority.
- DEV alone can browse the ROOTS directory and assign DEV1. DEV and DEV1 can assign ADMIN; DEV1 receives no ROOTS directory data. ADMIN cannot assign ROOTS.
- ROOTS assignments are separate from ordinary YARD ROLE permissions. Assignment, reclassification, revocation and restoration use a version-checked service-role lifecycle RPC; audit events remain append-only.
- DEV is recognised only by the immutable bootstrap USER ID. DEV1 and protected ADMIN require matching immutable USER/STAFF assignments. Legacy OWNER, DEVACC and ordinary ADMIN tier labels never imply ROOTS.
- DEV alone can browse the ROOTS directory and assign DEV1. DEV and DEV1 can assign ADMIN. DEV1 receives no ROOTS directory data; protected ADMIN cannot assign ROOTS.
- Non-DEV account listings, Central Bank STAFF payloads, daily-operator views and GATELOG STAFF rosters hide protected ROOTS identities. Ordinary account/tier/STAFF/photo paths cannot modify or inspect protected ROOTS identities.
- ROOTS authority is resolved independently and grants protected Manage capabilities to the current Central Bank Management, GATELOG Traffic, R&M and YARD HUB ROOTS consumers. It does not grant the separate DEV-only configuration control plane.
- Central Bank USER directory access and provisioning are restricted to immutable DEV ROOTS authority; legacy OWNER, DEVACC and ADMIN tier labels do not grant this control-plane access.

DEV1's ADMIN assignment is exposed through a restricted manual-ID form: it accepts one immutable USER ID and its linked STAFF ID, invokes only the ADMIN assignment action, and never loads or displays the ROOTS directory. DEV remains the only identity that can browse the directory, assign DEV1, reclassify or revoke ROOTS identities.

Outstanding provisioning decision: ROOTS assignment routes operate on an existing active canonical USER/STAFF pair. A dedicated ROOTS-only provisioning/activation path is still needed if DEV1 or protected ADMIN must be created without first completing the ordinary canonical USER/STAFF provisioning workflow.

## F6 — Canonical YARD ROLE consumers and legacy fallback

Canonical YARD ROLE resolution is wired into the current backend consumers:
- **Management — Central Bank API / DOWNTIME tracker:** active USER/STAFF assignment and the complete matrix are validated. VIEW controls read/report/dashboard visibility; ENTER permits new operational records; EDIT permits changes to existing records; MANAGE permits removals. Without VIEW, concealed server records are merged back rather than being interpreted as deletions. Canonical Management users cannot change global settings or STAFF identity data through tracker writes.
- **R&M — Repair & Maintenance API:** active immutable USER/STAFF/YARD ROLE assignment is validated. VIEW, ENTER, EDIT and MANAGE are enforced independently for fault, machinery, preset and report actions.
- **Traffic — GATELOG API:** active immutable USER/STAFF/YARD ROLE assignment is validated. VIEW, ENTER, EDIT and MANAGE are enforced independently; destructive/customer administration actions require MANAGE.
- **YARD HUB Settings:** ordinary YARD ROLE administration is separate from ROOTS governance. Protected ROOTS capabilities govern role catalogue and ROOTS lifecycle routes.
- **SCPL and SCFL:** their four independent permission flags are present and validated in every complete role matrix, but there are no separate live application APIs for these departments in the current application. Their flags do not grant Management, R&M, Traffic, STAFF administration or ROOTS access. Any future SCPL/SCFL consumer must integrate the same server-side resolver before those permissions can become operational.

The current live application consumer map is therefore Management, R&M and Traffic, plus the separate ROOTS administration boundary. Legacy Central/YARD HUB fallbacks remain transitional only for non-canonical identities without protected ROOTS authority. Do not set `DOWNTIME_CANONICAL_AUTH_READY`, seed the role catalogue or declare the resolver globally authoritative until the direct Supabase Auth boundary, remaining audit attribution, migration review and complete acceptance gates are resolved.

## Release boundary

- PR #194 remains the parent identity-foundation PR.
- PR #195 is draft and unmerged.
- No migrations have been applied.
- No role catalogue has been seeded.
- No production or staging changes, Edge Function deployment, identity reset, account or session changes have been made.
- Production acceptance requires the full CI smoke suite, browser acceptance, all Edge Function type-checks, migration review, and an explicit cutover plan.
