# USER / STAFF / YARD ROLE — Phase 2 Security Implementation

Status: draft implementation on PR #195, stacked on the PR #194 identity foundation. This document records code-level changes and the remaining cutover boundaries. It does not authorise migration application, seeding, production/staging changes, deployment, account changes or identity reset.

## F1 — Photo evidence identity ownership

Implemented in this branch:
- Interactive photo evidence actions require a valid immutable USER ID from the authenticated Central Bank session.
- New attachment rows record immutable uploader USER and optional linked STAFF IDs.
- Database trigger prevents changing uploader identity, entry key, record ID, department or storage path after insertion.
- Viewing and replacing an attachment require the original uploader or DOWNTIME Manage permission. Deletion remains Manage-only.
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
- ROOTS assignment rows and their audit rows are append-only and written through a service-role RPC.
- Non-DEV account listings, Central Bank STAFF payloads, daily-operator views and GATELOG STAFF rosters hide protected ROOTS identities. Ordinary account/tier/STAFF/photo paths cannot modify or inspect protected ROOTS identities.
- Protected ROOTS authority is resolved independently and provides Manage access to the current GATELOG Traffic, R&M and YARD HUB settings consumers.

Outstanding ROOTS lifecycle and provisioning decisions: this first registry is intentionally append-only and has no revocation/reclassification API. A separately audited DEV-only revocation workflow must be designed before ROOTS assignments are used operationally. The current assignment route accepts an already-active canonical USER/STAFF pair; a dedicated ROOTS-only provisioning/activation path is still needed so DEV1 and protected ADMIN can be created without requiring an ordinary YARD ROLE assignment.

## F6 — Canonical YARD ROLE consumers and legacy fallback

Canonical YARD ROLE resolution is now wired into the current GATELOG Traffic and R&M APIs:
- Each consumer validates the active assignment against immutable USER and STAFF IDs and the USER's assigned YARD ROLE ID.
- The active role and complete five-department permission matrix are resolved server-side.
- Missing, mismatched, inactive or invalid canonical assignments fail closed.
- Traffic actions distinguish READ, INPUT/EDIT and MANAGE.
- R&M actions distinguish READ, INPUT/EDIT and MANAGE; preset/machinery management requires MANAGE.
- ROOTS authority is a separate override and is never derived from an ordinary YARD ROLE matrix.

The live backend consumers currently covered are GATELOG Traffic and R&M. SCPL, Management and SCFL do not yet have corresponding live authorization APIs integrated in this branch; any such consumer must use the same resolver before global activation. Legacy tier/YARD HUB permission fallback remains only for identities without a canonical YARD ROLE assignment and without protected ROOTS authority. It is transitional. Do not set `DOWNTIME_CANONICAL_AUTH_READY`, seed the role catalogue or treat the YARD ROLE resolver as application-wide authority until all live consumers, the direct Supabase Auth boundary, audit attribution and acceptance gates have been reviewed.

## Release boundary

- PR #194 remains the parent identity-foundation PR.
- PR #195 is draft and unmerged.
- No migrations have been applied.
- No role catalogue has been seeded.
- No production or staging changes, Edge Function deployment, identity reset, account or session changes have been made.
- Production acceptance requires the full CI smoke suite, browser acceptance, all Edge Function type-checks, migration review, and an explicit cutover plan.
