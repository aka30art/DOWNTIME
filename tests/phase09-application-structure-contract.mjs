import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const admin = readFileSync("central-bank-admin.html", "utf8");
const edge = readFileSync("supabase/functions/central-config-admin/index.ts", "utf8");
const index = readFileSync("index.html", "utf8");
const runtime = readFileSync("yard-hub-structure.js", "utf8");
const css = readFileSync("yard-hub-structure.css", "utf8");

assert.match(admin, /data-section="application-structure"/, "CDB navigation exposes Application Structure");
assert.match(admin, /id="view-application-structure"/, "Application Structure has a dedicated page");
assert.match(admin, /id="newYardHubDepartmentTitle"/, "Administrator can add a department");
assert.match(admin, /id="addYardHubDepartmentBtn"/, "Department creation control is present");
assert.match(admin, /function collectYardHubStructure\(/, "Department and sub-menu configuration is collected");
assert.match(admin, /function addYardHubSubmenu\(/, "Sub-menu creation is supported");
assert.match(admin, /yardHubMenu:collectYardHubStructure\(\)/, "YARD HUB structure is saved in the versioned configuration payload");
assert.match(admin, /YARD HUB launcher structure will update for authenticated users/, "Publish confirmation describes the live YARD HUB effect");
assert.match(admin, /CORE DEPARTMENT/, "Protected core departments cannot be removed");
assert.match(admin, /titleInput.disabled=true;descriptionInput.disabled=true/, "DOWNTIME launcher identity and label remain locked");
assert.match(admin, /add.disabled=entry.kind==="downtime"\|\|entry.kind==="gatelog"\|\|entry.kind==="repairs-maintenance"\|\|entry.kind==="hub-settings"/, "DOWNTIME, GATELOG, R&M and HUB SETTINGS cannot be redirected through configurable sub-menus");
assert.match(edge, /base\?\.kind === "downtime" \? base\.title/, "Server enforces the immutable DOWNTIME launcher title");
assert.match(edge, /base\?\.kind === "downtime" \|\| base\?\.kind === "hub-settings"/, "Server prevents configurable sub-menus from intercepting protected core routes");

assert.match(edge, /function normalizeYardHubMenu\(/, "Server validates YARD HUB structure");
assert.match(edge, /between 1 and 100 departments/, "Server enforces department count limits");
assert.match(edge, /no more than 30 sub-menu items/, "Server enforces sub-menu count limits");
assert.match(edge, /yardHubMenu: normalizeYardHubMenu\(input\.yardHubMenu\)/, "Server normalizes the new config domain");
assert.match(edge, /yardHubDepartments: config\.yardHubMenu\.departments\.length/, "Server validation reports department totals");
assert.match(edge, /yardHubSubmenus: config\.yardHubMenu\.departments\.reduce/, "Server validation reports sub-menu totals");
assert.match(edge, /repairMaintenanceCategories: normalizeRepairMaintenanceCategories\(input\.repairMaintenanceCategories\)/, "Server normalizes R&M machinery category configuration");
assert.match(edge, /repairMaintenanceCategories: config\.repairMaintenanceCategories\.categories\.length/, "Server validation reports R&M category totals");
assert.match(edge, /publishedRepairMaintenanceCategories/, "Authenticated menu response includes published R&M categories");
assert.match(admin, /"yardHubDepartments","yardHubSubmenus","repairMaintenanceCategories"/, "Administrator sees YARD HUB and R&M structure counts in validation results");
assert.match(admin, /repairMaintenanceCategories:collectRepairMaintenanceCategories\(\)/, "R&M category configuration is included in saved drafts");
assert.match(admin, /function addRmsCategory\(/, "Administrator can add menu-only R&M categories");
assert.match(admin, /function removeRmsCategory\(/, "Administrator can hide or remove R&M categories");
assert.match(edge, /action === "yard-hub-menu"/, "Authenticated read-only launcher action exists");
assert.match(edge, /publishedVersion: Number\(configState\.published_version\)/, "Runtime receives published version only");
const publicRead = edge.indexOf('if (action === "yard-hub-menu")');
const adminGate = edge.indexOf('if (!isDevRoot && !isDevacc)');
assert.ok(publicRead > -1 && adminGate > publicRead, "Read-only published menu action is handled before the CDB administrator-only gate");

assert.match(index, /CENTRAL_CONFIG_ADMIN_API/, "Runtime receives the central configuration endpoint");
assert.match(index, /yard-hub-structure\.js/, "Runtime structure controller is loaded");
assert.match(index, /yard-hub-structure\.css/, "Generated workspace styling is loaded");
assert.match(runtime, /action:'yard-hub-menu'/, "Runtime reads the published menu through the authenticated endpoint");
assert.match(runtime, /makeCustomTile\(/, "New departments generate the shared YARD HUB tile component");
assert.match(runtime, /openWorkspace\(/, "Custom departments and sub-menus open generated workspaces");
assert.match(runtime, /stopImmediatePropagation\(\)/, "Sub-menu navigation safely intercepts native launch handlers");
assert.match(css, /yard-structure-link/, "Generated sub-menu entries have a consistent presentation");

console.log("Phase 09 application structure contract passed.");
