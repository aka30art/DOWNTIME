# Central Supabase Platform Architecture

Status: Approved architecture; implementation and migration are staged.

## Decision

The DOWNTIME ecosystem will operate from one Supabase project as its shared backend foundation. DOWNTIME, YARD HUB, GATELOG and future departments are application modules within that project, not separately provisioned Supabase backends.

A single project does not mean one table or one unstructured data object. Departmental data remains logically separated in purpose-built tables and schemas, with shared platform services for authentication, authorisation, audit, and genuinely common records.

## Identity boundary: STAFF is not USER

These are separate domain concepts and must never be conflated.

- **USER** is an authenticated system identity. Users sign in and receive permissions, tiers, and access to authorised applications.
- **STAFF** is an operational personnel record. A staff member may be on site and assigned an operational role without having any system account.
- A user account does not automatically create a staff record.
- A staff record does not require a user account.
- No account-linking workflow, staff login, second identity provider, or bootstrap process is part of the staff-directory design.
- Staff on-site roles are operational roles, not application permission tiers.

The staff directory stores the minimum operational information required by departments: display name, configurable on-site role, active/archived status, and relevant operational activity history. Existing operational fields required by YARD HUB (such as station assignment and plant availability) must remain compatible until their consumers are safely migrated.

## Platform boundaries

### Shared platform services

- One Supabase Auth / central identity and session authority for actual system users.
- Centralised permission evaluation and server-side authorisation.
- Shared append-only audit framework.
- Shared customer, vehicle, and other master records only where departments genuinely use the same business entity.
- Central secrets and service-role access held server-side only.

### Department-owned data

Each department owns its operational data model and API surface. Department boundaries are enforced through schema ownership, least-privilege database grants, Row Level Security, and server-side Edge Function checks. A department must not gain access to another department's records merely because both reside in the same Supabase project.

Suggested logical ownership:
- DOWNTIME: plant downtime, shifts, operational records, maintenance and related evidence.
- YARD HUB: yard operations, staff operational assignments, settings and shared yard workflows.
- GATELOG: vehicle visits, weighbridge/gate records, customers, vehicles and waste-type line items.
- Shared platform: authenticated users, permissions, staff directory, audit events, and approved master data.

Names above describe logical ownership; final table and schema names are established through the relevant migration design.

## Current implementation starting point

YARD HUB already uses the Central Data Bank payload and the `downtime_central_bank` / `downtime_central_audit` tables for shared state and audit. Its staff roster and profiles are mirrored under `bank.staff` and the compatibility `bank.appData` fields.

The existing staff directory is therefore extended in that central foundation rather than introducing a separate `staff_management` Supabase project/schema/API, a second login, or account-link tables. The current JSON payload remains a compatibility layer while a future normalised shared staff table is evaluated; no live records are moved by this feature branch.

## Security and data integrity requirements

1. Never expose the Supabase service-role key to browser clients.
2. Every write is authenticated and permission-checked server-side.
3. Department data access is restricted by RLS and least-privilege grants.
4. Staff records are archived/restored, not physically deleted through normal UI workflows.
5. Staff and role changes are audited with actor, action, and before/after operational fields.
6. Staff role changes do not alter user tiers or application permissions.
7. Existing station assignment locks and permission boundaries remain enforced.
8. Shared customer and vehicle records must have stable identifiers before cross-department reuse.
9. No username, display name, or staff name is used as a substitute for a stable authenticated user identifier.
10. No department may create its own user directory or bootstrap authentication flow.

## Migration and release sequence

1. **Inventory:** identify every Supabase project, Edge Function, table, bucket, secret, auth configuration, and client endpoint used by each department.
2. **Target map:** assign each resource to the single central project and define schema ownership, shared entities, RLS, and permissions.
3. **Staging foundation:** prepare the target project and migrations in an isolated staging environment. Preserve existing staging records and services.
4. **Department adapters:** move or reconfigure one department at a time to use the shared project, keeping department APIs and data boundaries intact.
5. **Data migration rehearsal:** copy, reconcile, count, validate relationships, and test rollback without touching production.
6. **Integrated acceptance:** verify cross-department workflows, auth, permissions, audit, backups, restore, and failure isolation.
7. **Production milestone:** only after explicit production migration approval, take verified backups, apply staged migrations, switch endpoints, verify production, and retain rollback capability.

## Non-negotiable production protection

This architecture decision authorises development and isolated staging work. It does not by itself authorise production schema changes, data migration, configuration changes, endpoint switches, or deployments. Existing DOWNTIME production resources remain protected until a specific production migration milestone is approved.

## Acceptance criteria

- All departments can use the same Supabase project without separate project credentials or bootstrap systems.
- Authenticated users and operational staff remain distinct.
- A staff member can exist without a user account.
- A user can exist without a staff record.
- Staff management is governed by staff permissions, not user-role assumptions.
- Departmental data is isolated by schema/table permissions and RLS.
- Shared records have stable IDs and a single authoritative owner.
- All sensitive mutations are audited.
- Staging integration passes with no regression to existing DOWNTIME, YARD HUB, or GATELOG workflows.
- Production is not changed until the explicit release gate is met.
