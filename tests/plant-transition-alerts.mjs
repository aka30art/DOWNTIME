import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html=await readFile('index.html','utf8');
const overview=await readFile('plant-overview-preview.html','utf8');
const api=await readFile('supabase/functions/central-bank/index.ts','utf8');
const scripts=html;

for(const [needle,label] of [
 ['function showPlantTransitionAlert(plantOn,updatedAt)','plant transition alert exists'],
 ['ACKNOWLEDGE','tracker alert has acknowledgement control'],
 ['setTimeout(()=>{closePlantTransitionAlert();next()},10000)','tracker PLANT ON alert auto-dismisses'],
 ['plantChanged=cloudReady&&managementRole()','tracker alerts are limited to management visibility'],
 ['typeof previous?.plantOn===\'boolean\'','initial state load is not a transition'],
 ['applyIncomingCloudPayload(result.payload,\'CENTRAL · remote update\',result.updatedAt,result.version,result.user)','polling applies central versioned changes']
])assert.ok(scripts.includes(needle),label);

assert.match(api,/action==="set-plant-status"/,'central plant toggle action exists');
assert.match(api,/if\(!priv\.canEditTracker\)return json\(\{error:"Permission denied"\},403\)/,'central API enforces plant toggle permission');
assert.match(api,/eq\("version",Number\(body\.version\)\)\.select\("id"\)\.maybeSingle\(\)/,'plant status uses version compare-and-swap');
assert.ok(overview.includes("centralCall('get-state')"),'Plant Overview reads central state');
assert.ok(overview.includes("centralCall('set-plant-status'"),'Plant Overview writes central plant status');
assert.ok(!overview.includes('downtime_shared_state'),'Plant Overview no longer connects to legacy shared state');
assert.ok(overview.includes("sessionStorage.getItem('downtime.central.session.v1')"),'Plant Overview uses authenticated tab session storage');
console.log('PASS: central plant status sync, role gating, version conflict handling, and transition alerts.');
