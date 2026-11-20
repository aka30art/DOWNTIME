import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync('central-bank-client.js','utf8');
for(const action of ['list-users','login','get-state','save-state','user-save','user-delete','staff-save','tiers-save','staff-photo-url','staff-photo-read','bootstrap','logout'])assert.ok(src.includes(action),action+' browser adapter method/action');
assert.ok(src.includes('x-downtime-session'),'session header');
assert.ok(src.includes('sessionStorage'),'session persistence');
console.log('Central browser adapter contract checks passed (static only).');
