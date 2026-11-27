import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(path, "utf8");
const [hubApi, centralApi, gatelogApi, rmApi, settingsUi, index] = await Promise.all([
  read("supabase/functions/yard-hub-settings-api/index.ts"),
  read("supabase/functions/central-bank/index.ts"),
  read("supabase/functions/gatelog-api/index.ts"),
  read("supabase/functions/repair-maintenance-api/index.ts"),
  read("yard-hub-settings.js"),
  read("index.html"),
]);

assert.match(hubApi, /resolveRootsAuthority\(user, rootsAssignment, bootstrapRow\?\.user_id/);
assert.match(hubApi, /action === "roots-state"/);
assert.match(hubApi, /action === "roots-manage"/);
assert.match(hubApi, /rootCapabilities\.canAssignDev1/);
assert.match(hubApi, /rootCapabilities\.canAssignAdmin/);
assert.match(hubApi, /rootCapabilities\.canManageYardRoles/);
assert.match(hubApi, /canAssignYardRoleToTarget\(rootsAuthority, targetRootsAuthority, isImmutableDevTarget\)/);
assert.match(hubApi, /Only DEV may assign or change a YARD ROLE for another protected ROOTS identity/);
assert.match(settingsUi, /rootAuthority\(\)==='DEV'/);
assert.match(hubApi, /if \(!isProtectedRoot\) return json\(\{ error: "YARD HUB SETTINGS is restricted to protected ROOTS identities\."/);
assert.match(hubApi, /yard_role_department_permissions"\)\.select\("yard_role_id,department,can_view,can_enter,can_edit,can_manage"/);

assert.match(centralApi, /resolveRootsAuthority\(currentUser,rootsAssignment,rootsBootstrap\?\.user_id/);
assert.match(centralApi, /const isDevRoot=rootsAuthority==="DEV"/);
assert.match(centralApi, /const isRootAuthority=\["DEV","DEV1","ADMIN"\]/);

assert.match(gatelogApi, /resolveRootsAuthority\(user,rootsLookup\.data,rootsBootstrap\.user_id\)/);
assert.match(gatelogApi, /canYardRolePerform\(resolvedYardRole,"Traffic","VIEW"\)/);
assert.match(gatelogApi, /canYardRolePerform\(resolvedYardRole,"Traffic","ENTER"\)/);
assert.match(gatelogApi, /canYardRolePerform\(resolvedYardRole,"Traffic","EDIT"\)/);
assert.match(gatelogApi, /canYardRolePerform\(resolvedYardRole,"Traffic","MANAGE"\)/);
assert.match(gatelogApi, /Traffic VIEW permission is required/);
assert.match(gatelogApi, /Traffic MANAGE permission is required/);
assert.doesNotMatch(gatelogApi, /select\("yard_role_id,department,access_level"\)/);

assert.match(rmApi, /resolveRootsAuthority\(user, rootsAssignment, rootsBootstrap\.user_id\)/);
assert.match(rmApi, /canYardRolePerform\(resolvedYardRole, "R&M", "VIEW"\)/);
assert.match(rmApi, /canYardRolePerform\(resolvedYardRole, "R&M", "ENTER"\)/);
assert.match(rmApi, /canYardRolePerform\(resolvedYardRole, "R&M", "EDIT"\)/);
assert.match(rmApi, /canYardRolePerform\(resolvedYardRole, "R&M", "MANAGE"\)/);
assert.match(rmApi, /permissions\.canEditRepairMaintenance !== true/);
assert.match(rmApi, /permissions\.canDeleteRepairMaintenance !== true/);
assert.doesNotMatch(rmApi, /select\("yard_role_id,department,access_level"\)/);

assert.match(index, /id="yardHubSettingsRoots"/);
assert.match(index, /id="yardHubRootsView"/);
assert.match(index, /id="yardHubRootAssignments"/);
assert.match(index, /id="yardHubRolePermissions"/);
assert.match(settingsUi, /ASSIGN ADMIN ROOTS/);
assert.match(settingsUi, /ASSIGN \/ CHANGE ROLE/);
assert.match(settingsUi, /function loadRootsState/);
assert.match(settingsUi, /function manageRoot/);
assert.match(settingsUi, /function isProtectedRoot\(\)/);

console.log("PASS: ROOTS, YARD ROLE, GATELOG and R&M authorization surfaces use the unified boolean permission model.");
