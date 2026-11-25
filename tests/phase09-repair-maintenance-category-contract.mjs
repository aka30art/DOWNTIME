import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const admin=readFileSync("central-bank-admin.html","utf8");
const edge=readFileSync("supabase/functions/central-config-admin/index.ts","utf8");
const rmHtml=readFileSync("repair-maintenance.html","utf8");
const rmApp=readFileSync("repair-maintenance-app.js","utf8");
const rmLoader=readFileSync("repair-maintenance-structure.js","utf8");

for(const key of ["KIVERCO_PICKING_LINE","TANNA_SHREDDER","FORKLIFT","TELEHANDLER","EXCAVATORS_360","OTHER_EQUIPMENT"]){
 assert.ok(edge.includes('key: "'+key+'"'),"server default preserves stable machinery key "+key);
 assert.ok(rmApp.includes("key:'"+key+"'"),"R&M app retains operational machine key "+key);
}
assert.match(admin,/id="repairMaintenanceCategoryEntries"/,"Data Center exposes R&M category editor");
assert.match(admin,/id="newRmsCategoryTitle"/,"Data Center allows a custom R&M category title");
assert.match(admin,/function renderRepairMaintenanceCategories\(/,"Data Center renders the R&M category list");
assert.match(admin,/function collectRepairMaintenanceCategories\(/,"R&M category edits are serialized into the configuration");
assert.match(admin,/function addRmsCategory\(/,"R&M custom categories can be added");
assert.match(admin,/function removeRmsCategory\(/,"R&M categories can be hidden or removed");
assert.match(edge,/function normalizeRepairMaintenanceCategories\(/,"server validates R&M category configuration");
assert.match(edge,/New R&M category keys must use the CUSTOM_ prefix/,"server distinguishes menu-only categories from native data types");
assert.match(edge,/icon: base\?\.icon \|\| "assets\/rm-icons\/other_equipment\.svg"/,"custom categories use a safe built-in icon");
assert.match(rmHtml,/id="customCategoryView"/,"R&M has a dedicated placeholder workspace for custom categories");
assert.match(rmHtml,/repair-maintenance-structure\.js/,"R&M loads the published category configuration adapter");
assert.match(rmHtml,/CENTRAL_CONFIG_ADMIN_API/,"R&M uses the central configuration endpoint");
assert.match(rmApp,/function applyMachineCategoryConfig\(/,"R&M applies published category labels dynamically");
assert.match(rmApp,/MACHINES\.splice\(0,MACHINES\.length/,"R&M preserves stable machine records while updating display metadata");
assert.match(rmApp,/window\.addEventListener\('yard-hub:application-structure'/,"R&M listens for the published application structure");
assert.match(rmApp,/function openCustomCategory\(/,"menu-only categories open a placeholder instead of calling operational APIs");
assert.match(rmLoader,/action:'yard-hub-menu'/,"R&M reads only the published structure");
assert.match(rmLoader,/repairMaintenanceCategories/,"R&M receives the category configuration");
console.log("Phase 09 R&M category administration contract passed.");
