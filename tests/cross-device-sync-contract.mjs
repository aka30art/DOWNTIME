import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationFiles = [
  'supabase/migrations/20261120000000_central_cross_device_sync.sql',
  'supabase/migrations/20261120000001_versioned_tracker_write.sql'
];
const [schema, rpc] = migrationFiles.map(file => fs.readFileSync(file, 'utf8'));
const audit = fs.readFileSync('docs/CROSS_DEVICE_SYNC_AUDIT.md', 'utf8');

for (const table of ['downtime_app_users','downtime_staff','downtime_app_config','downtime_sync_audit']) {
  assert.match(schema, new RegExp('create table if not exists public\\.' + table), 'schema includes ' + table);
}
for (const tier of ['OWNER','ADMIN','MANAGER','SUPERVISOR','USER','SPECTATOR']) {
  assert.ok(schema.includes("'" + tier + "'"), 'tier is preserved: ' + tier);
}
assert.match(schema, /alter table public\\.downtime_shared_state[\\s\\S]*add column if not exists version bigint/);
assert.match(schema, /alter publication supabase_realtime add table public\\.downtime_staff/);
assert.match(schema, /alter publication supabase_realtime add table public\\.downtime_app_users/);
assert.match(schema, /alter publication supabase_realtime add table public\\.downtime_app_config/);
assert.match(schema, /enable row level security/);
assert.match(schema, /auth\\.jwt\(\)->'app_metadata'->>'tier'/);
assert.match(rpc, /p_expected_version bigint/);
assert.match(rpc, /version = p_expected_version/);
assert.match(rpc, /version = version \+ 1/);
assert.match(rpc, /errcode = '40001'/);
assert.match(rpc, /revoke all on function public\\.downtime_update_shared_state[\\s\\S]*from anon/);
assert.match(rpc, /grant execute[\\s\\S]*to authenticated/);
for (const domain of ['USERS','STAFF','Privileges','Settings','Downtime','Plant Overview','Media','Reports']) {
  assert.ok(audit.includes(domain), 'audit identifies domain: ' + domain);
}
console.log('Cross-device sync contract checks passed.');
