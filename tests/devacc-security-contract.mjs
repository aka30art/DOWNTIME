import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
const app=fs.readFileSync('index.html','utf8');
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));

function roleProfile(source,container,name){
  const start=source.indexOf(container);
  assert.notEqual(start,-1,container+' exists');
  const tail=source.slice(start);
  const match=tail.match(new RegExp(name+':\\{([^}]*)\\}'));
  assert.ok(match,name+' profile exists in '+container);
  return match[1];
}
assert.equal(roleProfile(api,'const tierDefault','OWNER'),roleProfile(api,'const tierDefault','DEVACC'),'DEVACC server defaults exactly match root operational rights');
assert.equal(roleProfile(api,'const lockedRolePrivileges','OWNER'),roleProfile(api,'const lockedRolePrivileges','DEVACC'),'DEVACC server privileges are immutable and root-equivalent');
assert.equal(roleProfile(app,'const tierDefaults','OWNER'),roleProfile(app,'const tierDefaults','DEVACC'),'DEVACC browser defaults match root operational rights');
assert.equal(roleProfile(app,'const lockedTierPermissions','OWNER'),roleProfile(app,'const lockedTierPermissions','DEVACC'),'DEVACC browser permissions are locked to root-equivalent operational rights');

assert.ok(api.includes('const isDevRoot=currentUsername==="DEV"&&tier==="OWNER"'),'root authority requires the exact DEV username and OWNER tier');
assert.ok(api.includes('const isCentralBankAccess=isDevRoot;'),'only root DEV has the Data Bank capability');
assert.ok(api.includes('const isCentralAdmin=tier==="ADMIN"||tier==="DEVACC"||isDevRoot;'),'only DEV, ADMIN and DEVACC can create accounts or assign standard tiers; legacy JAN root cannot');
assert.ok(api.includes('if(!isCentralBankAccess)return json({error:"Central Data Bank access is restricted to DEV only."},403);'),'whole-bank state denies ADMIN and DEVACC');
assert.ok(api.includes('action.startsWith("central-config-")&&!isCentralBankAccess'),'all configuration routes deny non-DEV identities');
assert.ok(api.includes('if(!isDevRoot)return json({error:"Only root DEV can change tier access and rights."},403);'),'tier rights mutation is root-only');

assert.ok(api.includes('if(newTier==="DEVACC"&&!isDevRoot)return json({error:"Only DEV can assign DEVacc."},403);'),'only DEV can grant DEVACC');
assert.ok(api.includes('if(existing?.tier==="DEVACC"&&!isDevRoot)return json({error:"Only DEV can modify DEVacc."},403);'),'only DEV can modify, disable or restore DEVACC');
assert.ok(api.includes('&&u.tier==="DEVACC")&&!isDevRoot)return json({error:"Only DEV can remove DEVacc."},403);'),'only DEV can delete DEVACC');
assert.ok(api.includes('if(newTier==="DEVACC"&&bank.users.some((u:any)=>u!==existing&&u.tier==="DEVACC"))return json({error:"Only one DEVacc account is permitted."},409);'),'one DEVACC account maximum');
assert.ok(api.includes('if(newTier==="OWNER")return json({error:"DEV is the only OWNER account. Additional OWNER accounts are prohibited."},403);'),'DEVACC cannot mint another root account');
assert.ok(api.includes('if(existing?.tier==="OWNER")return json({error:"The root OWNER account is protected."},403);'),'root identity is protected from ordinary account-management routes');

assert.ok(app.includes("return username==='DEV'&&tier==='OWNER'"),'main UI Data Bank access is DEV-only');
assert.ok(app.includes("tier==='ADMIN'||tier==='DEVACC'||canAccessCentralBank()"),'ADMIN and DEVACC retain standard account-tier management');
assert.ok(app.includes('option.disabled=!canAccessCentralBank()'),'DEVACC option is disabled for non-root users');
assert.ok(app.includes("if(tier==='DEVACC'&&!canAssignDevacc)"),'the DEVACC UI assignment check calls the authorization function');
assert.ok(app.includes("protectedDevacc=user.tier==='DEVACC'&&!canAccessCentralBank()"),'DEVACC account controls are hidden from non-DEV');
assert.ok(app.includes("if(!canRunRootAccountSplit())return;"),'legacy account split retains its separate DEV/JAN transition gate');
assert.ok(packageJson.scripts['test:central-bank'].includes('tests/devacc-security-contract.mjs'),'DEVACC security contract is included in the central-bank suite');

console.log('DEVACC root-equivalent operational rights, DEV-only management and Data Bank boundary contracts passed.');
