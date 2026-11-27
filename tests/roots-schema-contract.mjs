import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = await readFile("supabase/migrations/20261127011000_protected_roots_assignments.sql", "utf8");
const lifecycle = await readFile("supabase/migrations/20261127050000_roots_bootstrap_and_lifecycle.sql", "utf8");
const helper = await readFile("supabase/functions/_shared/roots-authority.mjs", "utf8");
const assignment = await readFile("supabase/migrations/20261127040000_yard_role_assignment_reassignment.sql", "utf8");

assert.match(base, /create table if not exists public\.downtime_roots_assignments/);
assert.match(base, /roots_class text not null check \(roots_class in \('DEV1','ADMIN'\)\)/);
assert.match(base, /enable row level security/);
assert.match(base, /revoke all on public\.downtime_roots_assignments from public, anon, authenticated/);
assert.match(base, /revoke insert, update, delete on public\.downtime_roots_assignments from service_role/);
assert.match(base, /downtime_roots_assignment_audit/);
assert.match(base, /prevent_downtime_roots_audit_mutation/);
assert.doesNotMatch(base, /insert into public\.downtime_roots_assignments\s*\([^)]*\)\s*values\s*\(/i, "ROOTS classifications are not seeded");

assert.match(lifecycle, /create table if not exists public\.downtime_roots_bootstrap/);
assert.match(lifecycle, /upper\(trim\(coalesce\(user_record->>'username',''\)\)\) = 'DEV'/);
assert.match(lifecycle, /Existing immutable DEV bootstrap identity does not match/);
assert.match(lifecycle, /status text not null default 'ACTIVE'/);
assert.match(lifecycle, /version integer not null default 1/);
assert.match(lifecycle, /revoked_at timestamptz/);
assert.match(lifecycle, /ROOTS_RECLASSIFIED/);
assert.match(lifecycle, /ROOTS_REVOKED/);
assert.match(lifecycle, /downtime_roots_manage_identity/);
assert.match(lifecycle, /p_expected_version integer/);
assert.match(lifecycle, /ROOTS_ASSIGNMENT_VERSION_CONFLICT/);
assert.match(lifecycle, /revoke all on function public\.downtime_roots_manage_identity/);
assert.match(lifecycle, /grant execute on function public\.downtime_roots_manage_identity[^;]*to service_role/);

assert.match(helper, /immutable bootstrap USER ID/);
assert.match(helper, /assignment\.status/);
assert.match(helper, /canManageYardRoles/);
assert.match(assignment, /v_action text;\s+v_previous_role_id uuid;/);
assert.doesNotMatch(assignment, /\\n/, "SQL must not contain literal escaped newlines");
console.log("PASS: ROOTS bootstrap, immutable registry, lifecycle, audit and service-role boundaries.");
