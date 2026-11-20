import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile('index.html', 'utf8');
const script = [...html.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)].map(m=>m[1]).filter(s=>s.trim()).join('\\n');
assert.match(script, /function showPlantTransitionAlert\\(plantOn,updatedAt\\)/, 'plant transition modal handler exists');
assert.match(script, /ACKNOWLEDGE/, 'modal has an acknowledgement control');
assert.match(script, /plantChanged=cloudReady&&managementRole\\(\\)/, 'only management role receives cloud transition popups');
assert.match(script, /previous\\?\\.plantOn===['"]boolean['"]/, 'initial sync is excluded from transition notifications');
assert.match(script, /data\\.updated_at\\)/, 'polling forwards update timestamps for alert time');
assert.match(script, /p\\.new\\.updated_at\\)/, 'realtime forwards update timestamps for alert time');
assert.match(script, /wasLive&&typeof previousPlantOn===['"]boolean['"]/, 'spectator reconnect does not alert on stale state');
console.log('PASS: transition modal, acknowledgement, management-only gating, timestamp propagation, and reconnect suppression checks.');
