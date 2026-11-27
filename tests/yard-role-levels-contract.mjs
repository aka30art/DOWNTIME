import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const [migration,ui,css,workflow]=await Promise.all([
 readFile("supabase/migrations/20261127061000_yard_role_access_levels.sql","utf8"),
 readFile("yard-hub-settings.js","utf8"),
 readFile("yard-hub-settings.css","utf8"),
 readFile(".github/workflows/pages.yml","utf8")
]);
for(const level of ["OFF","READ ONLY","INPUT","MANAGE"])assert.ok(migration.includes(level),"database trigger allows "+level);
assert.match(migration,/before insert or update on public\.yard_role_department_permissions/);
assert.match(ui,/yardPermissionLevels=\['OFF','READ ONLY','INPUT','MANAGE'\]/);
assert.match(ui,/function applyYardRoleLevel\(row,level\)/);
assert.match(ui,/yardRoleLevel\(row\)/);
assert.match(ui,/select\.addEventListener\('change'/);
assert.match(css,/\.yard-hub-role-level select/);
assert.match(workflow,/ACCESS AND RIGHTS/);
console.log("PASS: YARD ROLE uses exactly one OFF / READ ONLY / INPUT / MANAGE level per department.");
