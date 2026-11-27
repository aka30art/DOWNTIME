import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../central-bank-admin.html',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../supabase/functions/central-bank/index.ts',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20261124190000_dev_master_configuration_navigation.sql',import.meta.url),'utf8');

for(const section of ['navigation','modules','controls','information']){
 assert.match(html,new RegExp('data-section="'+section+'"'),section+' has a workspace navigation entry');
 assert.match(html,new RegExp('id="view-'+section+'"'),section+' has a workspace view');
}
assert.match(html,/does not enable, disable, install or change any live DOWNTIME module/i);
assert.match(html,/YARD HUB \+ R&amp;M · Read-only/i);
assert.match(html,/DOWNTIME tracker logic, records, permissions and operational workflows remain untouched/i);
assert.match(html,/YARD ROLE permissions stay separate/i);
assert.match(html,/ROOTS authority and ordinary YARD ROLE permissions are separate/i);
assert.match(api,/const modules=configStringList\(input\.modules\|\|\[\],"Module registry",100,80\)/);
assert.match(api,/if\(typeof action==="string"&&action\.startsWith\("central-config-"\)&&!isCentralBankAccess\)/);
assert.match(migration,/update public\.downtime_central_config_state/i);
assert.doesNotMatch(migration,/downtime_central_bank|downtime_central_audit|downtime_central_sessions|public\.downtime_central_config_history/i);
assert.match(migration,/\|\| coalesce\(draft_payload->'navigation'/);
assert.match(migration,/\|\| coalesce\(published_payload->'navigation'/);
console.log('PASS: DEV Master Configuration remains isolated; published structure is read-only; DOWNTIME operations, access gate and isolated config storage remain protected.');
