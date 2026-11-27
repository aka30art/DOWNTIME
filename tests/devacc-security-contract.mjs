import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
const resolver=fs.readFileSync('supabase/functions/_shared/roots-authority.mjs','utf8');
const app=fs.readFileSync('index.html','utf8');
const client=fs.readFileSync('central-bank-client.js','utf8');
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));

// ROOTS is derived from immutable USER identity and reciprocal active assignments,
// never from an account username, legacy tier name, or client-supplied flag.
assert.ok(resolver.includes('DEV is recognised only by the immutable bootstrap USER ID.'),'ROOTS resolver documents immutable DEV identity');
assert.ok(resolver.includes('const userId = String(user.userId || "")'),'ROOTS resolver requires a canonical USER ID');
assert.ok(resolver.includes('norm(userId) === norm(immutableDevUserId)) return "DEV"'),'only the singleton bootstrap USER ID resolves to DEV');
assert.ok(resolver.includes('["DEV1", "ADMIN"].includes(String(assignment.roots_class || ""))'),'DEV1 and ADMIN require explicit ROOTS assignment classes');
assert.ok(resolver.includes('norm(assignment.user_id) !== norm(userId) || norm(assignment.staff_id) !== norm(staffId)'),'ROOTS assignment must match immutable USER and STAFF identity');
assert.ok(resolver.includes('assignment.status || "ACTIVE"'),'ROOTS assignment must be active');
assert.ok(resolver.includes('Legacy tier labels are never ROOTS authority evidence.'),'legacy account tiers are not ROOTS authority evidence');

assert.ok(api.includes('resolveRootsAuthority(currentUser,rootsAssignment,rootsBootstrap?.user_id||null)'),'Central Bank resolves authority from protected ROOTS registries');
assert.ok(api.includes('const isDevRoot=rootsAuthority==="DEV";'),'Central Bank DEV status uses the immutable resolver result');
assert.ok(api.includes('const isRootAuthority=["DEV","DEV1","ADMIN"].includes(rootsAuthority||"");'),'only resolved DEV, DEV1 and ADMIN classes gain ROOTS capabilities');
assert.ok(api.includes('const isCentralAdmin=isDevRoot;'),'Central Bank administration is immutable-DEV only');
assert.ok(api.includes('const isCentralBankAccess=isDevRoot;'),'Central Data Bank configuration access is immutable-DEV only');
assert.ok(api.includes('priv.canManageUsers=rootsAuthority==="DEV";priv.canViewUsers=rootsAuthority==="DEV";'),'Central Bank USER directory is immutable-DEV only');
assert.ok(api.includes('if(!isDevRoot)return json({error:"Only immutable DEV may provision new USER + STAFF identities."},403);'),'USER and STAFF provisioning is immutable-DEV only');
assert.ok(api.includes('if(!isDevRoot)return json({error:"Only immutable DEV may maintain existing USER identities."},403);'),'USER identity maintenance is immutable-DEV only');
assert.ok(api.includes('if(!isDevRoot)return json({error:"Only immutable DEV may maintain STAFF identities."},403);'),'STAFF identity maintenance is immutable-DEV only');
assert.ok(api.includes('if(!isDevRoot)return json({error:"Only immutable DEV may perform USER lifecycle operations."},403);'),'USER lifecycle is immutable-DEV only');
assert.ok(api.includes('if(!isDevRoot)return json({error:"Only root DEV can update root credentials."},403);'),'only immutable DEV may change root credentials');
assert.ok(api.includes('if(!isDevRoot)return json({error:"Identity diagnostics are restricted to immutable DEV."},403);'),'identity diagnostics are immutable-DEV only');

// DEV1 and ADMIN can hold distinct ROOTS capabilities, but not the DEV user directory.
const rootsBlock=api.slice(api.indexOf('if(isRootAuthority){'),api.indexOf('// Central Bank USER directory access'));
assert.ok(rootsBlock.includes('if(rootsAuthority!=="DEV")'),'non-DEV ROOTS classes have delegated capability limits');
assert.ok(rootsBlock.includes('canManageUsers:false,canViewUsers:false'),'DEV1 and ROOTS ADMIN cannot view or manage the Central Bank USER directory');
assert.ok(api.includes('canManageYardRoles'),'ROOTS governance remains represented separately from account-tier permissions');

// The browser trusts only the resolved authority attached to its authenticated session.
assert.ok(app.includes("function rootsAuthority(){return String(centralUser?.rootsAuthority||'').toUpperCase()}"),'frontend ROOTS helper reads server-resolved identity');
assert.ok(app.includes("function canAccessCentralBank(){return rootsAuthority()==='DEV'}"),'frontend Central Bank access is immutable-DEV only');
assert.ok(app.includes('if(name===\'canManageUsers\'||name===\'canViewUsers\')return root===\'DEV\';'),'frontend USER directory access is immutable-DEV only');
assert.ok(app.includes("function canManageAccessRights(){return false}"),'legacy account-tier Access and Rights editor is retired');
assert.ok(app.includes("function canAssignStandardAccountTiers(){return false}"),'legacy tier assignment UI is retired');
assert.ok(app.includes("option.disabled=!isRootDevAccount()"),'legacy DEVACC selector remains unavailable to non-DEV accounts');
assert.ok(!app.includes("username==='DEV'&&tier==='OWNER'"),'frontend does not infer ROOTS authority from username plus OWNER tier');
assert.ok(!app.includes("tier==='DEVACC'"),'frontend does not infer ROOTS authority from legacy DEVACC tier');
assert.ok(!api.includes('const isDevRoot=currentUsername==="DEV"&&tier==="OWNER";'),'backend does not infer DEV from username plus OWNER tier');
assert.ok(!api.includes('const isDevacc=tier==="DEVACC";'),'backend does not infer ROOTS authority from DEVACC tier');
assert.ok(client.includes('async saveTiers(tiers,version)'),'legacy client method remains a compatibility call only');
assert.ok(api.includes('Legacy account-tier permissions are retired. Configure department access through canonical YARD ROLE.')&&api.includes('},410);'),'legacy tier permission writes fail closed with HTTP 410');
assert.ok(packageJson.scripts['test:central-bank'].includes('tests/devacc-security-contract.mjs'),'ROOTS authority regression contract runs in CI');

console.log('PASS: immutable ROOTS identity controls DEV, DEV1 and ADMIN capabilities; legacy OWNER/DEVACC tier labels cannot grant ROOTS authority or Central Bank access.');
