# USER / STAFF / ROOTS / YARD ROLE — First Application Implementation Release Plan

Status: **Proposed release plan — planning record only; no implementation or production action authorised**
Prepared: 2026-11-26
Architecture authority: `docs/architecture/USER-STAFF-YARD-ROLE-PHASE-1-REVIEW.md`
Architecture merge: PR #190, `dc69e59d474729eec1fe455d7649be3c8fd3edfb`

## 1. Decision and boundary

The recommended first application implementation release is a narrowly scoped **security-containment release**, not the full USER/STAFF/ROOTS/YARD ROLE conversion. It should address the two directly actionable pre-existing findings:

- **F1:** photo-evidence create-upload, view and delete currently use service-role storage access without Central Bank session, USER identity, ownership or actor authorization.
- **F2:** unauthenticated Central Bank `list-users` exposes enabled usernames, display names and legacy tiers before session validation.

This document is a proposed scope and acceptance contract only. It does not implement either change, alter application code, create migrations, change Supabase configuration, modify production data, reset identities or deploy anything. A separate implementation PR and release approval are required.

The production identity reset remains a later, independent controlled release. This first release must not delete/recreate USER or STAFF accounts, bulk-clear sessions or role assignments, remove media, or rewrite operational history.

## 2. Why this comes first

The identity redesign increases reliance on server-side identity and actor attribution. F1 currently bypasses that boundary for media operations; F2 discloses account-directory information before authentication. Closing these narrow issues reduces exposure without prematurely introducing a new identity schema or permission authority.

F3 is a separate Supabase Auth/RLS/realtime boundary. It requires evidence-based discovery of live clients and credentials before any policy change. Treat it as a read-only investigation gate, not an assumed migration.

## 3. Work package A — F1 photo-evidence authorization

Before coding, explicitly approve the business policy for each action and object class. Do not infer ownership from filenames, display names, STAFF photos or client-supplied actor fields.

Required behaviour:
1. Resolve the existing opaque Central Bank session server-side for every user-facing `create-upload`, `view` and `delete` request.
2. Resolve the current active USER. Reject missing, expired, revoked, disabled or unknown sessions/identities.
3. Derive authorization server-side. Never trust client-supplied USER IDs, STAFF IDs, owner IDs, roles, tiers or permission booleans.
4. Define and enforce object ownership/association. Where shared operational use is legitimate, express it as an explicit server-side department/action grant rather than unrestricted service-role access.
5. Record immutable actor identity and a safe historical display-name snapshot for every create/delete mutation.
6. Issue short-lived signed URLs only after authorization succeeds and only for the authorized object.
7. Keep scheduled `cleanup` isolated behind `PHOTO_CLEANUP_SECRET`; do not route it through browser sessions or broaden its bucket/path scope.
8. Keep the STAFF photo library and `downtime-staff-photos` distinct from transient `downtime-evidence`.

Required tests:
- Unauthenticated, invalid, expired, revoked and disabled sessions are denied for create-upload, view and delete.
- Valid users can perform only explicitly approved actions on authorized objects.
- Cross-user/object access and forged owner/actor identifiers are denied.
- A user cannot delete another user's evidence or obtain an unauthorized signed URL.
- Actor attribution is server-generated, not payload-controlled.
- Cleanup still requires its secret, remains independent of user sessions and cannot broaden deletion scope.
- Existing size, type, expiry and private-bucket protections continue to pass.

**Policy decision required before coding:** determine whether evidence is owned by its uploader, attached to an operational record/department, or both; who may view/delete after uploader disablement or STAFF reassignment; and whether delete is soft-delete or physical removal. The implementation PR must record the approved policy.

## 4. Work package B — F2 minimal pre-authentication login discovery

Replace the expanded unauthenticated directory response with the minimum information required by the login UX.

Preferred approach: use a non-enumerating login flow that accepts username and PIN without returning a directory. If a selector is temporarily retained, return only the minimum login identifier—never display name, legacy tier, ROOTS class, STAFF link or YARD ROLE assignment.

Required behaviour:
- Anonymous responses disclose no role/tier/permission metadata.
- Unknown, disabled and wrong-credential attempts do not reveal which condition occurred.
- Evaluate practical rate limiting/abuse controls for login attempts; do not claim completion without an adequate control.
- Keep the authenticated identity response minimal and safe.
- Stale clients receive a clear contract/refresh response, not the former expanded directory payload.

Required tests:
- Anonymous response contains no tier, role, ROOTS, STAFF, permission or account-status metadata.
- Unknown, disabled and wrong-credential attempts are indistinguishable to an unauthenticated caller.
- Supported browser login remains usable.
- Session validation, logout and revocation remain intact.
- No legacy unauthenticated action returns the former expanded directory.

## 5. F3 — mandatory read-only investigation

Before identity cutover, establish whether any live browser/client or credential directly accesses `downtime_shared_state` through Supabase Auth rather than the Central Bank opaque session.

Deliverables:
- Repository-wide search of Supabase client initialization and direct table/realtime access.
- Identify deployed clients, keys and credentials capable of exercising authenticated RLS policies.
- Distinguish service-role Edge Function access from anon/authenticated client access.
- Document concrete call paths and tests.
- Recommend whether existing RLS/realtime policies should remain, be narrowed or be replaced in a separate reviewed change.

No RLS, grants, schema or realtime policy change belongs in the first release.

## 6. Explicitly out of scope

- New USER/STAFF schema or immutable-ID migration.
- USER+STAFF staged provisioning.
- ROOTS assignment or administration UI.
- Canonical YARD ROLE catalogue, department matrix or resolver.
- Migration of Central Bank, YARDHUB, R&M, GATELOG, daily operator, exports/reports or control-plane authorization consumers.
- Removal of legacy YARDHUB tiers or R&M permission fallback.
- Production identity reset, account deletion/recreation, session purge or role-assignment purge.
- STAFF media cleanup, evidence-object cleanup or bulk object deletion.
- Changes to `downtime_shared_state` RLS, Supabase Auth grants or realtime policies.
- Changes to spectator access, Central configuration control plane, GATELOG/R&M history or DOWNTIME shared-state boundaries.

## 7. Carry-forward constraints F4–F6

- **F4:** New actor/target relationships use immutable IDs; existing operational history and display-name snapshots remain unchanged.
- **F5:** Legacy OWNER, DEVACC and ordinary ADMIN tier strings must never create or imply protected ROOTS classification. Prove this with negative tests in the later ROOTS implementation.
- **F6:** The R&M legacy fallback remains a known compatibility risk until the canonical resolver is implemented. Remove it at the approved canonical-role cutover, with missing canonical configuration failing closed. Do not remove it prematurely if that would break existing authorization without a replacement resolver.

## 8. Delivery sequence and release gates

| Gate | Deliverable | Exit condition |
|---|---|---|
| G0 — policy freeze | F1 ownership/action policy and F2 login UX decision | Written decisions reviewed before implementation |
| G1 — isolated implementation | Dedicated branch and PR for F1/F2 only | No identity schema, role-engine or reset changes |
| G2 — security tests | Positive, negative, cross-user, stale-session and cleanup-isolation tests | All required cases pass; existing assertions are not weakened |
| G3 — integrated verification | Full repository CI, Edge Function typecheck, browser smoke and regression suite | All checks pass on exact PR head |
| G4 — release review | Diff, deployment impact, secrets/config needs, rollback and live verification checklist | Explicit approval for this application release |
| G5 — controlled release | Merge and deploy approved application change | Production behaviour verified; no identity/data reset occurred |

No gate is implied to have passed by PR #190. Architecture acceptance is not implementation or deployment approval.

## 9. Rollback requirements

- Keep this release isolated and reversible; do not combine it with schema migration or identity reset.
- Preserve the previous application release artifact/commit for redeployment.
- If photo authorization causes operational lockout, roll back the application change while retaining the private bucket and cleanup isolation; never make the bucket public or disable authorization as a workaround.
- If login UX regresses, restore the previous supported client/server pair only through a reviewed rollback. Do not retain expanded tier disclosure as a permanent fallback.
- No rollback step may restore deleted accounts, roles or media; this release must not delete them.

## 10. Later releases — kept separate

After security containment is accepted and verified:
1. Finalize schema/API contracts, immutable USER/STAFF IDs, audit and provisioning lifecycle.
2. Build one server-side ROOTS/YARD ROLE resolver and isolated contract tests.
3. Migrate consumers in bounded groups: Central Bank, YARDHUB, R&M, GATELOG, daily operator, exports/reports, control-plane boundary and browser clients.
4. Prove stale-client rejection, forged-field denial, fail-closed behaviour and preservation of operational history.
5. Rehearse the integrated application against non-production data and approve application cutover independently.

Only after application implementation is stable should production identity reset be prepared as its own release: read-only live inventory, exact immutable-ID/object-path manifest, dry run, isolated rehearsal, counts/checksums, recovery plan, explicit destructive-operation approval and post-reset verification. Preserve operational history and boundaries defined in the Phase 1 review.

## 11. Approval boundary

This plan recommends F1 + F2 as the first narrow application implementation release, with F3 as read-only investigation and F4–F6 as mandatory constraints.

Approval of this planning record would authorize preparation of a dedicated implementation PR only if separately stated. It does not authorize production deployment, schema/data migration, identity reset or destructive operations.
