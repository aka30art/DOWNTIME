import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile('index.html', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const loginSmoke = await readFile('tests/login-smoke.mjs', 'utf8');
const structure = await readFile('yard-hub-structure.js', 'utf8');
const visualSystem = await readFile('yard-hub-visual-system.css', 'utf8');
const rmHtml = await readFile('repair-maintenance.html', 'utf8');

assert.match(html, /<section id="yardHub" class="yard-hub" hidden/, 'YARD HUB exists as a separate initially hidden authenticated surface');
assert.match(html, /YARD OPERATIONS CORE/, 'YARD HUB carries the approved platform identity');
assert.match(html, /id="yardHubUsername"/, 'YARD HUB displays the authenticated user');
assert.match(html, /id="yardHubLogoutBtn"/, 'YARD HUB provides a sign-out action');
assert.match(html, /id="launchDowntimeBtn" data-app="downtime"/, 'DOWNTIME has a dedicated application launcher');
assert.match(html, /id="launchStaffManagementBtn" data-app="staff-management" type="button"/, 'STAFF MANAGEMENT has a dedicated module launcher');
assert.doesNotMatch(html, /id="launchStaffManagementBtn"[^>]*disabled/, 'STAFF MANAGEMENT is not hard-disabled in the launcher markup');
assert.match(html, /function isStaffModuleAutoAccess\(\)\{const tier=String\(centralUser\?\.tier\|\|''\)\.trim\(\)\.toUpperCase\(\);return \['DEV','DEV1','ADMIN'\]\.includes\(rootsAuthority\(\)\)\|\|tier==='DEVACC'\|\|tier==='ADMIN'\}/, 'all three protected ROOTS identities and explicitly privileged legacy tiers may access Staff Management');
assert.match(html, /function syncStaffModuleAccess\(\)[\s\S]*?tile\.disabled=!allowed/, 'Staff Management launcher is enabled or restricted from the authenticated central tier');
assert.match(html, /function launchStaffManagement\(\)[\s\S]*?window\.openYardHubStaffManagement\(\)/, 'YARD HUB Staff Management tile opens its dedicated submenu');
assert.match(html,/window\.launchStaffWorkspace=launchStaffWorkspace/,'STAFF subtile opens the existing central STAFF workspace');
assert.match(structure,/if\(app==='staff-management'\)\{button\.hidden=false;return;\}/,'published menu refresh preserves the new built-in Staff Management tile');
assert.match(structure,/window\.syncStaffModuleAccess\?\.\(\)/,'module permissions are reapplied after the published menu renders');
assert.match(html, /launchStaffManagementBtn'\)\?\.addEventListener\('click',launchStaffManagement\)/, 'Staff Management launcher has a click handler');
assert.match(html, /if\(section==='staff'&&isStaffModuleAutoAccess\(\)\)return true/, 'privileged tiers can open STAFF even when granular view flags are unset');
assert.match(html, /const canonicalIdentity=Boolean\(centralUser\?\.userId\|\|centralUser\?\.staffId\)[\s\S]*?\['DEV','DEV1','ADMIN'\]\.includes\(rootsAuthority\(\)\)[\s\S]*?canonicalIdentity\?permission\('canAccessYardHub'\)/, 'canonical identities cannot inherit YARD HUB access from legacy OWNER/DEVACC/ADMIN tiers');
const staffAccessSource = html.match(/function isStaffModuleAutoAccess\(\)\{[^}]*\}/)?.[0];
assert.ok(staffAccessSource, 'Staff Management auto-access policy is explicit and testable');
const staffAccess = new Function('centralUser', 'window', 'rootsAuthority', staffAccessSource + '; return isStaffModuleAutoAccess;');
for (const user of [
  { username: 'DEV', tier: 'OWNER', rootsAuthority: 'DEV' },
  { username: 'devacc-user', tier: 'DEVACC', rootsAuthority: null },
  { username: 'admin-user', tier: 'ADMIN', rootsAuthority: null },
  { username: 'dev1-root', tier: 'USER', rootsAuthority: 'DEV1' },
  { username: 'admin-root', tier: 'USER', rootsAuthority: 'ADMIN' }
]) assert.equal(staffAccess(user, {DowntimeCentral:{session:{user}}}, () => user.rootsAuthority)(), true, user.username + '/' + user.tier + ' has the configured Staff Management capability');
for (const user of [
  { username: 'dev-lookalike', tier: 'OWNER', rootsAuthority: null },
  { username: 'ordinary-user', tier: 'USER', rootsAuthority: null },
  { username: 'supervisor-user', tier: 'SUPERVISOR', rootsAuthority: null }
]) assert.equal(staffAccess(user, {DowntimeCentral:{session:{user}}}, () => user.rootsAuthority)(), false, user.username + '/' + user.tier + ' must not receive Staff Management auto-access');
assert.match(html, /class="yard-tile-copy"><strong>STAFF MANAGEMENT<\/strong>/, 'FLOOR module tile displays the STAFF MANAGEMENT title');
assert.match(html, /data-app="check-sheets" type="button" disabled/, 'DAILY remains visible but unavailable');
assert.match(html, /class="yard-tile-copy"><strong>DAILY<\/strong>/, 'CHECK SHEETS module tile displays the DAILY title');
assert.match(html, /data-app="check-sheets" type="button" disabled/, 'DAILY remains unavailable while Staff Management access is separately ROOTS-controlled');
assert.doesNotMatch(html, /<strong>FLOOR<\/strong>|<strong>CHECK SHEETS<\/strong>/, 'old module titles are absent from the YARD HUB tile labels');
assert.match(html, /id="launchRepairMaintenanceBtn" data-app="repair-maintenance" type="button"/, 'R&M has an active dedicated module launcher');
assert.doesNotMatch(html, /id="launchRepairMaintenanceBtn"[^>]*disabled/, 'R&M is not hard-disabled in the HUB markup');
assert.match(html, /repair-maintenance-launch\.js/, 'R&M launcher loads its authenticated module gate');
assert.ok(html.includes('shared-ui-system.css?v=20261124-1'), 'YARD HUB loads the shared visual design system');
assert.ok(html.includes('yard-hub-visual-system.css?v=20261125-1'), 'YARD HUB loads the scoped unified design system');
assert.ok(rmHtml.includes('yard-hub-visual-system.css?v=20261125-1'), 'R&M loads the same unified design system');
assert.ok(rmHtml.includes('class="app rm-module-root"'), 'R&M has an explicit presentation scope');
assert.ok(visualSystem.includes('#yardHub .yard-tile'), 'All live and coming-later modules share the same tile system');
assert.ok(visualSystem.includes('.gatelog-screen .gatelog-hero'), 'GATELOG adopts the canonical department header');
assert.ok(visualSystem.includes('.rm-module-root .hero'), 'R&M is the canonical department header reference');
assert.match(visualSystem, /width:10px[\s\S]*?height:140%/, 'Department accent is a narrow diagonal stripe');
assert.doesNotMatch(visualSystem, /(^|[}\s])(?:html|body|:root|main|button)\s*\{/i, 'Visual system contains no global element selectors');
assert.doesNotMatch(visualSystem, /#authGate|\.shell|\.weeklyKpis|\.downtime-entry-panel/, 'Tracking App is excluded from the visual-system scope');
assert.match(html, /function showCentralApp\(\)\{[^}]*yardHub/, 'successful central authentication routes to YARD HUB');
assert.match(html, /function launchDowntime\(\)\{[^}]*yardHub/, 'DOWNTIME launch swaps the hub for the existing application');
assert.match(html, /function returnToYardHub\(\)/, 'DOWNTIME provides a route back to YARD HUB');
assert.match(html, /addEventListener\('click',logoutCentralSession\)/, 'sign-out actions use the shared central logout flow');
assert.match(html, /id="backToYardHub"/, 'DOWNTIME exposes persistent HUB navigation');
assert.match(html, /<button class="nav active" data-view="weekly">▦ &nbsp; DOWNTIME<\/button>/, 'the former Home Page label is removed');
assert.match(html, /\.yard-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'desktop hub uses the two-column reference layout');
assert.match(html, /\.yard-wordmark strong\{color:#f5f7fa\}/, 'HUB wordmark uses a light contrasting colour over the yellow accent stripe');
assert.match(html, /@media\(max-width:540px\)[\s\S]*?\.yard-grid\{grid-template-columns:1fr;/, 'mobile hub stacks the application tiles');
assert.match(loginSmoke, /successful login lands on YARD HUB first/, 'browser smoke verifies the post-login landing route');
assert.match(loginSmoke, /launching DOWNTIME closes YARD HUB/, 'browser smoke verifies module launch');
assert.ok(packageJson.scripts['test:smoke:steps'].includes('tests/yard-hub-contract.mjs'), 'YARD HUB contract is part of the full smoke suite');
assert.match(html, /id="yardHubSettingsStaff"/, 'YARD HUB Staff Management exposes a separate STAFF tile');
assert.match(html,/window\.launchStaffWorkspace=launchStaffWorkspace/,'STAFF tile can open the existing Staff Management workspace');
assert.match(html,/window\.closeYardHubStaffManagement\?\.\(\)/,'returning from the STAFF workspace restores the Staff Management menu');
assert.match(html,/\['\.yard-hero','\.yard-grid','\.yard-modules-heading','\.yard-hub-footer'\]\.forEach/,'YARDHUB return always restores the home application tiles');
assert.match(html, /<strong>ACCESS AND RIGHTS<\/strong>/, 'YARD HUB Staff Management exposes the Access and Rights tile');
assert.match(html, /id="yardHubIdentityReset"/, 'DEV has a controlled Phase 1 identity reset surface');

assert.doesNotMatch(html, /yard-tile-index|<span[^>]*>0[1-5]<\/span>/, 'YARD HUB application tiles do not display sequence numbering');

console.log('YARD HUB platform contract: PASS');
