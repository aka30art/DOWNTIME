import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
for(const term of ['bootstrap','login','get-state','save-state','user-save','user-delete','staff-save','staff-photo-url','staff-photo-read','tiers-save','logout','PBKDF2','downtime_central_sessions','downtime_central_bank'])assert.ok(src.includes(term),term+' implemented');
assert.ok(src.includes('150000'), 'PIN hashing work factor');
assert.ok(src.includes('eq("id",1).eq("version"'), 'optimistic version checks present');
console.log('Central API contract checks passed (static only).');
