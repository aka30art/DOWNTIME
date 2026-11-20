import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationFiles = [
  'supabase/migrations/20261120000000_central_cross_device_sync.sql',
  'supabase/migrations/20261120000001_versioned_tracker_write.sql'
];
const [schema, rpc] = migrationFiles.map(file => fs.readFileSync(file, 'utf8'));
const audit = fs.readFileSync('docs/CROSS_DEVICE_SYNC_AUDIT.md', 'utf8');

for (const table of ['downtime_app_users','downtime_staff','downtime_app_config','downtime_sync_audit']) {
  assert.ok(schema.includes('create table if not exists public.' + table), 'schema includes ' + table);
}
for (const tier of ['OWNER','ADMIN','MANAGER','SUPERVISOR','USER','SPECTATOR']) {
  assert.ok(schema.includes("'" + tier + "'"), 'tier is preserved: ' + tier);
}
assert.ok(schema.includes('alter table public.downtime_shared_state') && schema.includes('add column if not exists version bigint'), 'tracker version column exists');
for (const table of ['downtime_staff','downtime_app_users','downtime_app_config']) {
  assert.ok(schema.includes('alter publication supabase_realtime add table public.' + table), 'realtime publication includes ' + table);
}
assert.ok(schema.includes('enable row level security'), 'RLS enabled');
assert.ok(schema.includes("auth.jwt()->'app_metadata'->>'tier'"), 'tier claim policies present');
assert.ok(rpc.includes('p_expected_version bigint'), 'RPC accepts expected version');
assert.ok(rpc.includes('version = p_expected_version'), 'RPC checks expected version');
assert.ok(rpc.includes('version = version + 1'), 'RPC increments version');
assert.ok(rpc.includes("errcode = '40001'"), 'RPC emits conflict SQLSTATE');
assert.ok(rpc.includes('revoke all on function public.downtime_update_shared_state') && rpc.includes('from anon'), 'RPC denies anon');
assert.ok(rpc.includes('grant execute') && rpc.includes('to authenticated'), 'RPC grants authenticated');
for (const domain of ['USERS','STAFF','Privileges','Settings','Downtime','Plant Overview','Media','Reports']) {
  assert.ok(audit.includes(domain), 'audit identifies domain: ' + domain);
}
console.log('Cross-device sync contract checks passed.');
