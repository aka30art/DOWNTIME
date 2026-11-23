import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('index.html','utf8');
const adminPage=fs.readFileSync('central-bank-admin.html','utf8');
const api=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));

assert.ok(page.includes("return (username==='DEV'&&tier==='OWNER')||tier==='DEVACC'"),'DEVACC shares the DEV root access allow-list');
assert.ok(page.includes("function canManageAccessRights(){const tier=String(centralUser?.tier||privilegeFor(activeOperator)).toUpperCase();return canAccessCentralBank()||(tier==='ADMIN'&&permission('canManageAccessRights'))}"),'Access & Rights is available to root DEV/DEVACC and delegated ADMIN only');
assert.ok(page.includes("if(admin)admin.style.display=canAccessCentralBank()?'':'none';"),'Central Data Bank navigation uses the root-equivalent allow-list');
assert.ok(page.includes("function isRootDevAccount(){return String(centralUser?.username||activeOperator||'').trim().toUpperCase()==='DEV'&&String(centralUser?.tier||privilegeFor(activeOperator)).toUpperCase()==='OWNER'}"),'the tier grant selector requires the exact root DEV/OWNER identity');
assert.ok(page.includes('option.disabled=!isRootDevAccount()'),'the DEVACC tier option is enabled only for root DEV');
assert.ok(page.includes("protectedDevacc=user.tier==='DEVACC'&&!canAccessCentralBank()"),'DEVACC accounts are not protected from another root-equivalent administrator');
assert.ok(!page.includes('rootAccountMigration')&&!page.includes('splitRootAccountBtn'),'retired split panel is absent');

assert.ok(adminPage.includes('call("central-config-state")'),'standalone configuration page uses the isolated config state action');
assert.ok(!adminPage.includes('call("central-admin-state")')&&!adminPage.includes('call("get-state")'),'configuration UI does not fall back to legacy admin/tracker state');
assert.ok(api.includes('const isCentralBankAccess=isRootAuthority;'),'backend Data Bank authority includes DEVACC');
assert.ok(api.includes('action.startsWith("central-config-")&&!isCentralBankAccess'),'configuration actions require DEV or DEVACC');
assert.ok(api.includes('const isCentralAdmin=tier==="ADMIN"||isRootAuthority;'),'ADMIN and root-equivalent identities can manage user tiers');
assert.ok(!api.includes('root-account-split'),'obsolete migration API action is absent');
assert.ok(packageJson.scripts['test:central-bank'].includes('tests/central-bank-menu-access-contract.mjs'),'menu access contract runs in CI');

console.log('PASS: DEVACC shares Central Data Bank and Access & Rights authority; ADMIN remains outside root-only surfaces.');
