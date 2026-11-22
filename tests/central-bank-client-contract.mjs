import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync('central-bank-client.js','utf8');
for(const action of ['list-users','login','get-state','save-state','save-settings','user-save','user-delete','staff-save','tiers-save','staff-photo-url','staff-photo-read','staff-photo-remove','bootstrap','logout']){
  assert.ok(src.includes(action),action+' browser adapter method/action');
}
assert.ok(src.includes('x-downtime-session'),'authenticated requests carry the session header');
assert.ok(src.includes('window.DOWNTIME_CENTRAL_API_KEY'),'publishable key is read from page config');
assert.ok(src.includes('headers.apikey=apiKey'),'API requests send the publishable apikey header');
assert.ok(src.includes('sessionStorage'),'session persistence remains enabled');
assert.ok(!src.includes('root-account-split')&&!src.includes('splitRootAccount'),'retired split action is absent from the browser adapter');
console.log('PASS: Central Bank client exposes supported actions without the retired account split endpoint.');
