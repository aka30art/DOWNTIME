# Phase 11 — Permissions & Access Control Architecture

Status: architecture baseline / implementation gate  
Branch: `feature/phase11-access-control-architecture`  
Stacked on: Phase 10 — Automatic Department & Module Generator

## Objective

Make the Central Data Bank a useful application-administration control centre while preserving the existing, server-enforced account and permission systems as the authoritative sources of truth.

Phase 11 must not introduce a second user directory, a shadow permission matrix, or UI-only permission controls. A control is not considered implemented unless its change is enforced by the authoritative server-side API.

## Findings from the current implementation

### 1. DOWNTIME identity and operational permissions

- The authoritative account payload is stored in `downtime_central_bank`.
- The `central-bank` Edge Function owns login, PIN verification, session creation, user CRUD, tier assignment, permission reads and permission writes.
- Operational tier permissions are stored in the bank payload and enforced by that API.
- The API protects the DEV OWNER identity, restricts OWNER to DEV, and applies additional DEVACC safeguards.
- The existing `ACCESS AND RIGHTS` interface is the operational permission-management interface.
- The operational runtime `index.html` and the `central-bank` Edge Function are protected dependencies for this phase. They are not to be edited.

### 2. YARD HUB access and tier configuration

- YARD HUB tier assignments and tier-permission profiles are stored separately in `yard_hub_tier_config`.
- The `yard-hub-settings-api` Edge Function reads the central account/session context and applies YARD HUB-specific authorization.
- YARD HUB tiers are not interchangeable with DOWNTIME operational tiers. A user can have a legacy DOWNTIME tier and a separate YARD HUB tier.
- Existing YARD HUB Settings is the authoritative management interface for YARD HUB user assignments and tier permissions.
- The YARD HUB Settings API and its existing authorization behaviour are protected dependencies for this phase. They are not to be edited.

### 3. Central Data Bank administration access

- The `central-config-admin` Edge Function separately authenticates and authorizes access to Central Data Bank configuration.
- DEV with OWNER tier and DEVACC are the only permitted CDB administrators.
- CDB configuration state and history are stored separately from the operational account bank and YARD HUB tier configuration.
- CDB administrator access does not itself grant authority to change operational user accounts or operational permissions.

## Architecture decisions

1. **Keep one source of truth per domain.** DOWNTIME account identity and operational permissions remain in `downtime_central_bank` through the existing Central Bank API. YARD HUB tier assignments and permissions remain in `yard_hub_tier_config` through the existing YARD HUB Settings API. CDB structure/configuration remains in its separate configuration tables.
2. **Do not duplicate permission data.** Phase 11 must not copy user records, PIN hashes, tier assignments, or permission matrices into the CDB configuration payload.
3. **Do not infer authorization from the browser.** Hidden buttons, client-side role labels, CDB login status, or a displayed permission summary are never authorization. Every privileged operation must be authorized by its owning server endpoint.
4. **Preserve the existing identity boundaries.** DEV remains the immutable root OWNER. DEVACC retains its existing CDB authority and existing limits. No new OWNER or DEVACC creation path is introduced.
5. **Keep the two tier systems distinct.** Never collapse DOWNTIME tiers and YARD HUB tiers into one selector or one permission profile.
6. **No operational runtime changes.** No edits to `index.html`, `central-bank`, `yard-hub-settings-api`, operational APIs, operational tables, permissions, records, sessions, migrations, or production data are in scope for the Phase 11 CDB work.
7. **No shadow proxy.** Do not reimplement the Central Bank or YARD HUB authorization rules inside `central-config-admin`. A future consolidated console may link to the existing management surfaces or use a formally approved, server-to-server integration that delegates to the owning API without changing its authorization contract.

## Phase 11 implementation direction

The first CDB deliverable should be an **Access & Governance** administration page that:

- Explains the three separate control domains and identifies each source of truth.
- Clearly distinguishes CDB administrator access, DOWNTIME operational permissions, and YARD HUB access.
- Provides safe navigation to the existing authoritative management surfaces rather than recreating their editors.
- Shows only verified integration/availability status; it must not invent live user counts, tier summaries, or audit status when no authorized source is available.
- Makes protected identities and the DEV / DEVACC authority boundary explicit.
- Uses clear read-only labels wherever CDB is not the system of record.

The first deliverable is deliberately governance/navigation, not a new permission engine. Any future single-screen user or permission administration requires a separately reviewed integration contract, including server-side delegation, audit attribution, concurrency handling, session invalidation, failure handling, and tests proving that the existing APIs remain authoritative.

## Required verification before implementation is considered complete

- Static contract tests confirm the protected operational files and API contracts are not changed by the Phase 11 CDB PR.
- Existing Central Bank, YARD HUB Settings, CDB authorization, and permission-regression suites pass.
- Browser tests confirm the new CDB page is navigable and clearly labels read-only versus authoritative controls.
- Server tests prove that no CDB-only session or client-side flag can authorize an operational permission change.
- The PR diff contains no database migration, schema change, operational data mutation, or production deployment.

## Explicit exclusions

- Editing or replacing the existing DOWNTIME Access & Rights editor.
- Changing `lockedTierPermissions`, tier defaults, permission keys, or operational authorization checks.
- Editing the existing Central Bank or YARD HUB Settings APIs.
- Creating a new identity provider, PIN store, user table, permission table, or role hierarchy.
- Making generated Phase 10 placeholder modules operational.
- Deploying Edge Functions or changing production configuration as part of this architecture baseline.
