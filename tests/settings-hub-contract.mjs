import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

const requiredTiles = ['users', 'areas', 'reasons', 'schedule', 'staff'];
const requiredPanels = {
  users: 'settingsPanelUsers',
  areas: 'settingsPanelAreas',
  reasons: 'settingsPanelReasons',
  schedule: 'settingsPanelSchedule',
  staff: 'settingsPanelStaff'
};

assert.match(html, /<div id="settingsHub" class="settings-hub">/, 'Settings must open on the new hub');
for (const section of requiredTiles) {
  assert.match(
    html,
    new RegExp('data-settings-open="' + section + '"'),
    section + ' tile must be present'
  );
  const panelId = requiredPanels[section];
  assert.match(
    html,
    new RegExp('<div id="' + panelId + '" class="settings-panel" hidden>'),
    section + ' must open in its own dedicated panel'
  );
  assert.ok(
    html.includes('aria-controls="' + panelId + '"'),
    section + ' tile must identify the panel it opens'
  );
}
assert.equal((html.match(/data-settings-open="/g) || []).length, 5,
  'hub must expose the four configuration destinations plus STAFF');
assert.equal((html.match(/data-settings-back>/g) || []).length, 5,
  'every settings panel must provide a back-to-settings control');
assert.doesNotMatch(html, /data-view="staff"/, 'STAFF must no longer have a standalone navigation destination');
assert.match(html, /id="settingsPanelStaff"[\s\S]*?id="staffRosterList"/, 'STAFF roster management must live inside its Settings panel');

for (const id of [
  'centralUsersAdminLink', 'centralUsersManager', 'centralUsersManageList',
  'centralAccountSave', 'operatorAdminPanel', 'areaPresetAdmin',
  'areaPresetAdminList', 'addAreaPresetBtn', 'reasonPresetAdmin',
  'quickReasonAdminList', 'downtimeReasonAdminList', 'addQuickReasonBtn',
  'addDowntimeReasonBtn', 'shiftScheduleAdmin', 'shiftScheduleEditor',
  'saveShiftSchedule', 'resetShiftSchedule', 'saveShiftPreset', 'applyShiftPreset'
]) {
  assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1,
    id + ' must remain in the DOM exactly once');
}

const accessMatch = html.match(/function settingsAccess\(section\)\{[^}]*\}/);
assert.ok(accessMatch, 'settings section access must be permission-gated');
const settingsAccess = new Function('permission',
  accessMatch[0] + '; return settingsAccess;'
);
const managerOnly = settingsAccess(name => ({
  canManageUsers: true, canManageSettings: false, canAddDowntimeReasons: false
}[name] === true));
assert.equal(managerOnly('users'), true);
assert.equal(managerOnly('areas'), false);
assert.equal(managerOnly('reasons'), false);
assert.equal(managerOnly('schedule'), false);
assert.equal(managerOnly('staff'), false);

const supervisorReasons = settingsAccess(name => ({
  canManageUsers: false, canManageSettings: false, canAddDowntimeReasons: true
}[name] === true));
assert.equal(supervisorReasons('users'), false);
assert.equal(supervisorReasons('areas'), false);
assert.equal(supervisorReasons('reasons'), true);
assert.equal(supervisorReasons('schedule'), false);
assert.equal(supervisorReasons('staff'), false);

const supervisorStaff = settingsAccess(name => ({
  canViewStaff: true, canManageStaff: true
}[name] === true));
assert.equal(supervisorStaff('staff'), true, 'SUPERVISOR can access the STAFF panel');
assert.equal(supervisorStaff('users'), false);
assert.equal(supervisorStaff('areas'), false);
assert.equal(supervisorStaff('schedule'), false);
assert.equal(supervisorStaff('reasons'), false);

const supervisorManageStaff = html.match(/SUPERVISOR:\{[^}]*\}/);
assert.ok(supervisorManageStaff, 'SUPERVISOR permission profile must exist');
assert.match(supervisorManageStaff[0], /canManageStaff:true/,
  'SUPERVISOR must be granted STAFF management permission');

const staffViewer = settingsAccess(name => name === 'canViewStaff');
assert.equal(staffViewer('staff'), true, 'STAFF visibility must preserve the existing staff-view privilege');
assert.equal(staffViewer('users'), false);

const fullAdmin = settingsAccess(() => true);
for (const section of requiredTiles) assert.equal(fullAdmin(section), true);

assert.match(html, /function showSettingsHub\(\)/, 'back navigation must return to the Settings hub');
assert.match(html, /function openSettingsPanel\(section\)/, 'tile navigation must open dedicated panels');
assert.match(html, /document\.querySelectorAll\('\[data-settings-back\]'\)/,
  'back buttons must be wired');
assert.match(html, /if\(b\.dataset\.view==='settings'\)\{showSettingsHub\(\)/,
  'main Settings navigation must return to the hub');

for (const handler of [
  '$("addAreaPresetBtn").onclick=addAreaPreset',
  '$("addQuickReasonBtn").onclick=()=>addReasonPreset',
  '$("addDowntimeReasonBtn").onclick=()=>addReasonPreset',
  "saveShiftSchedule')?.addEventListener('click',applyScheduleToFutureDays)",
  "resetShiftSchedule')?.addEventListener('click'",
  "saveShiftPreset')?.addEventListener('click'",
  "applyShiftPreset')?.addEventListener('click'"
]) assert.ok(html.includes(handler), 'existing handler must be preserved: ' + handler);

assert.match(html, /\.settings-card-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
  'desktop hub must use a two-column card grid');
assert.match(html, /@media\(max-width:650px\)\{\.settings-card-grid\{grid-template-columns:1fr/,
  'settings cards must stack on mobile');
assert.match(html, /settings-accent-yellow/, 'DOWNTIME yellow accent must be present');
assert.match(html, /settings-accent-blue/, 'DOWNTIME blue accent must be present');

console.log('PASS: Settings hub navigation, section permissions, original controls and responsive styling');
