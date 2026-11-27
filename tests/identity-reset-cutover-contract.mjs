import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration,legacyResetGuard,api,yardApi,html,settings,client,packageJson] = await Promise.all([
  readFile("supabase/migrations/20261127100000_preserve_dev_identity_and_rooted_roles.sql","utf8"),
  readFile("supabase/migrations/20261127100001_disable_legacy_identity_reset_rpc.sql","utf8"),
  readFile("supabase/functions/central-bank/index.ts","utf8"),
  readFile("supabase/functions/yard-hub-settings-api/index.ts","utf8"),
  readFile("index.html","utf8"),
  readFile("yard-hub-settings.js","utf8"),
  readFile("central-bank-client.js","utf8"),
  readFile("package.json","utf8").then(JSON.parse),
]);

assert.match(migration,/create table if not exists public\.downtime_roots_role_definitions/);
assert.match(migration,/role_key text primary key check \(role_key in \('DEV1','ADMIN'\)\)/);
assert.match(migration,/visibility text not null default 'DEV_ONLY'/);
assert.match(migration,/on conflict \(role_key\) do nothing/);
assert.match(migration,/downtime_identity_reset_preserve_dev/);
assert.match(migration,/v_bootstrap_user_id <> p_actor_user_id/);
assert.match(migration,/p_actor_session_hash/);
assert.match(migration,/v_dev_user jsonb/);
assert.match(migration,/jsonb_build_array\(v_dev_user\)/,"only the existing DEV account survives the USER directory reset");
assert.match(migration,/set payload=v_next_payload/);
assert.match(migration,/\{roster\}','\[\]'/);
assert.match(migration,/\{profiles\}','\{\}'/);
assert.match(migration,/\{staffRoster\}','\[\]'/);
assert.match(migration,/\{operatorProfiles\}','\{\}'/);
assert.match(migration,/status='REVOKED'/);
assert.match(migration,/identity-reset-clear-user-tiers/);
assert.match(migration,/values\(true,p_actor_user_id,p_actor_user_id\)/,"reset marker records the same immutable DEV ID before and after");
assert.match(legacyResetGuard,/revoke all on function public\.downtime_identity_reset_cutover[\s\S]*from public, anon, authenticated, service_role/);
assert.doesNotMatch(migration,/p_new_dev_user|p_new_dev1_user|p_new_admin_user|makeRootStaff/);
assert.doesNotMatch(migration,/update public\.downtime_roots_bootstrap\s+set user_id=/,"the immutable DEV bootstrap ID is never replaced");
assert.doesNotMatch(migration,/delete from public\.(downtime_tracker|gatelog_|repair_maintenance_)/i);

assert.match(api,/if\(action==="identity-reset"\)[\s\S]*if\(!isDevRoot\)/);
assert.match(api,/KEEP DEV - CLEAR USERS STAFF PHOTOS/);
assert.match(api,/verifyPin\(currentDevPin,currentUser\)/);
assert.match(api,/downtime-staff-photos/);
assert.match(api,/listAllStaffPhotoPaths/);
assert.match(api,/GITHUB_STAFF_IMAGE_TOKEN/);
assert.match(api,/assets\/staff\/originals/);
assert.match(api,/method:"DELETE"/);
assert.match(api,/listGithubStaffOriginals/);
assert.match(api,/remainingGitHub/);
assert.match(api,/downtime_identity_reset_preserve_dev/);
assert.match(api,/p_actor_session_hash:tokenHash/);
assert.doesNotMatch(api,/downtime-evidence|downtime-pdfs|repair-maintenance-evidence|repair-maintenance-reports/);

const rootsState = yardApi.slice(yardApi.indexOf('if (action === "roots-state")'),yardApi.indexOf('if (action === "roots-manage")'));
assert.match(rootsState,/if \(!rootCapabilities\.canBrowseRoots\)/);
assert.match(rootsState,/downtime_roots_role_definitions/);
assert.match(rootsState,/roleDefinitions: roleDefinitions/);

assert.match(html,/id="yardHubIdentityReset"/);
assert.match(html,/id="yardHubResetCurrentDevPin"/);
assert.match(html,/KEEP DEV - CLEAR USERS STAFF PHOTOS/);
assert.match(html,/DEV keeps the same immutable USER ID, PIN credentials and current session/);
assert.match(html,/DEV1 and ADMIN are created as protected ROOTED role definitions only/);
assert.match(html,/GitHub STAFF originals library/);
assert.doesNotMatch(html,/yardHubResetDevPin|yardHubResetDev1Pin|yardHubResetAdminPin/);
assert.match(html,/id="yardHubRootRoleDefinitions"/);
assert.match(html,/id="yardHubRootRoleDefinitionsList"/);

assert.match(settings,/executeIdentityReset/);
assert.match(settings,/KEEP DEV - CLEAR USERS STAFF PHOTOS/);
assert.match(settings,/window\.DowntimeCentral\.resetIdentities\(\{confirmation,currentDevPin\}\)/);
assert.match(settings,/staffOriginalsDeleted/);
assert.match(settings,/window\.location\.reload\(\)/);
assert.doesNotMatch(settings,/DowntimeCentral\.logout\(\)/);
assert.match(settings,/roleDefinitions\|\|\[\]/);
assert.match(settings,/roleSection\.hidden=!rootDev\(\)/);
const rootsUi = settings.slice(settings.indexOf('async function loadRootsState()'),settings.indexOf('async function assignSelectedRoot()'));
assert.match(rootsUi,/if\(roleSection\)roleSection\.hidden=true;[\s\S]*if\(dev1\)/,"DEV-only ROOTED role UI is hidden before handling a non-DEV ROOTS authority");
assert.match(rootsUi,/if\(roleHost\)roleHost\.replaceChildren\(\)/,"cached ROOTED role definitions are cleared when ROOTS authority changes");

assert.match(client,/resetIdentities\(data\)\{return call\("identity-reset",data\)\}/);
assert.match(packageJson.scripts["test:user-staff-identity"],/identity-reset-cutover-contract\.mjs/);
console.log("DEV-preserving USER/STAFF reset and DEV-only ROOTED role definitions contract: PASS");
