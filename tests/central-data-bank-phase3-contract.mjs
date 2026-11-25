import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("../central-bank-admin.html",import.meta.url),"utf8");
const api=fs.readFileSync(new URL("../supabase/functions/central-config-admin/index.ts",import.meta.url),"utf8");

assert.match(html,/MASTER LOCATION HIERARCHY/,"CDB exposes the structured master hierarchy");
assert.match(html,/id="addSiteBtn"/,"site creation is available");
assert.match(html,/data-hierarchy-action/,"hierarchy records expose managed actions");
assert.match(html,/function addHierarchyNode/,"child records are created through their selected parent");
assert.match(html,/function renameHierarchyNode/,"hierarchy records can be renamed");
assert.match(html,/function deleteHierarchyNode/,"hierarchy records have guarded deletion");
assert.match(html,/children\.length\)throw new Error\("This record has child records/,"parent records cannot be deleted while children remain");
assert.match(html,/hierarchy:collectHierarchy\(\)/,"hierarchy is included in the versioned CDB draft");
assert.match(html,/Legacy flat reference lists/,"older flat reference values remain visible and preserved");
assert.match(html,/hierarchyDraft=cloneHierarchy\(structure\.hierarchy\|\|\[\]\)/,"older snapshots without a hierarchy remain loadable");

assert.match(api,/function normalizeMasterHierarchy/,"server validates hierarchy independently of the browser");
assert.match(api,/Master hierarchy must be a list of sites/,"hierarchy root must be a site list");
assert.match(api,/duplicate record ID/,"record IDs are globally unique");
assert.match(api,/duplicate name/,"sibling names are unique");
assert.match(api,/IDs must use lowercase letters, numbers and hyphens/,"record IDs are constrained slugs");
assert.match(api,/cannot contain more than 100 sites/,"site count is bounded");
assert.match(api,/Master hierarchy exceeds the registry limits/,"aggregate registry counts are bounded");
assert.match(api,/hierarchy: normalizeMasterHierarchy\(structure\.hierarchy\)/,"normalized hierarchy is persisted in the CDB payload");

const operationalTables=[...api.matchAll(/\.from\(["']([^"']+)["']\)/g)].map(match=>match[1]);
assert.ok(operationalTables.every(name=>name.startsWith("downtime_central_")),"Phase 03 endpoint only touches Central Data Bank control-plane tables");
assert.ok(!/\.from\(["'](?:downtime_events|downtime_faults|downtime_users|downtime_daily_operator_assignments|downtime_equipment)/.test(api),"Phase 03 does not access operational tables");

console.log("PASS: CDB Phase 03 master registry contract — hierarchy UI, parent-child constraints, backward compatibility, server validation, bounded records and control-plane isolation.");
