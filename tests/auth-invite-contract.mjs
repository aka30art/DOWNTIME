import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20261120000000_central_cross_device_sync.sql','utf8');
const functionSource = fs.readFileSync('supabase/functions/admin-user-invite/index.ts','utf8');

for (const policy of [
  'downtime_app_users_admin_insert',
  'downtime_app_users_admin_update',
  'downtime_app_users_admin_delete',
]) assert.ok(migration.includes(policy), 'separate write policy: ' + policy);
assert.ok(!migration.includes('for all to authenticated'), 'no broad all-operations user policy');
assert.ok(migration.includes("tier not in ('OWNER','ADMIN')"), 'ADMIN cannot create or mutate privileged tiers');
assert.ok(migration.includes("(auth.jwt()->'app_metadata'->>'tier') = 'OWNER'"), 'OWNER has explicit higher-tier policy');
for (const safeguard of [
  'startsWith("Bearer ")',
  'auth.getUser(token)',
  '["OWNER", "ADMIN"].includes(callerTier)',
  'callerTier !== "OWNER"',
  'tier === "OWNER"',
  'inviteUserByEmail',
  'updateUserById',
  'SUPABASE_SECRET_KEY',
]) assert.ok(functionSource.includes(safeguard), 'invitation function safeguard: ' + safeguard);
console.log('Auth and central USERS security contract checks passed.');
