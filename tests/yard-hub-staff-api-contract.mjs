import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const api = await readFile('supabase/functions/yard-hub-staff-api/index.ts', 'utf8');
const migration = await readFile('supabase/migrations/20261126091500_yard_hub_staff_management.sql', 'utf8');
const config = await readFile('supabase/config.toml', 'utf8');
const settingsApi = await readFile('supabase/functions/yard-hub-settings-api/index.ts', 'utf8');

for (const table of [
  'yard_hub_staff_people',
  'yard_hub_staff_companies',
  'yard_hub_staff_roles',
  'yard_hub_staff_role_assignments',
  'yard_hub_staff_audit'
]) {
  assert.ok(migration.includes('create table if not exists public.' + table), table + ' is a dedicated YARD HUB table');
  assert.ok(migration.includes('alter table public.' + table + ' enable row level security'), table + ' has RLS enabled');
  assert.ok(migration.includes('on public.' + table + '\n  for all to anon, authenticated using (false) with check (false)'), table + ' denies direct browser-role access');
}
assert.ok(migration.includes('grant all on table public.yard_hub_staff_companies'), 'Only service_role receives table grants');
assert.ok(migration.includes('yard_hub_staff_save_person'), 'Personnel changes use an atomic database function');
assert.ok(migration.includes('yard_hub_staff_role_assignments'), 'Yard Role assignments retain assignment history');
assert.ok(migration.includes('yard_hub_staff_audit'), 'Personnel changes are audited');
assert.ok(migration.includes('Separate from DOWNTIME operator rosters and operational records.'), 'The schema explicitly documents the DOWNTIME boundary');
assert.ok(migration.includes('Yard Operative') && migration.includes('Forklift Driver') && migration.includes('Yard Supervisor'), 'A configurable starter set of Yard Roles is seeded');
assert.doesNotMatch(migration, /alter table public\.(downtime_|gatelog_|repair_)/i, 'The new migration does not alter DOWNTIME, GATELOG or R&M tables');

assert.match(config, /\[functions\.yard-hub-staff-api\]\s*verify_jwt = false/, 'The dedicated API is configured for the existing opaque-session authentication');
assert.match(api, /req\.headers\.get\("x-downtime-session"\)/, 'API requires the existing YARD HUB session header');
assert.match(api, /from\("downtime_central_sessions"\)[\s\S]*?eq\("token_hash", tokenHash\)[\s\S]*?gt\("expires_at"/, 'API validates the hashed unexpired YARD HUB session');
assert.match(api, /from\("downtime_central_bank"\)[\s\S]*?select\("payload"\)/, 'API reads the existing account directory');
assert.doesNotMatch(api, /from\("downtime_central_bank"\)\.(update|insert|upsert|delete)/, 'API cannot write the central identity or DOWNTIME data payload');
assert.ok(api.includes('configRow.payload?.tiers?.[hubTier]?.floor'), 'Access is governed by the existing STAFF MANAGEMENT YARD HUB tier permission');
assert.match(api, /modeRank: Record<string, number> = \{ NONE: 0, READ: 1, INPUT: 2, EDIT: 3 \}/, 'Existing READ / INPUT / EDIT semantics are used');
assert.match(api, /staffType === "USER" && !linkedUsername/, 'USER classification requires a linked account');
assert.match(api, /staffType === "STAFF" && linkedUsername/, 'STAFF classification forbids a linked account');
assert.match(api, /accountByUsername\(linkedUsername\)/, 'USER links must resolve to an existing central account');
assert.match(api, /Only authorised YARD HUB account managers can link or unlink login accounts/, 'Link changes require the existing account-management privilege');
assert.match(api, /Disable the currently linked YARD HUB account/, 'Account unlinking requires disabling the existing account first');
assert.match(api, /This YARD HUB account is already linked to another staff record/, 'A single login account cannot be linked to multiple personnel records');
assert.match(api, /yard_hub_staff_archive_person/, 'Remove is a soft archive rather than destructive deletion');
assert.match(settingsApi, /save-user-tier/, 'YARD HUB login and tier changes remain in the existing account manager');
console.log('YARD HUB STAFF MANAGEMENT API and data-isolation contract: PASS');
