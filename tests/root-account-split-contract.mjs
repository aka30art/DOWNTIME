import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
const app=fs.readFileSync('index.html','utf8');
const client=fs.readFileSync('central-bank-client.js','utf8');
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));

for(const [source,label] of [[api,'Central Bank API'],[app,'application UI'],[client,'browser adapter']]){
  for(const retired of ['rootAccountMigration','rootAccountJanPin','splitRootAccountBtn','runRootAccountSplit','canRunRootAccountSplit','root-account-split','splitRootAccount']){
    assert.ok(!source.includes(retired),label+' no longer exposes retired split path: '+retired);
  }
}
assert.ok(api.includes('username="DEV"'),'bootstrap creates DEV as the root OWNER');
assert.ok(api.includes('The root OWNER username is fixed as DEV'),'bootstrap fixes the root identity');
assert.ok(api.includes('const rootsAuthority=resolveRootsAuthority(currentUser,rootsAssignment,rootsBootstrap?.user_id||null);'),'ROOTS authority is derived from the immutable DEV bootstrap identity and canonical ROOTS assignment');
assert.ok(api.includes('const isDevRoot=rootsAuthority==="DEV"'),'DEV authority is resolved from canonical ROOTS identity rather than a legacy username/tier string');
assert.ok(!api.includes('currentUsername==="DEV"&&tier==="OWNER"'),'legacy username and tier strings cannot grant DEV ROOTS authority');
assert.ok(api.includes('if(isRootName){'),'root credential updates use a protected branch');
assert.ok(api.includes('if(!isDevRoot)return json({error:"Only root DEV can update root credentials."},403);'),'DEVACC cannot alter DEV root credentials');
assert.ok(api.includes('Additional OWNER accounts are prohibited'),'no second OWNER can be created');
assert.ok(api.includes('The DEV root OWNER account cannot be deleted or removed.'),'DEV root cannot be removed');
assert.ok(packageJson.scripts['test:central-bank'].includes('tests/root-account-split-contract.mjs'),'retired split contract remains in CI');

console.log('PASS: legacy one-time DEV/JAN account split is removed from UI, client and API; protected DEV OWNER identity remains.');
