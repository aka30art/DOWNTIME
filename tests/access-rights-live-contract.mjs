import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('index.html','utf8');
const client=fs.readFileSync('central-bank-client.js','utf8');
const api=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');

const settingsRights=[
  'canViewUsers','canViewAreaPresets','canManageAreaPresets',
  'canViewReasonPresets','canManageReasonPresets',
  'canViewShiftSchedule','canManageShiftSchedule',
  'canViewDailyTasks','canManageDailyTasks'
];

// Every Settings section permission must be defined, shown in Access and Rights,
// and enforced by the same central API contract.
for(const key of settingsRights){
  assert.ok(page.includes(key+':')||page.includes("{key:'"+key+"'"),'frontend permission '+key);
  assert.ok(page.includes("{key:'"+key+"'"),'Access and Rights editor exposes '+key);
  assert.ok(api.includes(key+':'),'central API default permission '+key);
}
assert.ok(page.includes("{key:'canControlPlantPower',label:'PLANT POWER'"),'PLANT POWER is exposed as a dedicated Access & Rights checkbox');
assert.ok(page.includes('USER_TIERS.forEach(tier=>{'),'Access & Rights renders a permission card for every tier, including OWNER and DEVACC');
assert.ok(page.includes("rootProfile.canControlPlantPower=plantPower.checked"),'root tier Plant Power is editable without exposing other root privileges');
assert.ok(page.includes("const allowed=!!centralUser&&centralReady&&permission('canControlPlantPower')"),'main page Plant Power visibility uses the dedicated permission');
assert.ok(page.includes('window.DowntimeCentral.setPlantStatus(nextOn,centralVersion)'),'main page updates plant status through the dedicated API action');
for(const tier of ['OWNER','DEVACC','ADMIN','MANAGER','SUPERVISOR','USER','SPECTATOR']){
  const pageRole=page.slice(page.indexOf('const tierDefaults={'),page.indexOf('const lockedTierPermissions=')).match(new RegExp(tier+':\\{[^}]*\\}'))?.[0]||'';
  const apiRole=api.slice(api.indexOf('const tierDefault:'),api.indexOf('const cryptoHex=')).match(new RegExp(tier+':\\{[^}]*\\}'))?.[0]||'';
  assert.ok(pageRole.includes('canControlPlantPower:true'),'frontend default Plant Power is enabled for '+tier);
  assert.ok(apiRole.includes('canControlPlantPower:true'),'server default Plant Power is enabled for '+tier);
}
const plantPowerRoute=api.slice(api.indexOf('if(action==="set-plant-status")'),api.indexOf('if(action==="tiers-save")'));
assert.ok(plantPowerRoute.includes('if(!priv.canControlPlantPower)return json({error:"Permission denied"},403)'),'server denies Plant Power use when its tier checkbox is off');

for(const tier of ['OWNER','DEVACC','ADMIN','MANAGER','SUPERVISOR','USER','SPECTATOR']){
  assert.match(page,new RegExp(tier+':\\{[^}]*canViewAreaPresets:'),'frontend default profile for '+tier);
  assert.match(api,new RegExp(tier+':\\{[^}]*canViewAreaPresets:'),'server default profile for '+tier);
}

assert.match(page,/function canManageAccessRights\(\)\{return canAccessCentralBank\(\)\}/,'Access and Rights shares the central admin identity gate');
assert.match(page,/return \(username==='DEV'&&tier==='OWNER'\)\|\|tier==='DEVACC'/,'DEVACC has the same Access and Rights authority as root DEV');
assert.doesNotMatch(api,/isLegacyJanRoot|root-account-split/,'legacy JAN migration path is retired');
assert.match(page,/function canManageSettingsSection\(section\)/,'shared Settings edit permission resolver');
assert.match(page,/function settingsAccess\(section\)/,'shared Settings section visibility resolver');
assert.match(page,/function anySettingsAccess\(\)/,'Settings navigation follows section rights');
assert.match(page,/function persistSettings\(\)[^{]*\{if\(spectatorMode\)return false;[^}]*syncSettingsCloud\(\)/,'Settings persistence is not blocked by tracker read-only mode');
assert.match(page,/function syncSettingsCloud\(\)[\s\S]*DowntimeCentral\.saveSettings\(snapshot,centralVersion\)/,'independent settings save transport');
assert.match(client,/saveSettings\(appData,version\)\{return call\("save-settings"/,'browser adapter provides save-settings action');
assert.match(page,/if\(!el\.closest\('\.settings-panel'\)\)el\.disabled=operatorReadOnly/,'tracker read-only mode does not disable authorized Settings fields');
assert.match(page,/function renderShiftSchedule\([\s\S]*canManageSettingsSection\('schedule'\)/,'schedule editors use their Settings permission');
assert.match(page,/function renderDailyTaskSettings\([\s\S]*canManageSettingsSection\('dailyTasks'\)/,'daily-task editors use their own Settings permission');
assert.match(page,/function renderAreaPresetSettings\([\s\S]*canManageSettingsSection\('areas'\)/,'area preset editor uses its own Settings permission');
assert.match(page,/function renderReasonPresetSettings\([\s\S]*canManageSettingsSection\('reasons'\)/,'reason preset editor uses its own Settings permission');
assert.match(page,/function renderCentralUserSettings\([\s\S]*canView=canManage\|\|permission\('canViewUsers'\)/,'USERS section supports read-only visibility');
assert.match(api,/if\(action==="save-settings"\)[\s\S]*const canManageAreas=priv\.canManageSettings\|\|priv\.canManageAreaPresets/,'server configuration save action checks granular rights');
assert.match(api,/const canManageSchedule=priv\.canManageSettings\|\|priv\.canManageShiftSchedule/,'server enforces schedule edit permission');
assert.match(api,/const canManageTasks=priv\.canManageSettings\|\|priv\.canManageDailyTasks/,'server enforces daily-task edit permission');
assert.match(api,/const canManageReasons=priv\.canManageSettings\|\|priv\.canManageReasonPresets/,'server enforces reason preset edit permission');
assert.match(api,/if\(!isCentralBankAccess\)return json\(\{error:"Only DEV and DEVACC can change tier access and rights\."\},403\)/,'tier permission grants require DEV or DEVACC root authority');
assert.match(api,/OWNER:\{canEditTracker:true/,'OWNER default permissions remain fixed in the central API');

const overviewPermissionBlock=page.slice(page.indexOf('const tierDefaults={'),page.indexOf('function permission(name)'));
const apiOverviewPermissionBlock=api.slice(api.indexOf('const tierDefault:'),api.indexOf('const cryptoHex='));
assert.ok(page.includes("{key:'canViewPlantOverview'"),'dedicated Plant Overview right is exposed in the existing editor');
assert.ok(api.includes('const permissionKeys=Object.keys(tierDefault.OWNER)'),'server tier updates validate the permission against the existing permission whitelist');
function permissionRole(source,tier){
  const start=source.indexOf(tier+':{');if(start<0)return '';
  const end=source.indexOf('}',start);return end<0?'':source.slice(start,end+1);
}
function frontendPermissionRole(tier){return permissionRole(overviewPermissionBlock,tier);}
function serverPermissionRole(tier){return permissionRole(apiOverviewPermissionBlock,tier);}
for(const tier of ['OWNER','ADMIN','MANAGER','SUPERVISOR','USER']){
  assert.ok(frontendPermissionRole(tier).includes('canViewPlantOverview:true'),'frontend Plant Overview default for '+tier);
  assert.ok(serverPermissionRole(tier).includes('canViewPlantOverview:true'),'server Plant Overview default for '+tier);
}
assert.ok(permissionRole(overviewPermissionBlock,'SPECTATOR').includes('canViewPlantOverview:false'),'frontend SPECTATOR cannot open Plant Overview');
assert.ok(permissionRole(apiOverviewPermissionBlock,'SPECTATOR').includes('canViewPlantOverview:false'),'server SPECTATOR cannot open Plant Overview');
assert.ok(page.includes("if(!permission('canViewPlantOverview'))return;"),'opening Plant Overview uses its dedicated right');
assert.ok(page.includes("if(overview)overview.style.display=spectator||!permission('canViewPlantOverview')?'none':''"),'Plant Overview navigation uses its dedicated right');

console.log('PASS: granular Settings visibility/edit rights, tracker-independent settings persistence, and DEV-only Data Bank authorization.');
