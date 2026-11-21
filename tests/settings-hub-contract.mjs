import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

const requiredTiles = ['users', 'areas', 'reasons', 'schedule', 'dailyTasks', 'staff'];
const requiredPanels = {
  users: 'settingsPanelUsers',
  areas: 'settingsPanelAreas',
  reasons: 'settingsPanelReasons',
  schedule: 'settingsPanelSchedule',
  dailyTasks: 'settingsPanelDailyTasks',
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
assert.equal((html.match(/data-settings-open="/g) || []).length, 6,
  'hub must expose five configuration destinations plus STAFF');
assert.equal((html.match(/data-settings-back>/g) || []).length, 6,
  'every settings panel must provide a back-to-settings control');
assert.doesNotMatch(html, /data-view="staff"/, 'STAFF must no longer have a standalone navigation destination');
assert.match(html, /id="settingsPanelStaff"[\s\S]*?id="staffRosterList"/, 'STAFF roster management must live inside its Settings panel');

for (const id of [
  'centralUsersAdminLink', 'centralUsersManager', 'centralUsersManageList',
  'centralAccountSave', 'operatorAdminPanel', 'areaPresetAdmin',
  'areaPresetAdminList', 'addAreaPresetBtn', 'reasonPresetAdmin',
  'downtimeReasonAdminList', 'addDowntimeReasonBtn', 'dailyTaskPresetInput',
  'addDailyTaskPresetBtn', 'dailyTaskPresetList', 'shiftScheduleAdmin', 'shiftScheduleEditor',
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
assert.equal(managerOnly('dailyTasks'), false);

const supervisorReasons = settingsAccess(name => ({
  canManageUsers: false, canManageSettings: false, canAddDowntimeReasons: true
}[name] === true));
assert.equal(supervisorReasons('users'), false);
assert.equal(supervisorReasons('areas'), false);
assert.equal(supervisorReasons('reasons'), true);
assert.equal(supervisorReasons('schedule'), false);
assert.equal(supervisorReasons('staff'), false);
assert.equal(supervisorReasons('dailyTasks'), false);

const supervisorStaff = settingsAccess(name => ({
  canViewStaff: true, canManageStaff: true
}[name] === true));
assert.equal(supervisorStaff('staff'), true, 'SUPERVISOR can access the STAFF panel');
assert.equal(supervisorStaff('users'), false);
assert.equal(supervisorStaff('areas'), false);
assert.equal(supervisorStaff('schedule'), false);
assert.equal(supervisorStaff('reasons'), false);
assert.equal(supervisorStaff('dailyTasks'), false);

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
  '$(\'addDailyTaskPresetBtn\').onclick=addDailyTaskPreset',
  '$("addAreaPresetBtn").onclick=addAreaPreset',
  '$("addDowntimeReasonBtn").onclick=()=>addReasonPreset',
  "saveShiftSchedule')?.addEventListener('click',applyScheduleToFutureDays)",
  "resetShiftSchedule')?.addEventListener('click'",
  "saveShiftPreset')?.addEventListener('click'",
  "applyShiftPreset')?.addEventListener('click'"
]) assert.ok(html.includes(handler), 'existing handler must be preserved: ' + handler);

assert.match(html, /\.settings-card-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\);gap:12px;align-items:stretch\}/,
  'wide desktop hub must use a balanced three-column grid');
assert.match(html, /@media\(max-width:1050px\)\{\.settings-card-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
  'medium desktop and tablet hub must use two columns');
assert.match(html, /@media\(max-width:650px\)\{\.settings-card-grid\{grid-template-columns:1fr/,
  'settings cards must stack on mobile');
assert.match(html, /settings-accent-yellow/, 'DOWNTIME yellow accent must be present');
assert.match(html, /settings-accent-blue/, 'DOWNTIME blue accent must be present');

const settingsGridStart = html.indexOf('<div class="settings-card-grid">');
const settingsGridEnd = html.indexOf('</div>', settingsGridStart);
const staffCardPosition = html.indexOf('data-settings-open="staff"', settingsGridStart);
assert.ok(settingsGridStart >= 0 && staffCardPosition > settingsGridStart && staffCardPosition < settingsGridEnd,
  'STAFF must be the sixth card inside the Settings grid');
assert.equal((html.slice(settingsGridStart, settingsGridEnd).match(/data-settings-open="/g) || []).length, 6,
  'all six Settings destinations must be direct grid cards');

assert.match(html, /id="areaPresetAdminMsg"[^>]*role="status"/,
  'AREA PRESETS must have a dedicated accessible status message');
assert.match(html, /function renderAreaPresetSettings\(\)[\s\S]*?Array\.isArray\(state\.areas\)/,
  'AREA PRESETS admin list must render the configured state.areas array');
assert.match(html, /if\(section==='areas'\)renderAreaPresetSettings\(\)/,
  'opening AREA PRESETS must populate the list');
assert.match(html, /function addAreaPreset\(\)[\s\S]*?renderAreaPresetSettings\(\)/,
  'adding an area must refresh the area list, not the downtime-reason list');
assert.match(html, /Remove area \"\+value/,
  'each configured area must have a named remove action');


assert.doesNotMatch(html, /quickReasonAdminList|addQuickReasonBtn|quickReasonButtons/, 'quick reason shortcuts and their Settings controls must be removed');
assert.match(html, /data-settings-open="dailyTasks"[\s\S]*?DAILY TASKS/, 'Daily Tasks must be available from Settings');
assert.match(html, /aria-label="Open Daily Tasks"/, 'Day to Day includes the clipboard trigger');
console.log('PASS: Settings hub navigation, Daily Tasks permissions, reason presets and responsive styling');
