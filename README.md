# DOWNTIME — YARD OPERATIONS CORE

DOWNTIME is part of the YARD HUB operations platform. The application is hosted as a static GitHub Pages frontend, with operational state and administrative actions mediated by Supabase Edge Functions.

## Application modules

- **YARD HUB** — authenticated application launcher and shared session entry point.
- **DOWNTIME** — weekly downtime entry, daily plant operation data, area/reason presets, staff and station assignments, plant overview, analytics and report workflows.
- **REPAIR & MAINTENANCE** — machinery categories, registered machinery, fault records, priorities/statuses, notes/evidence and archived PDF exports.
- **Central Data Bank** — central USER and STAFF data, role permissions, audit records and versioned tracker state.
- **Master Configuration** — DEV-only configuration workspace for organisation, plant structure, operational libraries, defaults, navigation labels and configuration history. The published administration page is currently configured to use the isolated staging project only.

FLOOR and CHECK SHEETS remain reserved YARD HUB tiles. They are not included as implemented production modules in this release scope.

## Architecture and data handling

The browser uses the Central Bank client adapter and an opaque session token held in tab-scoped session storage. Credential verification, session validation and role enforcement are performed by the Central Bank Edge Function. The current implementation uses a username and PIN flow; credentials are stored as salted hashes, not plaintext.

Tracker and central configuration writes are version-checked by the server. Concurrent changes are rejected rather than silently replacing a newer version. Cross-device state updates use a private Realtime notification containing version metadata only; clients then retrieve authorised state through the server API.

Protected database tables use row-level security and server-side service-role access. The browser must not receive service-role credentials or access protected application tables directly.

## Reports and evidence

DOWNTIME provides weekly reporting and archive workflows. REPAIR & MAINTENANCE provides machinery/fault workflows, evidence attachments and a private PDF export archive. Access to records and actions is subject to server-side tier permissions.

## Local validation

Install the repository dependencies with Node.js 22, then run:

```sh
npm install
npm run test:smoke
```

The smoke command chains the repository's static contracts and Playwright browser checks, including Central Bank, YARD HUB, DOWNTIME, realtime, mobile layout, reporting and REPAIR & MAINTENANCE coverage. The CI workflow also type-checks the Supabase Edge Functions with Deno.

## GitHub Pages deployment

The Pages workflow runs the smoke suite for pull requests and configured feature branches. It builds a Pages artifact for pull requests and `main`, but its deploy job is restricted to `main`. A passing pull-request build does not deploy the live site.

Production deployment requires a reviewed pull request, passing checks, an approved data/function migration plan and separate explicit release authorisation.

## Environment separation

- Production Pages: https://aka30art.github.io/DOWNTIME/
- Production Supabase project: `ygwfipksbbprqynvbklk`
- Isolated development/staging Supabase project: `phfojlqezudbjslfrnyw`

The live application and live Supabase project are protected during development. Do not apply staging migrations, deploy staging Edge Functions, or point production pages at staging credentials as a production cutover. See [the production release runbook](docs/PRODUCTION_RELEASE_RUNBOOK.md) before any release activity.
