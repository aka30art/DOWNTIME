import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');
const ui=fs.readFileSync('yard-hub-settings.js','utf8');
const css=fs.readFileSync('yard-hub-settings.css','utf8');
const migration=fs.readFileSync('supabase/migrations/20261123212500_yard_hub_access_control.sql','utf8');
const hubApi=fs.readFileSync('supabase/functions/yard-hub-settings-api/index.ts','utf8');
const rmApi=fs.readFileSync('supabase/functions/repair-maintenance-api/index.ts','utf8');
const centralApi=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
const centralClient=fs.readFileSync('central-bank-client.js','utf8');

// YARD HUB Settings is an additive surface inside the Hub, not inside the DOWNTIME application shell.
for(const id of ['yardHubSettingsBtn','yardHubSettingsScreen','yardHubSettingsUsers','yardHubSettingsTiers','yardHubUsersList','yardHubTierCards','yardHubUserHubTier','yardHubUserDowntimeTier']) {
  assert.ok(html.includes('id="'+id+'"'),'missing YARD HUB Settings element '+id);
}
assert.match(html,/window\.YARD_HUB_SETTINGS_API=/,'Hub Settings uses a separate Edge Function endpoint');
assert.match(html,/yard-hub-settings\.js\?v=/,'Hub Settings client asset is versioned');
assert.match(html,/yard-hub-settings\.css\?v=/,'Hub Settings style asset is versioned');
assert.match(html,/data-app="floor" type="button" disabled/,'FLOOR remains unavailable until its application is released');
assert.match(html,/data-app="check-sheets" type="button" disabled/,'CHECK SHEETS remains unavailable until its application is released');
assert.match(html,/id="launchDowntimeBtn" data-app="downtime" type="button"/,'DOWNTIME launcher remains present and enabled');

// Identity and PIN management deliberately reuse the existing central directory and APIs.
assert.ok(ui.includes('window.saveDowntimeCentralUserFromYardHub||window.DowntimeCentral.saveUser'),'Hub user management reuses the existing central identity API through the DOWNTIME write queue');
assert.match(ui,/window\.DowntimeCentral\?\.session/,'Hub Settings uses the existing opaque central session');
assert.match(ui,/tier:downtimeTier/,'editing a user preserves the legacy DOWNTIME tier');
assert.match(ui,/const downtimeTier=existing\?\.legacyTier\|\|'USER'/,'new accounts default to restricted DOWNTIME USER while existing DOWNTIME tiers are preserved');
assert.match(ui,/save-user-tier/,'Hub tier assignment is stored through the separate Hub API');
assert.match(ui,/legacyTier/,'DOWNTIME tier is displayed separately from Hub tier');
assert.match(ui,/DISABLE ACCOUNT|DISABLE/,'Hub user management supports disabling accounts');
assert.doesNotMatch(ui,/DowntimeCentral\.deleteUser/,'Hub UI does not permanently delete central user identities');

// Two mutually exclusive boxes represent NONE / READ / EDIT; DOWNTIME itself is never editable here.
assert.match(ui,/yard-hub-external-tag/,'DOWNTIME has a locked external permission row');
assert.match(ui,/MANAGED SEPARATELY IN DOWNTIME/,'DOWNTIME Access & Rights remains independently managed');
assert.match(ui,/box\.checked=current===mode/,'only one access mode can be selected for a section');
assert.match(ui,/box\.dataset\.hubMode=mode/,'permission controls expose their exact mode');
assert.match(ui,/yardHubSettingsBtn/,'Hub Settings entry is managed by the Hub settings client');
assert.match(ui,/button\.hidden=true/,'Settings entry starts hidden until the server confirms access');
assert.ok(css.includes('.yard-hub-tier-card')&&css.includes('@media(max-width:700px)'),'Hub Settings UI has responsive tier cards');

// New permissions live in separate tables. The migration may read current user tiers to seed a parallel mapping,
// but it must never write the DOWNTIME bank, sessions, operational state or R&M records.
assert.match(migration,/create table if not exists public\.yard_hub_tier_config/i);
assert.match(migration,/create table if not exists public\.yard_hub_access_audit/i);
assert.match(migration,/enable row level security/gi);
assert.match(migration,/revoke all on table public\.yard_hub_tier_config from public, anon, authenticated/i);
assert.match(migration,/revoke all on table public\.yard_hub_access_audit from public, anon, authenticated/i);
assert.match(migration,/grant all on table public\.yard_hub_tier_config to service_role/i);
assert.match(migration,/grant all on table public\.yard_hub_access_audit to service_role/i);
assert.match(migration,/yard_hub_save_tier_settings/);
assert.match(migration,/on conflict \(id\) do nothing/i);
assert.match(migration,/userTiers/);
assert.doesNotMatch(migration,/update public\.downtime_central_bank/i);
assert.doesNotMatch(migration,/delete from public\.downtime_central_sessions/i);
assert.doesNotMatch(migration,/update public\.downtime_shared_state/i);
assert.doesNotMatch(migration,/delete from public\.repair_maintenance_faults/i);

// The new API reads central identity/session data, but writes only the isolated Hub config RPC.
assert.match(hubApi,/from\("downtime_central_sessions"\)[\s\S]*token_hash/,'Hub API validates the existing central session hash');
assert.match(hubApi,/from\("downtime_central_bank"\)[\s\S]*select\("payload,version"\)/,'Hub API reads the existing central user directory');
assert.match(hubApi,/isHubSettingsAdmin/);
assert.match(hubApi,/tier === "DEVACC" \|\| hubTier === "ADMIN"|hubTier === "DEVACC" \|\| hubTier === "ADMIN"/);
assert.match(hubApi,/save-user-tier/);
assert.match(hubApi,/save-tier-settings/);
assert.match(hubApi,/db\.rpc\("yard_hub_save_tier_settings"/);
assert.match(hubApi,/editableByAdmin = \["MANAGER", "SUPERVISOR", "USER", "SPECTATOR"\]/);
assert.doesNotMatch(hubApi,/from\("downtime_central_bank"\)\.update/,'Hub API must not write to the DOWNTIME user bank');
assert.doesNotMatch(hubApi,/from\("downtime_central_sessions"\)\.delete/,'Hub API must not revoke or mutate sessions itself');

// R&M reads the separately assigned Hub role and section matrix; DOWNTIME uses the original central tier.
assert.match(rmApi,/userTiers\?\.[\s\S]*repairMaintenance/,'R&M permission resolution uses Hub user-tier assignment and Hub section profile');
assert.match(rmApi,/permissions\.canEditRepairMaintenance = mode === "EDIT"/);
assert.match(rmApi,/permissions\.canDeleteRepairMaintenance = mode === "EDIT"/);
assert.match(rmApi,/permissions\.canExportRepairMaintenanceReports = mode === "READ" \|\| mode === "EDIT"/);
assert.match(rmApi,/missingHubTable/,'pre-migration fallback preserves existing R&M access behaviour');
assert.match(rmApi,/if \(!hubAccessError && !hubAccessRow\?\.payload\)/,'a present but unseeded Hub permission store fails closed');
assert.match(rmApi,/YARD HUB permissions are temporarily unavailable/,'unexpected Hub permission-store errors fail closed');

// These two existing DOWNTIME-critical files are not altered by the Hub Settings implementation.
// This contract intentionally verifies their existing API paths remain available.
for(const action of ['login','get-state','save-state','save-settings','user-save','user-delete','tiers-save','logout'])assert.ok(centralApi.includes('action==="'+action+'"')||centralApi.includes('"'+action+'"'),'central API still supports '+action);
assert.match(centralClient,/async login\(username,pin\)/);
assert.match(centralClient,/async saveTracker\(appData,version\)/);
assert.match(centralClient,/async saveUser\(data,version\)/);
assert.match(centralClient,/async saveTiers\(tiers,version\)/);


 // Regression: Hub-only tier changes must never write the legacy DOWNTIME user bank or revoke sessions.
 assert.ok(hubApi.includes('const canAccessYardHub = legacyPermissions.canAccessYardHub !== false'), 'YARD HUB entry rights are checked separately');
 assert.ok(hubApi.includes('if (!canAccessYardHub)'), 'server denies Hub settings access when Yard Hub entry access is disabled');
 assert.ok(hubApi.includes('canManageCentralUsers'), 'settings API returns the existing Central Users management capability');
 assert.ok(hubApi.includes('["DEVACC", "OWNER", "ADMIN"].includes(previousTier)'), 'non-root administrators cannot demote protected OWNER/DEVACC/ADMIN tiers');
 assert.ok(hubApi.includes('Administrators cannot change their own YARD HUB tier.'), 'admins cannot change their own Hub tier directly');
 assert.ok(hubApi.includes('Administrators cannot remove their own YARD HUB tier assignment.'), 'admins cannot remove their own Hub tier directly');
 assert.doesNotMatch(hubApi,/\.from\("downtime_central_bank"\)\.(update|insert|delete)/,'Hub settings service cannot mutate the DOWNTIME user bank');
 assert.ok(ui.includes('const centralChanges=!existing'), 'client detects whether central account fields actually changed');
 assert.ok(ui.includes('if(centralChanges){'), 'the legacy user API call is conditional on a real central account change');
 assert.ok(ui.includes('YARD HUB TIER SAVED. DOWNTIME USER DATA WAS NOT CHANGED.'), 'Hub-only tier save confirms no DOWNTIME mutation');
 assert.ok(ui.includes('state?.canManageCentralUsers!==true'), 'new user creation requires the existing Central Users right');
assert.match(config,/\[functions\.yard-hub-settings-api\][\s\S]*?verify_jwt\s*=\s*false/,'YARD HUB API validates the existing opaque session itself');

assert.ok(html.includes('window.refreshDowntimeCentralDirectory=async function()'), 'DOWNTIME exposes a central-user-only refresh hook for Hub account changes');
assert.ok(html.includes('centralBankPayload=result.payload') && html.includes('centralVersion=Number(result.version)'), 'DOWNTIME refresh updates its current bank snapshot and optimistic concurrency version');
assert.ok(ui.includes('const saveCentralUser=window.saveDowntimeCentralUserFromYardHub;'), 'Hub user changes use the serialized DOWNTIME central-user write bridge');
assert.ok(ui.includes("if(typeof saveCentralUser!=='function')throw new Error('Central user mutation bridge is unavailable."), 'Hub user changes fail closed if the serialized bridge is unavailable');
assert.doesNotMatch(ui,/window\\.DowntimeCentral\\.saveUser\\(/,'Hub UI cannot bypass the serialized central-user bridge');
assert.ok(html.includes('const freshVersion=await window.refreshDowntimeCentralDirectory()') && html.includes('verifiedVersion=await window.refreshDowntimeCentralDirectory()'), 'serialized bridge refreshes Central Bank version before and after account mutation');
assert.ok(!html.includes('window.refreshDowntimeCentralDirectory=async function(){const result=await window.DowntimeCentral.state();centralBankPayload=result.payload;state=centralAppData(centralBankPayload)'), 'central-user refresh does not replace the live DOWNTIME tracker state');

assert.ok(html.includes("function returnToYardHub()") && html.includes("window.dispatchEvent(new Event('yard-hub:shown'))"), 'returning from DOWNTIME refreshes Hub section permissions');

assert.ok(html.includes('window.saveDowntimeCentralUserFromYardHub=function(userData)'), 'Hub central user writes are serialized with DOWNTIME cloud writes');
assert.ok(html.includes('const task=cloudWrite.then(async()=>{'), 'central user writes wait behind outstanding tracker and settings writes');
assert.ok(html.includes('cloudSyncFailed)throw new Error'), 'unsynced DOWNTIME data blocks unrelated central user mutations');
assert.ok(html.includes('await window.refreshDowntimeCentralDirectory()'), 'central user mutations refresh the current Central Bank version before and after saving');
assert.ok(ui.includes('const saveCentralUser=window.saveDowntimeCentralUserFromYardHub;'), 'Hub user create/edit/disable reuses the serialized DOWNTIME bridge');

console.log('YARD HUB Settings isolation, identity compatibility, permission enforcement and DOWNTIME protection contracts passed.');

assert.ok(html.includes('centralPendingWrites++;cloudBusy=true;'), 'YARD HUB central user mutations also block realtime refreshes');
assert.ok(html.includes('flushCentralRealtimeRefresh();'), 'realtime refresh resumes after the serialized central user mutation');
assert.ok(html.includes('error.centralUserSaved=true'), 'partial central-user saves are reported without implying the write failed');
