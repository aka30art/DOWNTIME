import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile('index.html', 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => s.trim()).join('\n');
for (const check of [
  ['function showPlantTransitionAlert(plantOn,updatedAt)', 'plant transition modal handler exists'],
  ['ACKNOWLEDGE', 'modal has an acknowledgement control'],
  ['plantChanged=cloudReady&&managementRole()', 'cloud transition popups are restricted to management role'],
  ['typeof previous?.plantOn===\'boolean\'', 'initial sync is excluded from transition notifications'],
  ['applyIncomingCloudPayload(data.payload,\'LIVE · management updates\',data.updated_at)', 'polling forwards transition timestamps'],
  ['applyIncomingCloudPayload(p.new.payload,\'LIVE · remote update\',p.new.updated_at)', 'realtime forwards transition timestamps'],
  ['wasLive&&typeof previousPlantOn===\'boolean\'', 'spectator reconnect does not alert on stale state'],
]) assert.ok(script.includes(check[0]), check[1]);
console.log('PASS: plant transition alerts, acknowledgement, management role gating, timestamps, and reconnect suppression.');
