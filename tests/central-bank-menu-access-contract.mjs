import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('index.html','utf8');
const adminPage=fs.readFileSync('central-bank-admin.html','utf8');
const api=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));

// The menu and every in-app shortcut use the same strict identity/tier allow-list.
assert.ok(page.includes("function canAccessCentralBank(){const username=String(centralUser?.username||activeOperator||'').trim().toUpperCase(),tier=privilegeFor(activeOperator);return tier==='ADMIN'||(username==='JAN'&&tier==='OWNER')}"),'allow-list is exact ADMIN tier or JAN root OWNER');
assert.ok(page.includes('id="centralAdminNav" class="nav central-admin-nav" href="central-bank-admin.html" target="_blank" rel="noopener" style="display:none"'),'menu shortcut starts hidden to prevent a pre-auth flash');
assert.ok(page.includes("if(admin)admin.style.display=canAccessCentralBank()?'':'none';"),'menu shortcut uses strict allow-list');
assert.ok(page.includes("if(usersAdmin)usersAdmin.style.display=canAccessCentralBank()?'':'none';"),'Settings shortcut uses strict allow-list');
assert.ok(page.includes("if(accountLink)accountLink.style.display=canAccessCentralBank()?'inline-block':'none';"),'later USER panel rendering cannot re-open the shortcut using broad permissions');
assert.ok(!page.includes('OWNER setup and account administration: <a href="central-bank-admin.html"'),'unauthenticated login screen does not expose a direct link');
assert.ok(page.includes("if(centralAdminNav)centralAdminNav.style.display='none';")&&page.includes("if(centralUsersAdminLink)centralUsersAdminLink.style.display='none';"),'logout immediately clears both Central Data Bank shortcuts');
const browserSmoke=fs.readFileSync('tests/login-smoke.mjs','utf8');
for(const assertion of ['JAN root OWNER sees the Central Data Bank menu entry','ADMIN tier can see the Central Data Bank menu entry','MANAGER with ADMIN-equivalent configurable rights cannot see Central Data Bank','SUPERVISOR staff-management permission does not grant Central Data Bank access','USER cannot see the Central Data Bank menu entry','SPECTATOR cannot see the Central Data Bank menu entry','Central Data Bank entry is hidden immediately after logout','later USERS panel rendering cannot restore the Central Data Bank shortcut for MANAGER'])assert.ok(browserSmoke.includes(assertion),'browser regression: '+assertion);

// The standalone page requests a separate server-authorized admin state, not normal tracker state.
assert.ok(adminPage.includes('call("central-admin-state")'),'standalone page uses the protected admin-state action');
assert.ok(!adminPage.includes('call("get-state")'),'standalone page cannot fall back to ordinary tier-filtered state');

// The Edge Function, not client-side visibility, enforces the ADMIN/JAN-only route gate.
assert.ok(api.includes('if(action==="central-admin-state"){'),'protected admin state action exists');
assert.ok(api.includes('const isJanRoot=String(currentUser.username||"").trim().toUpperCase()==="JAN"&&tier==="OWNER";'),'Edge Function recognizes only JAN as root OWNER');
assert.ok(api.includes('if(tier!=="ADMIN"&&!isJanRoot)return json({error:"Central Data Bank access is restricted to ADMIN and JAN."},403);'),'Edge Function rejects all other tiers');
assert.ok(api.includes('payload:{...bank,users:bank.users.map(safeUser)}'),'protected admin state returns sanitized user records');
assert.ok(api.includes('if(action==="get-state"){'),'normal tracker state remains available through its existing tier-based filters');
assert.ok(packageJson.scripts["test:central-bank"].includes('tests/central-bank-menu-access-contract.mjs'),'new access regression test is part of the Central Bank suite');

console.log('Central Data Bank ADMIN/JAN-only menu and server gate contract checks passed.');
