import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile('index.html', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const loginSmoke = await readFile('tests/login-smoke.mjs', 'utf8');

assert.match(html, /<section id="yardHub" class="yard-hub" hidden/, 'YARD HUB exists as a separate initially hidden authenticated surface');
assert.match(html, /YARD OPERATIONS CORE/, 'YARD HUB carries the approved platform identity');
assert.match(html, /id="yardHubUsername"/, 'YARD HUB displays the authenticated user');
assert.match(html, /id="yardHubLogoutBtn"/, 'YARD HUB provides a sign-out action');
assert.match(html, /id="launchDowntimeBtn" data-app="downtime"/, 'DOWNTIME has a dedicated application launcher');
assert.match(html, /data-app="floor" type="button" disabled/, 'FLOOR remains visible but unavailable');
assert.match(html, /data-app="check-sheets" type="button" disabled/, 'CHECK SHEETS remains visible but unavailable');
assert.match(html, /id="launchRepairMaintenanceBtn" data-app="repair-maintenance" type="button"/, 'R&M has an active dedicated module launcher');
assert.doesNotMatch(html, /id="launchRepairMaintenanceBtn"[^>]*disabled/, 'R&M is not hard-disabled in the HUB markup');
assert.match(html, /repair-maintenance-launch\.js/, 'R&M launcher loads its authenticated module gate');
assert.match(html, /shared-ui-system\.css\\?v=20261124-1/, 'YARD HUB loads the shared visual design system');
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
assert.ok(packageJson.scripts['test:smoke'].includes('tests/yard-hub-contract.mjs'), 'YARD HUB contract is part of the full smoke suite');

console.log('YARD HUB platform contract: PASS');
