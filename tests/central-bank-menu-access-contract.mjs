import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('index.html','utf8');
const adminPage=fs.readFileSync('central-bank-admin.html','utf8');
const api=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));

// The main tracker entry and the standalone control plane share the exact ADMIN/JAN allow-list.
assert.ok(page.includes("function canAccessCentralBank(){const username=String(centralUser?.username||activeOperator||'').trim().toUpperCase(),tier=privilegeFor(activeOperator);return tier==='ADMIN'||(username==='JAN'&&tier==='OWNER')}"),'allow-list is exact ADMIN tier or JAN root OWNER');
assert.ok(page.includes("function canManageAccessRights(){return canAccessCentralBank()}"),'Access & Rights is now available only to the same ADMIN/JAN allow-list');
assert.ok(page.includes('id="centralAdminNav" class="nav central-admin-nav" href="central-bank-admin.html" target="_blank" rel="noopener" style="display:none"'),'menu shortcut starts hidden to prevent a pre-auth flash');
assert.ok(page.includes("if(admin)admin.style.display=canAccessCentralBank()?'':'none';"),'menu shortcut uses strict allow-list');
assert.ok(!page.includes('centralUsersAdminLink'),'legacy Users-panel link to the former duplicate admin surface is removed');
assert.ok(!page.includes('OPEN CENTRAL USERS & PRIVILEGES'),'former duplicate link label is removed');
assert.ok(page.includes("if(centralAdminNav)centralAdminNav.style.display='none';"),'logout immediately clears the Central Data Bank shortcut');
const browserSmoke=fs.readFileSync('tests/login-smoke.mjs','utf8');
for(const assertion of ['JAN root OWNER sees the Central Data Bank menu entry','ADMIN tier can see the Central Data Bank menu entry','MANAGER with ADMIN-equivalent configurable rights cannot see Central Data Bank','SUPERVISOR staff-management permission does not grant Central Data Bank access','USER cannot see the Central Data Bank menu entry','SPECTATOR cannot see the Central Data Bank menu entry','Central Data Bank entry is hidden immediately after logout','legacy Central Data Bank shortcut is no longer embedded in the USERS panel'])assert.ok(browserSmoke.includes(assertion),'browser regression: '+assertion);

// The standalone control plane only requests the dedicated config API, never tracker data or the legacy tier admin state.
assert.ok(adminPage.includes('call("central-config-state")'),'standalone page uses the dedicated configuration-state action');
assert.ok(!adminPage.includes('call("central-admin-state")'),'configuration UI does not use the legacy whole-bank admin payload');
assert.ok(!adminPage.includes('call("get-state")'),'configuration UI cannot fall back to ordinary tier-filtered tracker state');

// The Edge Function independently restricts the legacy central admin-state and new configuration actions.
assert.ok(api.includes('if(action==="central-admin-state"){'),'protected legacy admin-state action remains present');
assert.ok(api.includes('if(tier!=="ADMIN"&&!isJanRoot)return json({error:"Central Data Bank access is restricted to ADMIN and JAN."},403);'),'legacy admin-state rejects all but ADMIN and JAN root');
assert.ok(api.includes('action.startsWith("central-config-")&&!isCentralAdmin'),'all configuration actions use the strict allow-list');
assert.ok(api.includes('if(tier!=="ADMIN"&&!isJanRoot)return json({error:"Only ADMIN or the JAN root administrator can change tier access and rights"},403);'),'tier permission updates allow only ADMIN or JAN');
assert.ok(packageJson.scripts["test:central-bank"].includes('tests/central-bank-menu-access-contract.mjs'),'menu access regression is in the central-bank suite');

console.log('Central Data Bank ADMIN/JAN-only menu and server gate contract checks passed.');
