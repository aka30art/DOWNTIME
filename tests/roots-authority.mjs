import assert from "node:assert/strict";
import { resolveRootsAuthority, rootsCapabilities, canInteractWithRootsTarget, canAssignYardRoleToTarget } from "../supabase/functions/_shared/roots-authority.mjs";

const devId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const staffId = "33333333-3333-4333-8333-333333333333";
const dev = { username: "DEV", tier: "OWNER", userId: devId, enabled: true };
const ordinary = { username: "former-root", tier: "DEVACC", userId, staffId, enabled: true, status: "ACTIVE" };
const dev1Assignment = { user_id: userId, staff_id: staffId, roots_class: "DEV1", status: "ACTIVE" };

assert.equal(resolveRootsAuthority(dev, null, devId), "DEV", "DEV authority is derived from immutable bootstrap USER ID, without requiring STAFF");
assert.equal(resolveRootsAuthority({ ...dev, userId: "44444444-4444-4444-8444-444444444444" }, null, devId), null, "username and OWNER tier cannot impersonate immutable DEV");
assert.equal(resolveRootsAuthority(ordinary, null, devId), null, "legacy DEVACC does not imply protected ROOTS");
assert.equal(resolveRootsAuthority(ordinary, dev1Assignment, devId), "DEV1");
assert.equal(resolveRootsAuthority({ ...ordinary, tier: "ADMIN" }, { ...dev1Assignment, roots_class: "ADMIN" }, devId), "ADMIN");
assert.equal(resolveRootsAuthority({ ...ordinary, enabled: false }, dev1Assignment, devId), null, "disabled USER loses ROOTS authority");
assert.equal(resolveRootsAuthority({ ...ordinary, status: "PROVISIONING" }, dev1Assignment, devId), null, "non-active USER loses ROOTS authority");
assert.equal(resolveRootsAuthority({ ...ordinary, staffId: "44444444-4444-4444-8444-444444444444" }, dev1Assignment, devId), null, "mismatched STAFF cannot receive ROOTS");
assert.equal(resolveRootsAuthority(ordinary, { ...dev1Assignment, status: "REVOKED" }, devId), null, "revoked ROOTS assignment grants no authority");
assert.equal(resolveRootsAuthority(ordinary, { ...dev1Assignment, user_id: devId }, devId), null, "mismatched USER cannot receive ROOTS");

assert.deepEqual(rootsCapabilities("DEV"), {
  canBrowseRoots: true, canAssignDev1: true, canAssignAdmin: true, canManageYardRoles: true,
  hasAutomaticDepartmentManage: true, canReclassifyRoots: true, canRevokeRoots: true,
});
assert.equal(rootsCapabilities("DEV1").canBrowseRoots, false);
assert.equal(rootsCapabilities("DEV1").canAssignAdmin, true);
assert.equal(rootsCapabilities("DEV1").canAssignDev1, false);
assert.equal(rootsCapabilities("DEV1").canManageYardRoles, true);
assert.equal(rootsCapabilities("ADMIN").canAssignAdmin, false);
assert.equal(rootsCapabilities("ADMIN").canManageYardRoles, true);
assert.equal(rootsCapabilities("ADMIN").hasAutomaticDepartmentManage, true);

assert.equal(canInteractWithRootsTarget("DEV", "DEV1"), true);
assert.equal(canInteractWithRootsTarget("DEV1", "DEV"), false);
assert.equal(canInteractWithRootsTarget("ADMIN", "DEV"), false);
assert.equal(canInteractWithRootsTarget("ADMIN", "DEV1"), false);
assert.equal(canInteractWithRootsTarget("ADMIN", "ADMIN"), false);

assert.equal(canAssignYardRoleToTarget("DEV", null), true);
assert.equal(canAssignYardRoleToTarget("DEV1", null), true);
assert.equal(canAssignYardRoleToTarget("ADMIN", null), true);
assert.equal(canAssignYardRoleToTarget("DEV", "DEV1"), true);
assert.equal(canAssignYardRoleToTarget("DEV", "ADMIN"), true);
assert.equal(canAssignYardRoleToTarget("DEV1", "ADMIN"), false);
assert.equal(canAssignYardRoleToTarget("ADMIN", "DEV1"), false);
assert.equal(canAssignYardRoleToTarget("ADMIN", "ADMIN"), false);
assert.equal(canAssignYardRoleToTarget("DEV", "DEV", true), false);
assert.equal(canAssignYardRoleToTarget(null, null), false);

console.log("PASS: immutable ROOTS bootstrap, role separation, YARD ROLE assignment boundaries, capabilities and isolation.");
