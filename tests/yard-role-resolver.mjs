import assert from "node:assert/strict";
import {
  canYardRolePerform,
  resolveYardRolePermissions,
  YARD_ROLE_DEPARTMENTS,
  YARD_ROLE_LEVELS,
} from "../supabase/functions/_shared/yard-role-resolver.mjs";

const role = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test Role",
  status: "ACTIVE",
};
const resolved = resolveYardRolePermissions(role, [
  { yard_role_id: role.id, department: "SCPL", access_level: "READ_ONLY" },
  { yard_role_id: role.id, department: "R&M", access_level: "INPUT" },
  { yard_role_id: role.id, department: "Management", access_level: "MANAGE" },
  { yard_role_id: role.id, department: "SCFL", access_level: "INPUT" },
  { yard_role_id: role.id, department: "Traffic", access_level: "OFF" },
]);
assert.deepEqual(YARD_ROLE_LEVELS, ["OFF", "READ_ONLY", "INPUT", "MANAGE"]);
assert.deepEqual(YARD_ROLE_DEPARTMENTS, ["SCPL", "R&M", "Management", "SCFL", "Traffic"]);
assert.equal(canYardRolePerform(resolved, "SCPL", "VIEW"), true);
assert.equal(canYardRolePerform(resolved, "SCPL", "ADD"), false);
assert.equal(canYardRolePerform(resolved, "R&M", "VIEW"), true);
assert.equal(canYardRolePerform(resolved, "R&M", "ADD"), true);
assert.equal(canYardRolePerform(resolved, "R&M", "DELETE"), false);
assert.equal(canYardRolePerform(resolved, "Management", "DELETE"), true);
assert.equal(canYardRolePerform(resolved, "SCFL", "EDIT"), true);
assert.equal(canYardRolePerform(resolved, "Traffic", "VIEW"), false);
assert.equal(canYardRolePerform(resolved, "UNKNOWN", "VIEW"), false);
assert.equal(canYardRolePerform(resolved, "GATELOG", "VIEW"), false);
assert.equal(canYardRolePerform(resolved, "Traffic", "ADMIN"), false);
assert.throws(() => resolveYardRolePermissions({ ...role, status: "RETIRED" }, []), /not active/);
assert.throws(() => resolveYardRolePermissions(role, [
  { yard_role_id: role.id, department: "SCPL", access_level: "INPUT" },
  { yard_role_id: role.id, department: "SCPL", access_level: "MANAGE" },
  { yard_role_id: role.id, department: "R&M", access_level: "OFF" },
  { yard_role_id: role.id, department: "Management", access_level: "OFF" },
  { yard_role_id: role.id, department: "SCFL", access_level: "OFF" },
  { yard_role_id: role.id, department: "Traffic", access_level: "OFF" },
]), /only one access level/);
assert.throws(() => resolveYardRolePermissions(role, [
  { yard_role_id: role.id, department: "SCPL", access_level: "INPUT" },
]), /exactly one access level for each approved department/);
assert.throws(() => resolveYardRolePermissions(role, [
  { yard_role_id: role.id, department: "SCPL", access_level: "INPUT" },
  { yard_role_id: role.id, department: "R&M", access_level: "OFF" },
  { yard_role_id: role.id, department: "Management", access_level: "OFF" },
  { yard_role_id: role.id, department: "SCFL", access_level: "OFF" },
  { yard_role_id: role.id, department: "GATELOG", access_level: "MANAGE" },
]), /not in the approved department catalogue/);
assert.throws(() => resolveYardRolePermissions(role, [
  { yard_role_id: role.id, department: "SCPL", access_level: "ADMIN" },
]), /access level is invalid/);
assert.throws(() => resolveYardRolePermissions({ id: "bad", status: "ACTIVE" }, []), /immutable UUID/);

// A ROOTS classification is not a YARD ROLE level and cannot be inferred here.
assert.equal(canYardRolePerform(resolved, "ROOTS", "MANAGE"), false);

console.log("PASS: canonical YARD ROLE resolver enforces OFF / READ_ONLY / INPUT / MANAGE semantics.");
