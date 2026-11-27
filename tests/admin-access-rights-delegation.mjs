import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync('index.html','utf8');
const api=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

assert.ok(app.includes("function canManageAccessRights(){return false}"),'legacy tier-based Access and Rights editing is retired');
assert.ok(app.includes("function canAccessCentralBank(){return rootsAuthority()==='DEV'}"),'only immutable DEV ROOTS identity can enter the Central Data Bank');
assert.ok(app.includes('DEVACC retains locked root-equivalent operational permissions, but is not a ROOTS identity and cannot access the Central Data Bank configuration control plane.'),'DEVACC operational permissions do not grant ROOTS or Central Data Bank authority');
assert.ok(!app.includes('DEVACC has the same administrative authority as DEV, including Central Data Bank and Access & Rights access.'),'stale DEVACC root-equivalence wording is absent');
assert.ok(api.includes('const rootsAuthority=resolveRootsAuthority(currentUser,rootsAssignment,rootsBootstrap?.user_id||null);'),'ROOTS authority is resolved from immutable DEV bootstrap identity and canonical assignment');
assert.ok(api.includes('const isDevRoot=rootsAuthority==="DEV";'),'only canonical DEV ROOTS authority receives DEV governance');
assert.ok(api.includes('const isCentralBankAccess=isDevRoot;'),'Central Data Bank access is immutable DEV-only');
assert.ok(api.includes('if(action==="tiers-save"){'),'legacy tier permission save route is explicitly retired');
assert.ok(api.includes('Legacy account-tier permissions are retired. Configure department access through canonical YARD ROLE.'),'legacy tier permission writes are rejected in favour of canonical YARD ROLE');
assert.ok(api.includes('if(newTier==="DEVACC"')&&api.includes('Only immutable DEV can assign DEVACC.'),'only immutable DEV may assign DEVACC');
assert.ok(api.includes('Only immutable DEV can create accounts or assign user tiers.'),'only immutable DEV may create accounts or assign tiers');
assert.ok(api.includes('Only immutable DEV can modify DEVACC accounts.'),'only immutable DEV may modify DEVACC accounts');
assert.ok(api.includes('Only immutable DEV can remove DEVACC accounts.'),'only immutable DEV may remove DEVACC accounts');
assert.ok(api.includes('if(existing?.tier==="DEVACC"&&!isCentralBankAccess'),'DEVACC account modification remains inside the DEV-only control plane');
assert.ok(!api.includes('isAccessRightsAdmin'),'no delegated ADMIN Access and Rights bypass remains');
assert.ok(pkg.scripts['test:central-bank'].includes('tests/admin-access-rights-delegation.mjs'),'retirement contract remains in CI');

console.log('PASS: legacy tier Access and Rights delegation is retired; immutable DEV-only CDB and canonical ROOTS/YARD ROLE governance remain.');
