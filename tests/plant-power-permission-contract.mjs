import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('index.html','utf8');
const overview=fs.readFileSync('plant-overview-preview.html','utf8');
const api=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
const client=fs.readFileSync('central-bank-client.js','utf8');
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));
const tiers=['OWNER','DEVACC','ADMIN','MANAGER','SUPERVISOR','USER','SPECTATOR'];

const pageDefaults=page.slice(page.indexOf('const tierDefaults={'),page.indexOf('const lockedTierPermissions='));
const apiDefaults=api.slice(api.indexOf('const tierDefault:'),api.indexOf('const cryptoHex='));
const pageLocked=page.slice(page.indexOf('const lockedTierPermissions='),page.indexOf('function permission(name)'));
const apiLocked=api.slice(api.indexOf('const lockedRolePrivileges:'),api.indexOf('function addStableRecordIds'));

function roleProfile(source,tier){
  const escaped=tier.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const m=source.match(new RegExp('(?:^|\\n)\\s*'+escaped+':\\{([^}]*)\\}'));
  assert.ok(m,'Missing '+tier+' permission profile');
  return m[1];
}

// Default access is on for every tier, including read-only USER and SPECTATOR.
for(const tier of tiers){
  assert.match(roleProfile(pageDefaults,tier),/canControlPlantPower:true/,'frontend grants Plant Power by default to '+tier);
  assert.match(roleProfile(apiDefaults,tier),/canControlPlantPower:true/,'server grants Plant Power by default to '+tier);
  assert.match(roleProfile(overview.slice(overview.indexOf('const tier=user?.tier'),overview.indexOf('const rights=')),tier),/canControlPlantPower:true/,'Overview fallback grants Plant Power to '+tier);
}

// Root can see every tier; delegated ADMIN can see only the four lower tiers.
 // Root roles may edit only Plant Power; their other immutable privileges stay locked.
assert.ok(page.includes("{key:'canControlPlantPower',label:'PLANT POWER'"),'Access & Rights contains the PLANT POWER checkbox');
assert.ok(page.includes("const root=canAccessCentralBank(),visibleTiers=root?USER_TIERS:['MANAGER','SUPERVISOR','USER','SPECTATOR'];"),'root sees all tier profiles while delegated ADMIN is restricted to lower tiers');
assert.ok(page.includes('visibleTiers.forEach(tier=>{'),'Access & Rights renders only the profiles allowed to the current authority');
assert.ok(page.includes("toggle.disabled=adminLocked||(!root&&right.key==='canManageAccessRights')||!!(lockedTierPermissions[tier]&&Object.prototype.hasOwnProperty.call(lockedTierPermissions[tier],right.key))"),'ADMIN cannot edit its own profile or the delegation right, and immutable root rights remain read-only');
assert.ok(page.includes("rootProfile.canControlPlantPower=plantPower.checked"),'the Plant Power value is saved independently for root tiers');
for(const tier of ['OWNER','DEVACC']){
  assert.doesNotMatch(roleProfile(pageLocked,tier),/canControlPlantPower/,'root Plant Power is not hard-locked in frontend '+tier);
  assert.doesNotMatch(roleProfile(apiLocked,tier),/canControlPlantPower/,'root Plant Power is not hard-locked in backend '+tier);
}

// Frontend visibility and activation both use the tier right, not a username
// allow-list or the unrelated tracker-edit permission.
assert.ok(page.includes("const allowed=!!centralUser&&centralReady&&permission('canControlPlantPower')"),'main page toggle visibility uses Plant Power');
assert.ok(page.includes("!permission('canControlPlantPower')||plantPowerBusy"),'main page click handler rechecks Plant Power and prevents duplicate in-flight status updates');
assert.ok(page.includes('window.DowntimeCentral.setPlantStatus(nextOn,centralVersion)'),'main page invokes the dedicated central status action');
assert.ok(!page.includes("activeOperator==='Jan'||activeOperator==='Mick'"),'main page no longer restricts Plant Power to JAN/MICK');
assert.ok(client.includes('async setPlantStatus(plantOn,version)'), 'browser adapter exposes the versioned status action');

// The central API enforces the right independently of tracker write access.
const statusRoute=api.slice(api.indexOf('if(action==="set-plant-status")'),api.indexOf('if(action==="tiers-save")'));
assert.ok(statusRoute.includes('if(!priv.canControlPlantPower)return json({error:"Permission denied"},403)'),'server denies use when PLANT POWER is off');
assert.ok(!statusRoute.includes('priv.canEditTracker'),'read-only tier access is independent of Edit tracker');
assert.ok(statusRoute.includes('action:"set-plant-status"'),'status changes remain audited');

// Root OWNER/DEVACC rights stay protected except for this explicitly configurable
// permission; other tiers retain the normal complete boolean permission schema.
const saveRoute=api.slice(api.indexOf('if(action==="tiers-save")'),api.indexOf('if(action==="logout")'));
assert.ok(saveRoute.includes('if(role==="OWNER"||role==="DEVACC")'),'root profiles receive a separate save path');
assert.ok(saveRoute.includes('if(key==="canControlPlantPower")'),'only the Plant Power right is taken from the proposed root profile');
assert.ok(saveRoute.includes('lockedRolePrivileges[role][key]??tierDefault[role][key]'),'other root privileges are reset to their protected values');
assert.ok(saveRoute.includes('const permissionKeys=Object.keys(tierDefault.OWNER)'),'server validates against the mirrored tier permission whitelist');
assert.ok(api.includes('Object.fromEntries(tiers.map(tier=>[tier,{...tierDefault[tier],...(storedTiers[tier]||{})}]))'),'existing stored tier data inherits the new true default when the new key is absent');

// The second status surface uses the same right, avoiding a split permission model.
assert.ok(overview.includes('authorized=!!rights.canControlPlantPower'),'Plant Overview status control follows Plant Power');
assert.ok(overview.includes('toggle.hidden=!authorized'),'Plant Overview hides the control when Plant Power is off');
assert.ok(packageJson.scripts['test:central-bank'].includes('tests/plant-power-permission-contract.mjs'),'Plant Power permission contract runs in CI');

console.log('PASS: PLANT POWER is configurable for all seven tiers, independently enforced by the Central Bank API and available to read-only USER/SPECTATOR tiers when enabled.');
