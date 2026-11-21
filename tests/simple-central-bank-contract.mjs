import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20261120000001_simple_central_data_bank.sql','utf8');
const docs=fs.readFileSync('docs/SIMPLE_CENTRAL_DATABASE.md','utf8');
assert.ok(sql.includes('downtime_central_bank'), 'single central-bank table exists');
assert.ok(sql.includes("'appData'"), 'central payload contains app data');
assert.ok(sql.includes("'users'"), 'central payload contains users');
assert.ok(sql.includes("'tiers'"), 'central payload contains tier privilege map');
assert.ok(sql.includes("'staff'"), 'central payload contains staff');
assert.ok(sql.includes("'statsSource'"), 'central payload contains stats inputs');
assert.ok(sql.includes('on conflict (id) do nothing'), 'seed is non-overwriting');
assert.ok(sql.includes('revoke all on public.downtime_central_bank from anon, authenticated'), 'bank is not exposed directly to browser roles');
assert.ok(docs.includes('PINs are never stored in plaintext'), 'PIN security requirement documented');
assert.ok(docs.includes('Acceptance gate before merge or deployment'), 'deployment gate documented');
console.log('Simple central database contract checks passed (static checks only).');
