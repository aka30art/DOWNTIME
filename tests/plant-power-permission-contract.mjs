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

// Legacy account-tier editing is closed while canonical YARD ROLE is authoritative.
assert.ok(page.includes('function canManageAccessRights(){return false}'),'the retired legacy tier editor is unavailable');
assert.ok(page.includes("if(section==='accessRights')return canManageAccessRights();"),'the Settings hub blocks the retired tier editor');

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

// Canonical department identities receive Plant Power only through protected ROOTS authority.
// Legacy tier permission writes are rejected instead of bypassing YARD ROLE.
const canonicalIdentityBlock=api.slice(api.indexOf('if(hasCanonicalIdentity&&!isRootAuthority)'),api.indexOf('if(isRootAuthority){'));
const rootsAuthorityBlock=api.slice(api.indexOf('if(isRootAuthority){'),api.indexOf('// Central Bank USER directory access'));
assert.ok(canonicalIdentityBlock.includes('canControlPlantPower:false'),'canonical non-root YARD ROLE identities cannot operate Plant Power');
assert.ok(rootsAuthorityBlock.includes('canControlPlantPower:true'),'protected ROOTS identities retain Plant Power control');
const saveRoute=api.slice(api.indexOf('if(action==="tiers-save")'),api.indexOf('if(action==="logout")'));
assert.ok(saveRoute.includes('Legacy account-tier permissions are retired. Configure department access through canonical YARD ROLE.')&&saveRoute.includes('},410);'),'server retires legacy tier-permission writes with HTTP 410');
assert.ok(!saveRoute.includes('if(role==="OWNER"||role==="DEVACC")'),'retired tier route cannot provide a legacy ROOTS profile mutation path');

// The second status surface uses the same right, avoiding a split permission model.
assert.ok(overview.includes('authorized=!!rights.canControlPlantPower'),'Plant Overview status control follows Plant Power');
assert.ok(overview.includes('toggle.hidden=!authorized'),'Plant Overview hides the control when Plant Power is off');
assert.ok(packageJson.scripts['test:central-bank'].includes('tests/plant-power-permission-contract.mjs'),'Plant Power permission contract runs in CI');

console.log('PASS: Plant Power is enforced by the Central Bank API, granted to protected ROOTS identities, denied to canonical non-root identities, and the retired tier editor fails closed.');
