import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const admin = readFileSync("central-bank-admin.html", "utf8");
const edge = readFileSync("supabase/functions/central-config-admin/index.ts", "utf8");

assert.match(admin, /id="applicationGeneratorPanel"/, "Central Data Bank exposes the Phase 10 generator");
assert.match(admin, /id="generateDepartmentBtn"/, "Administrator can generate a department");
assert.match(admin, /id="generateModuleBtn"/, "Administrator can generate a module");
assert.match(admin, /function generateDepartment\(/, "Department generation creates a standard workspace blueprint");
assert.match(admin, /function generateModule\(/, "Module generation creates a linked submenu blueprint");
assert.match(admin, /applicationGenerator:collectApplicationGenerator\(\)/, "Generated blueprints are included in the versioned draft");
assert.match(admin, /status:"placeholder"/, "Generated workspaces remain placeholders");
assert.match(admin, /generatedDepartments.*generatedModules/, "Validation summary reports generated output");

assert.match(edge, /function normalizeApplicationGenerator\(/, "Server normalizes generated application blueprints");
assert.match(edge, /Generated department blueprint must reference an existing custom YARD HUB department/, "Department blueprints must reference a custom department");
assert.match(edge, /Generated module blueprint must reference an existing sub-menu entry/, "Module blueprints must reference a real submenu");
assert.match(edge, /Generated modules cannot target protected core departments/, "Protected core routes cannot receive generated modules");
assert.match(edge, /Generated workspaces must remain placeholders until separately implemented/, "Server prevents generated placeholders from claiming live functionality");
assert.match(edge, /generatedDepartments: config\.applicationGenerator\.items\.filter/, "Server validation reports generated department totals");
assert.match(edge, /generatedModules: config\.applicationGenerator\.items\.filter/, "Server validation reports generated module totals");
assert.doesNotMatch(edge, /CREATE TABLE|ALTER TABLE|DROP TABLE/i, "Phase 10 does not add database migrations or operational table changes");

console.log("Phase 10 application and module generator contract passed.");
