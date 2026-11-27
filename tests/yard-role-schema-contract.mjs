import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/20261126233000_canonical_yard_role_registry.sql", "utf8");
const definitionMigration = await readFile("supabase/migrations/20261127030000_yard_role_definition_management.sql", "utf8");
const reassignmentMigration = await readFile("supabase/migrations/20261127040000_yard_role_assignment_reassignment.sql", "utf8");
const atomicAssignmentMigration = await readFile("supabase/migrations/20261127060000_yard_role_assignment_atomic_central_bank.sql", "utf8");
const settingsApi = await readFile("supabase/functions/yard-hub-settings-api/index.ts", "utf8");

assert.match(migration, /status text not null default 'DRAFT'/, "new YARD ROLEs start as drafts");
assert.match(migration, /version integer not null default 1/, "YARD ROLE definitions are versioned");
assert.match(migration, /department in \('SCPL', 'R&M', 'Management', 'SCFL', 'Traffic'\)/, "schema restricts the five approved operational departments");
assert.match(migration, /can_view boolean not null default false/, "View is independently configurable");
assert.match(migration, /can_enter boolean not null default false/, "Enter is independently configurable");
assert.match(migration, /can_edit boolean not null default false/, "Edit is independently configurable");
assert.match(migration, /can_manage boolean not null default false/, "Manage is independently configurable");
assert.match(migration, /v_permission_count <> 5/, "a role cannot be assigned without all five department permission records");
assert.match(migration, /p_actor_user_id uuid/, "role assignment RPC requires immutable actor identity");
assert.match(migration, /actor_user_id uuid not null/, "assignment audit persists immutable actor identity");
assert.match(migration, /before update or delete on public\.yard_role_assignment_audit/, "assignment audit is immutable");
assert.match(migration, /USER_STAFF_PROVISIONING_STARTED.*USER_STAFF_PROVISIONING_ACTIVATED/s, "Central Bank identity commit accepts the actual provisioning audit actions");
assert.match(migration, /downtime_central_commit_identity_event\(bigint, jsonb, text, text, jsonb\)/, "identity commit uses the Central Bank bigint version contract");
assert.match(migration, /enable row level security/, "all canonical role tables have RLS enabled");
assert.match(migration, /revoke all on public\.yard_roles from anon, authenticated/, "browser roles cannot read or mutate the role registry directly");
assert.doesNotMatch(migration, /insert into public\.yard_roles/i, "no unapproved role catalogue entries are seeded");

assert.match(definitionMigration, /yard_role_save_definition/);
assert.match(definitionMigration, /yard_role_definition_audit/);
assert.match(definitionMigration, /YARD_ROLE_VERSION_CONFLICT/);
assert.match(definitionMigration, /is distinct from/);
assert.match(definitionMigration, /Reassign every USER before retiring this YARD ROLE/);
assert.match(definitionMigration, /prevent_yard_role_definition_audit_mutation/);
assert.match(reassignmentMigration, /yard_role_reassign_user/);
assert.match(reassignmentMigration, /YARD_ROLE_ASSIGNMENT_VERSION_CONFLICT/);
assert.match(reassignmentMigration, /USER_YARD_ROLE_REASSIGNED/);
assert.match(reassignmentMigration, /USER_YARD_ROLE_RESTORED/);
assert.match(reassignmentMigration, /actor_user_id/);
assert.match(atomicAssignmentMigration, /yard_role_assign_existing_user/);
assert.match(atomicAssignmentMigration, /downtime_commit_central_bank/);
assert.match(atomicAssignmentMigration, /CENTRAL_BANK_VERSION_CONFLICT/);
assert.match(atomicAssignmentMigration, /drop function if exists public\.yard_role_reassign_user\(uuid,uuid,uuid,integer,uuid,text,text\)/, "old non-atomic reassignment RPC is removed");
assert.match(atomicAssignmentMigration, /p_expected_bank_version bigint/, "atomic assignment RPC checks the Central Bank version");
assert.match(settingsApi, /db\.rpc\("yard_role_assign_existing_user", atomicArgs\)/, "active first-time assignment uses the atomic USER/STAFF/Central Bank RPC");
assert.match(settingsApi, /db\.rpc\("yard_role_reassign_user", \{[\s\S]*?p_expected_bank_version: expectedBankVersion[\s\S]*?p_next_payload: nextPayload[\s\S]*?p_expected_version: Number\(body\.assignmentVersion\)/, "active reassignment uses the new atomic RPC signature and both optimistic-concurrency versions");
assert.match(settingsApi, /if \(isPending\)[\s\S]*?db\.rpc\("yard_role_assign_user"/, "pending provisioning remains staged and does not bypass the separate DEV activation gate");
assert.match(settingsApi, /payloadTarget\.yardRoleId = yardRoleId/, "the Central Bank USER snapshot is updated in the same transaction as active role assignment");
assert.equal((atomicAssignmentMigration.match(/Central Bank payload must contain the active linked USER\/STAFF and assigned YARD ROLE/g) || []).length, 2, 'both atomic assignment RPCs validate the active Central Bank USER/STAFF/ROLE tuple before mutation');
console.log("PASS: canonical YARD ROLE schema, atomic assignment, version checks, audit and service-role boundaries.");

