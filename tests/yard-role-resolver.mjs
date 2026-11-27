import assert from "node:assert/strict";
import { canYardRolePerform, resolveYardRolePermissions, YARD_ROLE_DEPARTMENTS, YARD_ROLE_PERMISSION_KEYS } from "../supabase/functions/_shared/yard-role-resolver.mjs";

const role = { id: "11111111-1111-4111-8111-111111111111", name: "Test Role", status: "ACTIVE" };
const rows = [
  { yard_role_id: role.id, department: "SCPL", can_view: true, can_enter: false, can_edit: false, can_manage: false },
  { yard_role_id: role.id, department: "R&M", can_view: false, can_enter: true, can_edit: false, can_manage: false },
  { yard_role_id: role.id, department: "Management", can_view: false, can_enter: false, can_edit: true, can_manage: false },
  { yard_role_id: role.id, department: "SCFL", can_view: false, can_enter: false, can_edit: false, can_manage: true },
  { yard_role_id: role.id, department: "Traffic", can_view: true, can_enter: true, can_edit: true, can_manage: true },
];
const resolved = resolveYardRolePermissions(role, rows);
assert.deepEqual(YARD_ROLE_PERMISSION_KEYS, ["view", "enter", "edit", "manage"]);
assert.deepEqual(YARD_ROLE_DEPARTMENTS, ["SCPL", "R&M", "Management", "SCFL", "Traffic"]);
assert.equal(canYardRolePerform(resolved, "SCPL", "VIEW"), true);
assert.equal(canYardRolePerform(resolved, "SCPL", "ADD"), false);
assert.equal(canYardRolePerform(resolved, "R&M", "VIEW"), false);
assert.equal(canYardRolePerform(resolved, "R&M", "ENTER"), true);
assert.equal(canYardRolePerform(resolved, "R&M", "EDIT"), false);
assert.equal(canYardRolePerform(resolved, "Management", "EDIT"), true);
assert.equal(canYardRolePerform(resolved, "Management", "VIEW"), false);
assert.equal(canYardRolePerform(resolved, "SCFL", "MANAGE"), true);
assert.equal(canYardRolePerform(resolved, "SCFL", "DELETE"), true);
assert.equal(canYardRolePerform(resolved, "SCFL", "VIEW"), false);
assert.equal(canYardRolePerform(resolved, "Traffic", "VIEW"), true);
assert.equal(canYardRolePerform(resolved, "Traffic", "ENTER"), true);
assert.equal(canYardRolePerform(resolved, "Traffic", "EDIT"), true);
assert.equal(canYardRolePerform(resolved, "Traffic", "MANAGE"), true);
assert.equal(canYardRolePerform(resolved, "UNKNOWN", "VIEW"), false);
assert.equal(canYardRolePerform(resolved, "ROOTS", "MANAGE"), false);
assert.throws(() => resolveYardRolePermissions({ ...role, status: "RETIRED" }, []), /not active/);
assert.throws(() => resolveYardRolePermissions(role, rows.slice(0, 4)), /exactly one independent permission record/);
assert.throws(() => resolveYardRolePermissions(role, [...rows, rows[0]]), /only one permission record/);
assert.throws(() => resolveYardRolePermissions(role, rows.map((row, i) => i ? row : ({ ...row, can_view: "true" }))), /explicit boolean/);
assert.throws(() => resolveYardRolePermissions(role, rows.map((row, i) => i ? row : ({ ...row, department: "GATELOG" }))), /not in the approved department catalogue/);
assert.throws(() => resolveYardRolePermissions({ id: "bad", status: "ACTIVE" }, []), /immutable UUID/);
console.log("PASS: YARD ROLE resolver enforces independent View / Enter / Edit / Manage permissions for all five departments.");
