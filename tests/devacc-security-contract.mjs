import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
const app=fs.readFileSync('index.html','utf8');
const client=fs.readFileSync('central-bank-client.js','utf8');
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));

function roleProfile(source,container,name){
  const start=source.indexOf(container);
  assert.notEqual(start,-1,container+' exists');
  const match=source.slice(start).match(new RegExp(name+':\\{([^}]*)\\}'));
  assert.ok(match,name+' profile exists in '+container);
  return match[1];
}
assert.equal(roleProfile(api,'const tierDefault','OWNER'),roleProfile(api,'const tierDefault','DEVACC'),'DEVACC backend defaults match DEV');
assert.equal(roleProfile(api,'const lockedRolePrivileges','OWNER'),roleProfile(api,'const lockedRolePrivileges','DEVACC'),'DEVACC locked backend privileges match DEV');
assert.equal(roleProfile(app,'const tierDefaults','OWNER'),roleProfile(app,'const tierDefaults','DEVACC'),'DEVACC frontend defaults match DEV');
assert.equal(roleProfile(app,'const lockedTierPermissions','OWNER'),roleProfile(app,'const lockedTierPermissions','DEVACC'),'DEVACC locked frontend rights match DEV');

assert.ok(api.includes('const isDevRoot=currentUsername==="DEV"&&tier==="OWNER";'),'root identity requires exact DEV username and OWNER tier');
assert.ok(api.includes('const isDevacc=tier==="DEVACC";'),'authenticated DEVACC tier is recognised');
assert.ok(api.includes('const isRootAuthority=isDevRoot||isDevacc;'),'DEV and DEVACC share root authority');
assert.ok(api.includes('const isCentralAdmin=tier==="ADMIN"||isRootAuthority;'),'DEVACC receives root-equivalent account management');
assert.ok(api.includes('const isCentralBankAccess=isRootAuthority;'),'DEVACC receives root-equivalent Central Data Bank access');
assert.ok(api.includes('if(!isCentralBankAccess)return json({error:"Central Data Bank access is restricted to DEV and DEVACC only."},403);'),'Data Bank state is available only to DEV and DEVACC');
assert.ok(api.includes('action.startsWith("central-config-")&&!isCentralBankAccess'),'all configuration routes enforce the DEV/DEVACC authority boundary');
assert.ok(api.includes('if(!isCentralBankAccess)return json({error:"Only DEV and DEVACC can change tier access and rights."},403);'),'DEVACC can administer tier permissions');
assert.ok(api.includes('if(newTier==="DEVACC"&&!isDevRoot)return json({error:"Only root DEV can assign DEVacc."},403);'),'only root DEV can grant DEVACC tier');
assert.ok(api.includes('if(existing?.tier==="DEVACC"&&!isCentralBankAccess)return json({error:"Only DEV and DEVACC can modify DEVacc."},403);'),'DEVACC can modify, disable and restore DEVACC accounts');
assert.ok(api.includes('&&u.tier==="DEVACC")&&!isCentralBankAccess)return json({error:"Only DEV and DEVACC can remove DEVacc."},403);'),'DEVACC can remove other DEVACC accounts');
assert.ok(!api.includes('Only one DEVacc account is permitted.'),'there is no one-DEVACC account cap');
assert.ok(api.includes('if(newTier==="OWNER")return json({error:"DEV is the only OWNER account. Additional OWNER accounts are prohibited."},403);'),'DEVACC cannot create another OWNER identity');
assert.ok(api.includes('if(!isDevRoot)return json({error:"Only root DEV can update root credentials."},403);'),'only the actual DEV root can update root credentials');
assert.ok(api.includes('The DEV root OWNER account cannot be deleted or removed.'),'DEV OWNER cannot be deleted');

assert.ok(app.includes("return (username==='DEV'&&tier==='OWNER')||tier==='DEVACC'"),'frontend recognises DEVACC as root-equivalent');
assert.ok(app.includes("function canManageAccessRights(){return canAccessCentralBank()}"),'DEVACC can access Access and Rights');
assert.ok(app.includes("function isRootDevAccount(){return String(centralUser?.username||activeOperator||\'\').trim().toUpperCase()===\'DEV\'")||app.includes("function isRootDevAccount(){return String(centralUser?.username||activeOperator||\'\').trim().toUpperCase()==="DEV"),"root DEV identity helper exists");
assert.ok(app.includes("option.disabled=!isRootDevAccount()"),"DEVACC tier option is disabled for non-root accounts");
assert.ok(app.includes("canAssignDevacc=isRootDevAccount()"),"frontend blocks DEVACC grants unless root DEV");
assert.ok(app.includes('DEVACC has the same administrative authority as DEV'),'account-management copy documents root-equivalent authority');
assert.ok(!app.includes('rootAccountMigration')&&!app.includes('rootAccountJanPin')&&!app.includes('splitRootAccountBtn'),'legacy split UI and PIN field are removed');
assert.ok(!app.includes('runRootAccountSplit')&&!app.includes('canRunRootAccountSplit'),'legacy split handlers are removed');
assert.ok(!api.includes('root-account-split')&&!api.includes('isLegacyJanRoot'),'legacy split API and JAN root path are removed');
assert.ok(!client.includes('root-account-split')&&!client.includes('splitRootAccount'),'legacy split browser method is removed');
assert.ok(packageJson.scripts['test:central-bank'].includes('tests/devacc-security-contract.mjs'),'DEVACC contract runs in CI');

console.log('PASS: DEVACC has DEV-equivalent operational, account-management, Access & Rights and Central Data Bank authority; DEV OWNER remains immutable.');
