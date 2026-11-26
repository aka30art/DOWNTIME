import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/20261126233000_canonical_yard_role_registry.sql", "utf8");

assert.match(migration, /status text not null default 'DRAFT'/, "new YARD ROLEs start as drafts");
assert.match(migration, /version integer not null default 1/, "YARD ROLE definitions are versioned");
assert.match(migration, /department in \('SCPL', 'R&M', 'Management', 'SCFL', 'Traffic'\)/, "schema restricts the five approved operational departments");
assert.match(migration, /access_level in \('OFF', 'READ_ONLY', 'INPUT', 'MANAGE'\)/, "schema enforces the four approved permission levels");
assert.match(migration, /v_permission_count <> 5/, "a role cannot be assigned without all five department levels");
assert.match(migration, /p_actor_user_id uuid/, "role assignment RPC requires immutable actor identity");
assert.match(migration, /actor_user_id uuid not null/, "assignment audit persists immutable actor identity");
assert.match(migration, /before update or delete on public\.yard_role_assignment_audit/, "assignment audit is immutable");
assert.match(migration, /USER_STAFF_PROVISIONING_STARTED.*USER_STAFF_PROVISIONING_ACTIVATED/s, "Central Bank identity commit accepts the actual provisioning audit actions");
assert.match(migration, /downtime_central_commit_identity_event\(bigint, jsonb, text, text, jsonb\)/, "identity commit uses the Central Bank bigint version contract");
assert.match(migration, /enable row level security/, "all canonical role tables have RLS enabled");
assert.match(migration, /revoke all on public\.yard_roles from anon, authenticated/, "browser roles cannot read or mutate the role registry directly");
assert.doesNotMatch(migration, /insert into public\.yard_roles/i, "no unapproved role catalogue entries are seeded");

console.log("PASS: canonical YARD ROLE schema enforces approved departments, levels, audit and service-role boundaries.");
