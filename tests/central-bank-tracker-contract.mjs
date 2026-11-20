import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const tracker=await readFile('index.html','utf8');
const overview=await readFile('plant-overview-preview.html','utf8');
const client=await readFile('central-bank-client.js','utf8');
const api=await readFile('supabase/functions/central-bank/index.ts','utf8');

assert.match(tracker,/window\.DOWNTIME_CENTRAL_API=.*functions\/v1\/central-bank/,'tracker configures central API');
assert.match(tracker,/src="central-bank-client\.js"/,'tracker loads central browser adapter');
assert.match(tracker,/DowntimeCentral\.listUsers\(\)/,'login choices are centrally sourced');
assert.match(tracker,/DowntimeCentral\.login\(username,pin\)/,'user PINs are verified centrally');
assert.match(tracker,/DowntimeCentral\.state\(\)/,'tracker state is loaded from central bank');
assert.match(tracker,/DowntimeCentral\.saveTracker\(snapshot,centralVersion\)/,'tracker saves centrally with a version');
assert.match(tracker,/setInterval\(async\(\)=>\{if\(!centralReady/,'tracker polls centrally for cross-device changes');
assert.doesNotMatch(tracker,/downtime_shared_state/,'main tracker has no legacy shared-state access');
assert.doesNotMatch(overview,/downtime_shared_state/,'Plant Overview has no legacy shared-state access');
assert.match(overview,/sessionStorage\.getItem\('downtime\.central\.session\.v1'\)/,'Overview inherits authenticated tab session');
assert.match(overview,/centralCall\('get-state'\)/,'Overview reads central state');
assert.match(overview,/centralCall\('set-plant-status'/,'Overview status button uses central action');
assert.match(api,/action==="set-plant-status"/,'server implements central plant status updates');
assert.match(api,/if\(!priv\.canEditTracker\)return json\(\{error:"Permission denied"\},403\)/,'server enforces tracker edit tier');
assert.match(client,/async setPlantStatus\(plantOn,version\)/,'browser adapter exposes plant status action');
console.log('PASS: main tracker and Plant Overview are connected to the central data bank.');
