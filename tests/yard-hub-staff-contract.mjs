import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile('index.html', 'utf8');
const staff = await readFile('yard-hub-staff.js', 'utf8');
const css = await readFile('yard-hub-staff.css', 'utf8');
const structure = await readFile('yard-hub-structure.js', 'utf8');
const settings = await readFile('yard-hub-settings.js', 'utf8');
const centralConfig = await readFile('supabase/functions/central-config-admin/index.ts', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

assert.match(html, /data-app="floor" type="button" aria-describedby="yardFloorStatus"/, 'STAFF MANAGEMENT has an enabled launcher using the existing floor module identity');
assert.match(html, /<strong>STAFF MANAGEMENT<\/strong>/, 'The launcher uses the approved STAFF MANAGEMENT title');
assert.ok(staff.includes("screen.id='yardHubStaffScreen'"), 'The staff workspace is available as a separate YARD HUB screen');
assert.match(html, /window\.YARD_HUB_STAFF_API='https:\/\/ygwfipksbbprqynvbklk\.supabase\.co\/functions\/v1\/yard-hub-staff-api'/, 'The browser is configured to use the isolated Staff API');
assert.match(html, /yard-hub-staff\.css\?v=20261126-1/, 'The isolated Staff stylesheet is loaded');
assert.match(html, /yard-hub-staff\.js\?v=20261126-1/, 'The isolated Staff client is loaded');
assert.match(html, /yard-hub-staff\.js\?v=20261126-1[\s\S]*?yard-hub-structure\.js/, 'The Staff client registers before the structure router');

for (const label of ['STAFF DIRECTORY', 'COMPANIES &amp; AGENCIES', 'YARD ROLES', 'AUDIT HISTORY']) {
  assert.ok(staff.includes(label), 'Staff Management contains ' + label);
}
for (const action of ['person-save', 'person-archive', 'company-save', 'company-archive', 'role-save', 'role-archive', 'audit']) {
  assert.ok(staff.includes("callApi('" + action + "'") || staff.includes("callApi('" + action + "',"),
    'Staff client uses the dedicated ' + action + ' API action');
}
assert.ok(staff.includes("staffType:type.value"), 'Staff classification is persisted as USER or STAFF');
assert.ok(staff.includes("linkedUsername:type.value==='USER'"), 'USER records carry a linked existing account reference');
assert.ok(staff.includes("person?.linked_username||''"), 'Existing account links are preserved for users without account-management rights');
assert.ok(staff.includes("window.YARD_HUB_SETTINGS?.openUsers") && staff.includes("window.YARD_HUB_SETTINGS.openUsers()"), 'Account creation and disabling are delegated to the existing USERS manager');
assert.ok(!staff.includes('DowntimeCentral.saveUser('), 'Staff Management never creates or updates login credentials directly');
assert.ok(!staff.includes('DowntimeCentral.deleteUser('), 'Staff Management never deletes YARD HUB login accounts');
assert.ok(!staff.includes('DowntimeCentral.saveStaff('), 'Staff Management does not write the DOWNTIME staff roster');
assert.ok(css.includes('#yardHub .yard-staff-screen'), 'Staff styles are scoped to the YARD HUB workforce screen');
assert.ok(!/^\s*(?:html|body|:root|main|button)\s*\{/m.test(css), 'Staff stylesheet does not add global selectors');

assert.match(structure, /if\(kind==='floor'\)[\s\S]*?button\.disabled=false[\s\S]*?yard-tile-active/, 'The protected STAFF MANAGEMENT tile is not hard-disabled by its module kind');
assert.match(structure, /kind==='floor'[\s\S]*?window\.YardHubStaff\?\.open\(\)/, 'The floor department opens the dedicated Staff workspace');
assert.match(centralConfig, /id: "floor", kind: "floor", title: "STAFF MANAGEMENT", description: "STAFF & YARD OPERATIONS", enabled: true, order: 1, protected: true/, 'STAFF MANAGEMENT is a protected published YARD HUB core department');
assert.match(centralConfig, /Protected core departments are additive defaults/, 'Older published menus restore missing protected core departments');
assert.match(settings, /window\.YARD_HUB_SETTINGS=\{[\s\S]*?openUsers\(\)/, 'The workforce client can hand off to the existing account manager');

assert.ok(packageJson.scripts['test:smoke'].includes('npm run test:yard-hub-staff'), 'Staff contracts are part of the full smoke suite');
console.log('YARD HUB STAFF MANAGEMENT UI and integration contract: PASS');
