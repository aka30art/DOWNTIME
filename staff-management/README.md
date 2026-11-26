# STAFF MANAGEMENT — staging development

This is a standalone, isolated YARD HUB department screen.

- Backend: `DOWNTIME-staging` only.
- API: `staff-management-api`.
- Authentication: existing Central Bank login flow, using a separate staging session-storage key. No second identity system is created.
- This page does not reuse production login tokens.
- The current staging Central Bank user directory has zero accounts, so authenticated UI testing requires an authorised staging test account to be provisioned through the existing staging account-management process.
- The page is not linked from the production YARD HUB launcher and is not deployed by this branch.
- Account linking is intentionally disabled until the Central Bank directory exposes a stable immutable account identifier.
- No DOWNTIME production resources are changed by this branch.

The page uses the YARD HUB Visual DNA tokens and a namespaced `sm-` CSS system. It collects only staff display name, on-site role and record status.
