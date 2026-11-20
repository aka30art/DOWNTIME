import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = fs.readFileSync('supabase/migrations/20261120000000_central_cross_device_sync.sql','utf8');
const audit = fs.readFileSync('docs/CROSS_DEVICE_SYNC_AUDIT.md','utf8');

for (const table of ['downtime_app_users','downtime_auth_sessions','downtime_staff','downtime_app_config','downtime_sync_audit']) {
  assert.ok(schema.includes('create table if not exists public.' + table), 'schema includes ' + table);
}
for (const tier of ['OWNER','ADMIN','MANAGER','SUPERVISOR','USER','SPECTATOR']) {
  assert.ok(schema.includes("'" + tier + "'"), 'tier is preserved: ' + tier);
}
assert.ok(schema.includes('username text not null unique'), 'username is the central login identifier');
assert.ok(schema.includes('password_hash text not null'), 'password hashes stored server-side');
assert.ok(schema.includes('token_hash text not null unique'), 'opaque session token hashes stored');
assert.ok(schema.includes('revoked_at timestamptz'), 'session revocation is supported');
assert.ok(schema.includes('expires_at timestamptz not null'), 'session expiry is stored');
assert.ok(schema.includes('alter table public.downtime_shared_state add column if not exists version'), 'tracker version column exists');
for (const table of ['downtime_app_users','downtime_auth_sessions','downtime_staff','downtime_app_config','downtime_sync_audit','downtime_shared_state']) {
  assert.ok(schema.includes('revoke all on public.' + table + ' from anon, authenticated'), 'direct client access revoked for ' + table);
}
assert.ok(!schema.includes('auth.users'), 'schema is not dependent on Supabase Auth identities');
assert.ok(!schema.includes('email'), 'no email-based identity fields');
for (const domain of ['USERS','STAFF','Privileges','Settings','Downtime','Plant Overview','Media','Reports']) {
  assert.ok(audit.includes(domain), 'audit identifies domain: ' + domain);
}
for (const requirement of ['username-only','No email','opaque high-entropy session tokens','service-role']) {
  assert.ok(audit.toLowerCase().includes(requirement.toLowerCase()), 'audit covers auth requirement: ' + requirement);
}
console.log('Username-only central schema contract passed (static checks only).');
