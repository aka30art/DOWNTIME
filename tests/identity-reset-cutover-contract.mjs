import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const [migration,api,html,settings,client,packageJson] = await Promise.all([
  readFile("supabase/migrations/20261127060000_complete_identity_reset.sql","utf8"),
  readFile("supabase/functions/central-bank/index.ts","utf8"),
  readFile("index.html","utf8"),
  readFile("yard-hub-settings.js","utf8"),
  readFile("central-bank-client.js","utf8"),
  readFile("package.json","utf8").then(JSON.parse),
]);
assert.match(migration,/create or replace function public\.downtime_identity_reset_cutover/);
assert.match(migration,/select user_id[\s\S]*downtime_roots_bootstrap[\s\S]*for update/);
assert.match(migration,/v_bootstrap_user_id <> p_actor_user_id/);
assert.match(migration,/jsonb_build_array\(p_new_dev_user,p_new_dev1_user,p_new_admin_user\)/);
assert.match(migration,/jsonb_build_object\([\s\S]*'roster',jsonb_build_array\('DEV1','ADMIN'\)/);
assert.match(migration,/update public\.downtime_roots_bootstrap[\s\S]*set user_id=v_dev_user_id/);
assert.match(migration,/delete from public\.downtime_central_sessions/);
assert.match(migration,/update public\.yard_role_assignments[\s\S]*status='REVOKED'/);
assert.match(migration,/USER_YARD_ROLE_REVOKED_BY_IDENTITY_RESET/);
assert.match(migration,/update public\.yard_hub_tier_config[\s\S]*'\{userTiers\}','\{\}'/);
assert.match(migration,/identity-reset-clear-user-tiers/);
assert.match(migration,/update public\.downtime_roots_assignments[\s\S]*status='REVOKED'/);
assert.match(migration,/insert into public\.downtime_roots_assignments[\s\S]*'DEV1'[\s\S]*'ADMIN'/);
assert.match(migration,/downtime_identity_reset_runs/);
assert.doesNotMatch(migration,/delete from public\.downtime_central_audit|delete from public\.downtime_roots_assignment_audit/);
assert.doesNotMatch(migration,/delete from public\.(downtime_tracker|gatelog_|repair_maintenance_)/i);
assert.match(api,/if\(action==="identity-reset"\)[\s\S]*if\(!isDevRoot\)/);
assert.match(api,/RESET ALL IDENTITIES/);
assert.match(api,/verifyPin\(currentDevPin,currentUser\)/);
assert.match(api,/downtime_identity_reset_cutover/);
assert.match(api,/makeRootStaff\("DEV1"/);
assert.match(api,/makeRootStaff\("ADMIN"/);
assert.match(client,/resetIdentities\(data\)\{return call\("identity-reset",data\)\}/);
assert.match(html,/id="yardHubSettingsUsers"/);
assert.match(html,/id="yardHubSettingsStaff"/);
assert.match(html,/<strong>ACCESS AND RIGHTS<\/strong>/);
assert.match(html,/id="yardHubIdentityReset"/);
assert.match(html,/id="yardHubResetCurrentDevPin"/);
assert.match(html,/id="yardHubResetDevPin"/);
assert.match(html,/id="yardHubResetDev1Pin"/);
assert.match(html,/id="yardHubResetAdminPin"/);
assert.match(html,/id="yardHubResetConfirmation"/);
assert.match(settings,/executeIdentityReset/);
assert.match(settings,/window\.launchStaffWorkspace/);
assert.match(settings,/window\.openYardHubStaffManagement=openSettings/);
assert.match(html,/window\.launchStaffWorkspace=launchStaffWorkspace/);
assert.match(html,/window\.openYardHubStaffManagement==='function'/);
assert.match(settings,/openSettingsView\('roots'\)/);
assert.match(packageJson.scripts["test:user-staff-identity"],/identity-reset-cutover-contract\.mjs/);
console.log("Two-phase identity reset and YARDHUB Staff Management release contract: PASS");
