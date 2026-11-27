import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const [resolver, central, rm, gatelog, hub, shell] = await Promise.all([
  read("supabase/functions/_shared/yard-role-resolver.mjs"),
  read("supabase/functions/central-bank/index.ts"),
  read("supabase/functions/repair-maintenance-api/index.ts"),
  read("supabase/functions/gatelog-api/index.ts"),
  read("supabase/functions/yard-hub-settings-api/index.ts"),
  read("index.html"),
]);

assert.match(resolver, /YARD_ROLE_DEPARTMENTS = Object\.freeze\(\["SCPL", "R&M", "Management", "SCFL", "Traffic"\]\)/);
assert.match(resolver, /SCPL: "DOWNTIME"/);
assert.match(resolver, /"R&M": "R&M"/);
assert.match(resolver, /Management: "Staff & Management"/);
assert.match(resolver, /SCFL: null/);
assert.match(resolver, /Traffic: "GATELOG"/);
assert.match(central, /resolveYardRoleModulePermissions\(resolvedYardRole\)/);
assert.match(central, /const downtime=moduleRights\.DOWNTIME/);
assert.match(central, /const staffManagement=moduleRights\["Staff & Management"\]/);
assert.match(central, /SCPL INPUT permission is required to add DOWNTIME records/);
assert.match(central, /SCPL EDIT permission is required to change DOWNTIME records/);
assert.match(central, /SCPL MANAGE permission is required to remove DOWNTIME records/);
assert.match(central, /canManageSettings:downtime\.manage===true/);
assert.match(central, /canEnterStaff:staffManagement\.enter===true/);
assert.match(central, /canEditStaff:staffManagement\.edit===true/);
assert.match(central, /canManageStaff:staffManagement\.manage===true/);
assert.match(central, /canViewStaff:staffManagement\.view===true/);
assert.match(central, /canManageAssignments:staffManagement\.manage===true/);
assert.match(central, /canManageUsers:false,canViewUsers:false/);
assert.match(central, /canManageAccessRights:false/);
assert.match(rm, /canYardRolePerform\(resolvedYardRole, "R&M", "VIEW"\)/);
assert.match(rm, /canYardRolePerform\(resolvedYardRole, "R&M", "ENTER"\)/);
assert.match(rm, /canYardRolePerform\(resolvedYardRole, "R&M", "EDIT"\)/);
assert.match(rm, /canYardRolePerform\(resolvedYardRole, "R&M", "MANAGE"\)/);
assert.match(gatelog, /canYardRolePerform\(resolvedYardRole,"Traffic","VIEW"\)/);
assert.match(gatelog, /canYardRolePerform\(resolvedYardRole,"Traffic","ENTER"\)/);
assert.match(gatelog, /canYardRolePerform\(resolvedYardRole,"Traffic","EDIT"\)/);
assert.match(gatelog, /canYardRolePerform\(resolvedYardRole,"Traffic","MANAGE"\)/);
assert.match(hub, /resolveYardRolePermissions/);
assert.match(shell, /yardRolePermissions\?\.SCPL\?\.enter===true/);
assert.match(shell, /yardRolePermissions\?\.SCPL\?\.edit===true/);
assert.match(shell, /yardRolePermissions\?\.SCPL\?\.manage===true/);
assert.match(shell, /management\?\.enter===true/);
assert.match(shell, /management\?\.edit===true/);
assert.match(shell, /management\?\.manage===true/);
assert.match(shell, /canAccessDowntimeModule\(\)/);
assert.match(shell, /function launchStaffWorkspace\([\s\S]*?openSettingsPanel\('staff'\)/);
const staffWorkspaceSource=shell.match(/function launchStaffWorkspace\([\s\S]*?window\.launchStaffWorkspace=launchStaffWorkspace;/)?.[0]||'';
assert.ok(staffWorkspaceSource&&!staffWorkspaceSource.includes('launchDowntime('),'Staff & Management opens independently of DOWNTIME access');
assert.match(shell, /function settingsAccess\(section\)[\s\S]*?if\(section==='staff'\)return isStaffModuleAutoAccess\(\)\|\|permission\('canViewStaff'\)/);
assert.match(shell, /data-app="check-sheets" type="button" disabled/);
assert.match(shell, /SCFL has no connected module yet\. DAILY remains disabled/);
for (const [name, source] of [["Central Bank", central], ["R&M", rm], ["GATELOG", gatelog]]) {
  assert.doesNotMatch(source, /canYardRolePerform\(resolvedYardRole,\s*["']SCFL["']/,
    name + " must not treat SCFL as a connected application module");
}

assert.match(central, /priv\.canManageUsers=\["DEV","DEV1","ADMIN"\]\.includes\(rootsAuthority\|\|""\)\|\|\(hasCanonicalIdentity&&resolvedYardRole&&moduleRights\["Staff & Management"\]\?\.manage===true\)/,
  "Management MANAGE delegates ordinary USER directory administration without granting ROOTS governance");
assert.match(central, /if\(!priv\.canManageUsers\).*provision USER \+ STAFF identities/,
  "ordinary USER/STAFF provisioning is gated by Management MANAGE or DEV");
assert.match(central, /if\(!priv\.canManageUsers\).*activate USER identities/,
  "ordinary USER activation is gated by Management MANAGE or DEV");
assert.match(central, /if\(!isRootAuthority&&\(hasCanonicalIdentity\?!moduleRights\.DOWNTIME\.manage/,
  "DEV1 and protected ROOTS bypass legacy tier checks for daily operator assignment and unlock");
assert.match(hub, /resolveYardRoleModulePermissions/);
assert.match(hub, /canManageStaffDirectory = rootCapabilities\.hasAutomaticDepartmentManage \|\| staffRights\.manage === true/);
assert.match(hub, /if \(!canViewStaffDirectory\).*USER directory/);
assert.match(hub, /managerAssignsOrdinaryUser = canManageStaffDirectory && !targetRootsAuthority && !isImmutableDevTarget/);
assert.match(hub, /canAssignUserRoles: canManageStaffDirectory/);
assert.match(read("yard-hub-settings.js") ? await read("yard-hub-settings.js") : "", /openStaffUserManagement/);

console.log("PASS: YARD ROLE department-to-module mapping is isolated; DOWNTIME uses SCPL, Staff & Management uses Management, R&M uses R&M, GATELOG uses Traffic, SCFL and DAILY remain unconnected.");
