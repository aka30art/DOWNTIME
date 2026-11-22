import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('index.html','utf8');
const adminPage=fs.readFileSync('central-bank-admin.html','utf8');
const api=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));

assert.ok(page.includes("return username==='DEV'&&tier==='OWNER'"),'only root DEV can enter the Central Data Bank');
assert.ok(page.includes("function canManageAccessRights(){return canAccessCentralBank()}"),'Access & Rights is a root DEV-only Data Bank surface');
assert.ok(page.includes('id="centralAdminNav" class="nav central-admin-nav" href="central-bank-admin.html" target="_blank" rel="noopener" style="display:none"'),'menu shortcut starts hidden before authentication');
assert.ok(page.includes("if(admin)admin.style.display=canAccessCentralBank()?'':'none';"),'menu shortcut uses the root DEV allow-list');
assert.ok(!page.includes('centralUsersAdminLink'),'legacy duplicate Users-panel link is removed');
assert.ok(page.includes("if(centralAdminNav)centralAdminNav.style.display='none';"),'logout immediately clears the Central Data Bank shortcut');

assert.ok(page.includes('function canAssignStandardAccountTiers()'),'ordinary tier assignment is separate from Data Bank access');
assert.ok(page.includes("tier==='ADMIN'||tier==='DEVACC'||canAccessCentralBank()"),'ADMIN and DEVacc can assign standard account tiers');
assert.ok(page.includes('option.disabled=!canAccessCentralBank()'),'only DEV can select the DEVACC tier');
assert.ok(page.includes("if(tier==='DEVACC'&&!canAssignDevacc)"),'frontend enforces DEV-only DEVACC assignment');
assert.ok(page.includes("protectedDevacc=user.tier==='DEVACC'&&!canAccessCentralBank()"),'non-DEV managers cannot edit, disable or remove DEVACC');
assert.ok(page.includes('function canRunRootAccountSplit()'),'legacy JAN-to-DEV migration uses a distinct transitional gate');
assert.ok(page.includes('if(!canRunRootAccountSplit())return;'),'root migration does not broaden Data Bank access');

assert.ok(adminPage.includes('call("central-config-state")'),'standalone page uses the dedicated configuration-state action');
assert.ok(!adminPage.includes('call("central-admin-state")'),'configuration UI does not use the legacy whole-bank admin payload');
assert.ok(!adminPage.includes('call("get-state")'),'configuration UI cannot fall back to ordinary tracker state');

assert.ok(api.includes('const isCentralBankAccess=isDevRoot;'),'backend Data Bank principal is root DEV only');
assert.ok(api.includes('if(action==="central-admin-state"){'),'protected legacy admin-state action remains present');
assert.ok(api.includes('if(!isCentralBankAccess)return json({error:"Central Data Bank access is restricted to DEV only."},403);'),'whole-bank state endpoint is DEV-only');
assert.ok(api.includes('action.startsWith("central-config-")&&!isCentralBankAccess'),'all configuration actions use the DEV-only backend gate');
assert.ok(api.includes('if(!isDevRoot)return json({error:"Only root DEV can change tier access and rights."},403);'),'tier permission updates are DEV-only');
assert.ok(packageJson.scripts["test:central-bank"].includes('tests/central-bank-menu-access-contract.mjs'),'menu access regression is in CI');

console.log('DEV-only Central Data Bank, ordinary account-management and DEVACC assignment contracts passed.');
