import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('index.html','utf8');
const adminPage=fs.readFileSync('central-bank-admin.html','utf8');
const api=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));

assert.ok(page.includes("function canAccessCentralBank(){return rootsAuthority()==='DEV'}"),'Central Data Bank access is immutable DEV-only');
assert.ok(page.includes("function canManageAccessRights(){return false}"),'legacy tier-based Access and Rights editor is retired');
assert.ok(page.includes("if(admin)admin.style.display=canAccessCentralBank()?'':'none';"),'Central Data Bank navigation uses the immutable DEV-only gate');
assert.ok(page.includes("function isRootDevAccount(){return rootsAuthority()==='DEV'}"),'DEVACC assignment requires server-resolved immutable DEV identity');
assert.ok(page.includes('option.disabled=!isRootDevAccount()'),'the DEVACC tier option is enabled only for immutable DEV');
assert.ok(page.includes("protectedDevacc=user.tier==='DEVACC'&&!canAccessCentralBank()"),'DEVACC accounts are protected from all non-DEV identities');
assert.ok(!page.includes('DEVACC shares the DEV root access allow-list')&&!page.includes('DEV / DEVACC ACCESS'),'stale DEVACC Central Bank allow-list copy is absent');
assert.ok(page.includes('LEGACY TIER EDITOR · RETIRED')&&page.includes('Department permissions are governed by canonical YARD ROLE; ROOTS authority remains separate.'),'legacy Access and Rights surface is clearly retired');

assert.ok(adminPage.includes('callConfig("central-config-state")')&&adminPage.includes('/functions/v1/central-config-admin'),'standalone configuration page uses the dedicated isolated config endpoint');
assert.ok(!adminPage.includes('call("central-admin-state")')&&!adminPage.includes('call("get-state")'),'configuration UI does not fall back to legacy admin/tracker state');
assert.ok(api.includes('const isCentralBankAccess=isDevRoot;'),'backend Central Data Bank authority is immutable-DEV only');
assert.ok(api.includes('action.startsWith("central-config-")&&!isCentralBankAccess'),'configuration actions require immutable DEV');
assert.ok(api.includes('const isCentralAdmin=isDevRoot;'),'Central Bank account administration is immutable-DEV only');
assert.ok(!api.includes('root-account-split'),'obsolete migration API action is absent');
assert.ok(packageJson.scripts['test:central-bank'].includes('tests/central-bank-menu-access-contract.mjs'),'menu access contract runs in CI');

console.log('PASS: Central Data Bank is immutable-DEV only; DEVACC remains operationally privileged but outside ROOTS and CDB governance.');
