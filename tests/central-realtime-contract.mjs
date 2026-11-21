import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const indexHtml=await readFile(resolve('index.html'),'utf8');
const overviewHtml=await readFile(resolve('plant-overview-preview.html'),'utf8');
const migration=await readFile(resolve('supabase/migrations/20261121050415_central_state_realtime_broadcast.sql'),'utf8');

assert.match(migration,/create policy "downtime_central_state_broadcast_read"/i,'Realtime read policy must be created');
assert.match(migration,/for select\s+to authenticated/i,'Only authenticated app sessions may receive the channel broadcast');
assert.match(migration,/extension = 'broadcast'/i,'Policy must be limited to Broadcast messages');
assert.match(migration,/realtime\.topic\(\) = 'downtime-central-state'/i,'Policy must be limited to the DOWNTIME central-state topic');
assert.match(migration,/jsonb_build_object\(\s*'version', new\.version,\s*'updated_at', new\.updated_at\s*\)/i,'Broadcast must contain only version and updated timestamp');
assert.doesNotMatch(migration,/new\.payload/i,'Central payload must never be broadcast');
assert.match(migration,/revoke all on function public\.notify_downtime_central_state_change\(\) from public, anon, authenticated/i,'Trigger function must not be directly callable by browser roles');
assert.match(migration,/when \(old\.version is distinct from new\.version\)/i,'Broadcast must only occur on an actual central version change');

assert.match(indexHtml,/client\.channel\('downtime-central-state',\{config:\{private:true\}\}\)/,'Main app must subscribe to the private central-state topic');
assert.match(indexHtml,/event:'central_state_changed'/,'Main app must handle central-state broadcast events');
assert.match(indexHtml,/await client\.realtime\.setAuth\(\)/,'Main app must provide the Supabase Auth JWT for private-channel authorization');
assert.match(indexHtml,/DOWNTIME_CENTRAL_STATE_CHANGED/,'Main app must forward update hints to the embedded Overview');
assert.match(indexHtml,/DowntimeCentral\.state\(\)/,'Broadcasts must cause a permission-checked central-state read');
assert.match(indexHtml,/function flushCentralRealtimeRefresh/,'Queued external updates must be processed when local saves finish');

assert.match(overviewHtml,/function createOperatorCard\(name\)/,'Overview must generate cards for newly-added STAFF members');
assert.match(overviewHtml,/payload\?\.staff\?\.roster/,'Overview must use the central STAFF roster as its card source');
assert.match(overviewHtml,/function profileForName\(profiles,name\)/,'Overview must match roster names to profiles case-insensitively');
assert.match(overviewHtml,/data-stationassigned/,'Overview must refresh station blueprint assignments');
assert.match(overviewHtml,/DOWNTIME_CENTRAL_STATE_CHANGED/,'Embedded Overview must respond to parent invalidation messages');
assert.match(overviewHtml,/setInterval\(\(\)=>refreshOverviewCentralState\(0,true\),30000\)/,'Overview must retain a slower safety refresh if Realtime disconnects');

console.log('PASS: private metadata-only central-state broadcast, authenticated subscription, live Overview refresh, dynamic STAFF cards, and cross-device fallback.');
