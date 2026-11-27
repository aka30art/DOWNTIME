import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

const requiredTiles = ['areas', 'stations', 'reasons', 'schedule', 'dailyTasks'];
const requiredPanels = {
  areas: 'settingsPanelAreas',
  stations: 'settingsPanelStations',
  reasons: 'settingsPanelReasons',
  schedule: 'settingsPanelSchedule',
  dailyTasks: 'settingsPanelDailyTasks'
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
  'hub must expose seven standard destinations plus the ADMIN/JAN Access and Rights destination');
assert.doesNotMatch(html, /data-settings-open="users"/, 'USERS must be removed from DOWNTIME Settings navigation');
assert.doesNotMatch(html, /data-settings-open="staff"/, 'STAFF must be removed from DOWNTIME Settings navigation');
assert.equal((html.match(/data-settings-back>/g) || []).length, 8,
  'every settings panel must provide a back-to-settings control');
assert.doesNotMatch(html, /data-view="staff"/, 'STAFF must no longer have a standalone navigation destination');
assert.match(html, /id="settingsPanelStaff"[\s\S]*?id="staffRosterList"/, 'STAFF workspace implementation remains available for the YARD HUB launcher');
assert.match(html, /id="settingsPanelStaff"[\s\S]*?BACK TO YARD HUB/, 'STAFF workspace returns to YARD HUB rather than DOWNTIME Settings');
assert.match(html, /id="settingsOwnerAccess"[\s\S]*?data-settings-open="accessRights"/, 'Access and Rights lives in a separate ADMIN/JAN-only Settings area');
assert.match(html, /id="settingsPanelAccessRights" class="settings-panel" hidden/, 'Access and Rights has its own hidden panel');
assert.match(html, /id="accessRightsTierList"[\s\S]*?id="saveAccessRights"/, 'ADMIN/JAN have an individual tier rights editor and central save control');

for (const id of [
  'centralUsersManager', 'centralUsersManageList',
  'centralAccountSave', 'operatorAdminPanel', 'areaPresetAdmin',
  'stationManagerList', 'addStationBtn', 'saveStationsBtn', 'stationManagerStatus',
  'areaPresetAdminList', 'addAreaPresetBtn', 'reasonPresetAdmin',
  'downtimeReasonAdminList', 'addDowntimeReasonBtn', 'dailyTaskPresetInput',
  'addDailyTaskPresetBtn', 'dailyTaskPresetList', 'shiftScheduleAdmin', 'shiftScheduleEditor',
  'saveShiftSchedule', 'resetShiftSchedule', 'saveShiftPreset', 'applyShiftPreset'
]) {
  assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1,
    id + ' must remain in the DOM exactly once');
}

const helpersMatch=html.match(/function canManageSettingsSection\(section\)\{[\s\S]*?function anySettingsAccess\(\)\{[^}]*\}/);
assert.ok(helpersMatch,'granular Settings permission helpers must be present');
const accessHelpers=new Function('permission','canManageAccessRights','isStaffModuleAutoAccess','rootsAuthority',helpersMatch[0]+'; return {settingsAccess,canManageSettingsSection};');
const helper=(permission)=>accessHelpers(permission,()=>false,()=>false,()=>null);
const managerOnly=helper(name=>({canManageUsers:true,canViewUsers:false}[name]===true));
assert.equal(managerOnly.settingsAccess('users'),false,'Central USER directory is exclusively managed from YARD HUB');
assert.equal(managerOnly.settingsAccess('areas'),false);
assert.equal(managerOnly.settingsAccess('stations'),false,'station configuration is restricted to settings administrators');
assert.equal(managerOnly.settingsAccess('reasons'),false);
assert.equal(managerOnly.settingsAccess('schedule'),false);
assert.equal(managerOnly.settingsAccess('staff'),false);
assert.equal(managerOnly.settingsAccess('dailyTasks'),false);
const supervisorReasons=helper(name=>({canAddDowntimeReasons:true}[name]===true));
assert.equal(supervisorReasons.settingsAccess('reasons'),true,'add-only SUPERVISOR can open the reason library');
assert.equal(supervisorReasons.canManageSettingsSection('reasons'),false,'add-only reason permission cannot remove presets');
const areaEditor=helper(name=>({canManageAreaPresets:true}[name]===true));
assert.equal(areaEditor.settingsAccess('areas'),true);
assert.equal(areaEditor.canManageSettingsSection('areas'),true);
assert.equal(areaEditor.settingsAccess('schedule'),false);
const taskEditor=helper(name=>({canManageDailyTasks:true}[name]===true));
assert.equal(taskEditor.settingsAccess('dailyTasks'),true);
assert.equal(taskEditor.canManageSettingsSection('dailyTasks'),true);
const supervisorStaff=helper(name=>({canViewStaff:true,canManageStaff:true}[name]===true));
assert.equal(supervisorStaff.settingsAccess('staff'),true,'staff managers can access the STAFF panel');
assert.equal(supervisorStaff.settingsAccess('users'),false,'USERS remain outside DOWNTIME Settings');
assert.equal(supervisorStaff.settingsAccess('stations'),false,'SUPERVISOR assignment rights do not include station configuration rights');
const staffViewer=helper(name=>name==='canViewStaff');
assert.equal(staffViewer.settingsAccess('staff'),true,'STAFF visibility preserves existing staff-view privilege');
const fullAdmin=accessHelpers(()=>true,()=>false,()=>false,()=> 'DEV');
for(const section of requiredTiles)assert.equal(fullAdmin.settingsAccess(section),true);
assert.equal(fullAdmin.settingsAccess('users'),false,'even protected ROOTS users manage USERS only from YARD HUB');
assert.equal(fullAdmin.settingsAccess('staff'),true,'legacy STAFF permission helper remains for compatibility with internal routing');
assert.match(helpersMatch[0], /function anySettingsAccess\(\)\{return \['areas','stations','reasons','schedule','dailyTasks','staff','accessRights'\]/,
  'USERS and STAFF permissions must keep the Settings entry point available');
assert.equal(fullAdmin.settingsAccess('accessRights'),false,'a role without the ADMIN/JAN identity allow-list cannot access tier rights');
assert.equal(accessHelpers(()=>false,()=>true,()=>false).settingsAccess('accessRights'),true,'ADMIN tier or JAN root OWNER allow-list can access Access and Rights');
const manageAccessRightsStart=html.indexOf('function canManageAccessRights(){');
assert.notEqual(manageAccessRightsStart,-1,'Access and Rights permission gate must be present');
const manageAccessRightsEnd=html.indexOf('}',manageAccessRightsStart)+1;
const manageAccessRightsSource=html.slice(manageAccessRightsStart,manageAccessRightsEnd);
assert.ok(manageAccessRightsSource.endsWith('}'),'Access and Rights permission gate source must be complete');
assert.equal(accessHelpers(()=>false,()=>false,()=>false).settingsAccess('accessRights'),false,'legacy Access and Rights editing remains disabled during canonical identity cutover');
assert.match(html,/function canManageAccessRights\(\)\{return false\}/,'legacy Access and Rights mutation remains fail-closed until a separately approved cutover');
const centralBankGateStart=html.indexOf('function canAccessCentralBank(){');
assert.notEqual(centralBankGateStart,-1,'Central Bank access gate must be present');
const centralBankGateEnd=html.indexOf('}',centralBankGateStart)+1;
const centralBankGateSource=html.slice(centralBankGateStart,centralBankGateEnd);
const centralBankGate=new Function('rootsAuthority',centralBankGateSource+'; return canAccessCentralBank;');
assert.equal(centralBankGate(()=> 'DEV')(),true,'immutable DEV ROOTS authority can access the Central Bank');
assert.equal(centralBankGate(()=> 'DEV1')(),false,'DEV1 cannot access the DEV-only Central Bank');
assert.equal(centralBankGate(()=> 'ADMIN')(),false,'protected ADMIN cannot access the DEV-only Central Bank');
assert.equal(centralBankGate(()=> null)(),false,'legacy OWNER/DEVACC/ADMIN tiers cannot substitute for immutable DEV ROOTS authority');
assert.ok(!html.includes('centralUsersAdminLink'),'obsolete Central Data Bank link is removed from the USERS panel');

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
assert.match(html, /settings-accent-violet/, 'DOWNTIME violet accent must be present on Shift & Breaktime / Station Manager');

const settingsGridStart = html.indexOf('<div class="settings-card-grid">');
const settingsGridEnd = html.indexOf('</div>', settingsGridStart);
assert.equal((html.slice(settingsGridStart, settingsGridEnd).match(/data-settings-open="/g) || []).length, 7,
  'the DOWNTIME Settings grid must expose USERS, STAFF and all five operational configuration destinations');

assert.match(html, /id="stationManagerStatus"[^>]*role="status"/, 'Station Manager has an accessible save status');
assert.match(html, /function saveStationManager\(\)[\s\S]*?persistSettingsConfirmed\(\)/, 'Station Manager saves only after central acknowledgement');
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
console.log('PASS: Settings hub navigation, Station Manager permissions, Daily Tasks, reason presets and responsive styling');
