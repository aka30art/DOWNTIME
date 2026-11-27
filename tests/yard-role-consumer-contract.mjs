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
assert.match(central, /const management=resolvedYardRole\.departments\.Management/);
assert.match(central, /Management ENTER permission is required to add operational records/);
assert.match(central, /Management EDIT permission is required to change operational records/);
assert.match(central, /Management MANAGE permission is required to remove operational records/);
assert.match(rm, /canYardRolePerform\(resolvedYardRole, "R&M", "VIEW"\)/);
assert.match(rm, /canYardRolePerform\(resolvedYardRole, "R&M", "ENTER"\)/);
assert.match(rm, /canYardRolePerform\(resolvedYardRole, "R&M", "EDIT"\)/);
assert.match(rm, /canYardRolePerform\(resolvedYardRole, "R&M", "MANAGE"\)/);
assert.match(gatelog, /canYardRolePerform\(resolvedYardRole,"Traffic","VIEW"\)/);
assert.match(gatelog, /canYardRolePerform\(resolvedYardRole,"Traffic","ENTER"\)/);
assert.match(gatelog, /canYardRolePerform\(resolvedYardRole,"Traffic","EDIT"\)/);
assert.match(gatelog, /canYardRolePerform\(resolvedYardRole,"Traffic","MANAGE"\)/);
assert.match(hub, /resolveYardRolePermissions/);
assert.match(shell, /management\.enter===true/);
assert.match(shell, /management\.edit===true/);
assert.match(shell, /management\.manage===true/);

for (const [name, source] of [["Central Bank", central], ["R&M", rm], ["GATELOG", gatelog]]) {
  assert.doesNotMatch(source, /canYardRolePerform\(resolvedYardRole,\s*["']SCPL["']/,
    name + " must not consume SCPL permissions as a substitute for its own department");
  assert.doesNotMatch(source, /canYardRolePerform\(resolvedYardRole,\s*["']SCFL["']/,
    name + " must not consume SCFL permissions as a substitute for its own department");
}

console.log("PASS: YARD ROLE consumer map enforces Management, R&M and Traffic independently; SCPL and SCFL remain isolated pending dedicated consumers.");
