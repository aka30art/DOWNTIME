import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');
const pagesWorkflow=fs.readFileSync('.github/workflows/pages.yml','utf8');
const ui=fs.readFileSync('yard-hub-settings.js','utf8');
const css=fs.readFileSync('yard-hub-settings.css','utf8');
const migration=fs.readFileSync('supabase/migrations/20261123212500_yard_hub_access_control.sql','utf8');
const mechanicMigration=fs.readFileSync('supabase/migrations/20261124000000_rm_mechanic_machine_presets.sql','utf8');
const hubApi=fs.readFileSync('supabase/functions/yard-hub-settings-api/index.ts','utf8');
const rmApi=fs.readFileSync('supabase/functions/repair-maintenance-api/index.ts','utf8');
const centralApi=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
const centralClient=fs.readFileSync('central-bank-client.js','utf8');
const rmHtml=fs.readFileSync('repair-maintenance.html','utf8');
const rmApp=fs.readFileSync('repair-maintenance-app.js','utf8');
const rmStructure=fs.readFileSync('repair-maintenance-structure.js','utf8');

// YARD HUB Settings is an additive surface inside the Hub, not inside the DOWNTIME application shell.
assert.match(html,/id="yardHubSettingsBtn" data-app="settings" type="button"[^>]*hidden/,'Settings must be the fifth, access-gated application tile');
assert.match(html,/\.yard-tile\[hidden\][^{]*\{display:none!important\}/,'the Settings tile must remain hidden until access is verified');
assert.doesNotMatch(html,/yard-logout yard-hub-settings-trigger/,'Settings must not remain in the authenticated-user header');
assert.match(ui,/const hero=hub\.querySelector\('\.yard-hero'\)/,'opening Settings must hide the HUB hero as well as the application menu');
assert.match(ui,/\[hero,grid,heading,footer\]\.forEach/,'Settings must replace the HUB menu instead of appearing beneath it');
assert.match(css,/\.yard-hub-settings-home\[hidden\],\.yard-hub-settings-view\[hidden\]\{display:none!important\}/,'settings home and subviews must honor hidden state so they never stack');

for(const id of ['yardHubSettingsBtn','yardHubSettingsScreen','yardHubSettingsUsers','yardHubSettingsTiers','yardHubUsersList','yardHubTierCards','yardHubUserHubTier','yardHubUserDowntimeTier']) {
  assert.ok(html.includes('id="'+id+'"'),'missing YARD HUB Settings element '+id);
}
assert.match(html,/window\.YARD_HUB_SETTINGS_API=/,'Hub Settings uses a separate Edge Function endpoint');
assert.match(html,/yard-hub-settings\.js\?v=/,'Hub Settings client asset is versioned');
assert.match(html,/yard-hub-settings\.css\?v=/,'Hub Settings style asset is versioned');
assert.match(html,/id="launchStaffManagementBtn" data-app="staff-management" type="button"/,'STAFF MANAGEMENT has a dedicated authenticated launcher');
assert.match(html,/function isStaffModuleAutoAccess\(\)[\s\S]*?tier==='DEVACC'\|\|tier==='ADMIN'/,'DEV OWNER, DEVACC and ADMIN automatically access STAFF MANAGEMENT');
assert.ok(ui.includes("key:'floor',label:'STAFF MANAGEMENT'"),'STAFF MANAGEMENT is the label shown in the Hub tier editor');
assert.match(html,/data-app="check-sheets" type="button" disabled/,'DAILY remains unavailable until its application is released');
assert.ok(ui.includes("key:'checkSheets',label:'DAILY'"),'DAILY is the label shown in the Hub tier editor');
assert.match(html,/id="launchDowntimeBtn" data-app="downtime" type="button"/,'DOWNTIME launcher remains present and enabled');
assert.ok(html.includes('yard-hub-settings.js?v=20261126-1'),'YARD HUB settings client cache is refreshed');
assert.ok(pagesWorkflow.includes("if: github.event_name == 'pull_request' || github.ref == 'refs/heads/main'"),'Pages artifact build runs on PRs for pre-merge validation');
assert.ok(pagesWorkflow.includes("if: github.ref == 'refs/heads/main'"),'Pages deployment remains restricted to main');
assert.ok(pagesWorkflow.includes('yard-hub-settings.js?v=20261126-1'),'live deployment smoke test verifies the updated Hub settings asset');
assert.ok(pagesWorkflow.includes('repair-maintenance-app.js?v=20261125-4'),'live deployment smoke test verifies the updated R&M app asset');
assert.ok(pagesWorkflow.includes('yard-hub-structure.js?v=phase09-1'),'live deployment smoke test verifies the YARD HUB structure runtime');
assert.ok(pagesWorkflow.includes('repair-maintenance-structure.js?v=phase09-1'),'live deployment smoke test verifies the R&M structure runtime');
assert.ok(rmHtml.includes('repair-maintenance-app.js?v=20261125-4'),'R&M app bundle is cache-busted for category structure updates');
assert.ok(rmHtml.includes('repair-maintenance-structure.js?v=phase09-1'),'R&M page loads the published category adapter');
assert.ok(rmHtml.includes('id="customCategoryView"'),'R&M exposes a generated placeholder workspace for custom categories');
assert.ok(rmApp.includes('function applyMachineCategoryConfig(')&&rmApp.includes('function openCustomCategory('),'R&M renders published category labels and custom placeholder categories');
assert.ok(rmStructure.includes("action:'yard-hub-menu'")&&rmStructure.includes('repairMaintenanceCategories'),'R&M reads published categories through the authenticated read-only structure endpoint');
for(const id of ['openRmsSettingsShortcut','openSettingsWorkspace','saveModelDropdownSettings','settingsAddMachineryButton','machineModelItems','presetItems'])assert.ok(pagesWorkflow.includes(id),'live deployment verification covers current RMS control '+id);
assert.ok(pagesWorkflow.includes('MACHINERY &amp; MODEL REGISTER') && pagesWorkflow.includes('REGISTERED MACHINE · FAULT REGISTER'),'live deployment verification distinguishes registered assets from make/model catalogue');
assert.ok(pagesWorkflow.includes('! grep -q \'id="openPresets"\''),'live deployment verification rejects obsolete dashboard preset control');
assert.ok(ui.includes("'MECHANIC'"),'MECHANIC appears in the YARD HUB tier selector and role list');

// Identity and PIN management deliberately reuse the existing central directory and APIs.
assert.ok(ui.includes('const saveCentralUser=window.saveDowntimeCentralUserFromYardHub;'),'Hub user management reuses the existing central identity API through the DOWNTIME write queue');
assert.ok(ui.includes("if(typeof saveCentralUser!=='function')throw new Error('Central user mutation bridge is unavailable."),'Hub user management fails closed without the serialized write bridge');
assert.ok(!ui.includes('window.DowntimeCentral.saveUser('),'Hub UI cannot bypass the serialized central-user bridge');
assert.match(ui,/window\.DowntimeCentral\?\.session/,'Hub Settings uses the existing opaque central session');
assert.match(ui,/tier:downtimeTier/,'editing a user preserves the legacy DOWNTIME tier');
assert.match(ui,/const downtimeTier=existing\?\.legacyTier\?\?null/,'new canonical identities carry no legacy DOWNTIME tier while existing legacy tiers are preserved');
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
assert.match(hubApi,/editableByAdmin = \["MANAGER", "SUPERVISOR", "MECHANIC", "USER", "SPECTATOR"\]/);
assert.ok(hubApi.includes('"MECHANIC"'),'YARD HUB tier validator includes MECHANIC');
assert.ok(hubApi.includes('"SUPERVISOR", "MECHANIC", "USER"'),'YARD HUB admins may assign MECHANIC');
assert.doesNotMatch(hubApi,/from\("downtime_central_bank"\)\.update/,'Hub API must not write to the DOWNTIME user bank');
assert.doesNotMatch(hubApi,/from\("downtime_central_sessions"\)\.delete/,'Hub API must not revoke or mutate sessions itself');

// R&M reads the separately assigned Hub role and section matrix; DOWNTIME uses the original central tier.
assert.match(rmApi,/userTiers\?\.[\s\S]*repairMaintenance/,'R&M permission resolution uses Hub user-tier assignment and Hub section profile');
assert.match(rmApi,/permissions\.canEditRepairMaintenance = mode === "EDIT"/);
assert.match(rmApi,/permissions\.canDeleteRepairMaintenance = mode === "EDIT"/);
assert.match(rmApi,/permissions\.canExportRepairMaintenanceReports = mode === "READ" \|\| mode === "EDIT"/);
assert.match(rmApi,/missingHubTable/,'pre-migration fallback preserves existing R&M access behaviour');
assert.ok(rmApi.includes('permissions.canManageRepairMaintenancePresets = permissions.canEditRepairMaintenance === true'),'preset management requires R&M EDIT access');
assert.ok(rmApi.includes('action === "preset-add"') && rmApi.includes('action === "preset-delete"'),'preset mutations are backend actions');
assert.ok(mechanicMigration.includes("'floor','NONE','checkSheets','NONE','repairMaintenance','EDIT'"),'MECHANIC defaults to R&M EDIT only');
assert.ok(mechanicMigration.includes('yard_hub_access_audit'),'MECHANIC tier addition is audited');
assert.ok(mechanicMigration.includes('enable row level security'),'preset data has RLS enabled');
assert.ok(mechanicMigration.includes('revoke all on table public.repair_maintenance_machine_presets from public, anon, authenticated'));
assert.ok(mechanicMigration.includes('grant all on table public.repair_maintenance_machine_presets to service_role'));
assert.doesNotMatch(mechanicMigration,/update public\.downtime_central_bank/i);
assert.doesNotMatch(mechanicMigration,/update public\.downtime_shared_state/i);
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
 assert.match(ui,/const centralChanges=!pendingProvisioning&&\(!existing\|\|[\s\S]*?displayName!==\(existing\.displayName\|\|existing\.username\)[\s\S]*?pin\.length>0[\s\S]*?enabled!==\(existing\.enabled!==false\)\);/,'client detects new accounts and changes to display name, PIN or enabled state while excluding pending provisioning');
 assert.match(centralApi,/if\(!existing\)return json\(\{error:"New accounts must use the canonical USER \+ STAFF \+ YARD ROLE provisioning workflow\."\},409\)/,'legacy Central Bank user-save rejects new identities until canonical USER/STAFF provisioning is available');
 assert.ok(ui.includes('if(centralChanges){'), 'the legacy user API call is conditional on a real central account change');
 assert.ok(ui.includes('YARD HUB TIER SAVED. DOWNTIME USER DATA WAS NOT CHANGED.'), 'Hub-only tier save confirms no DOWNTIME mutation');
 assert.ok(ui.includes('state?.canManageCentralUsers!==true'), 'new user creation requires the existing Central Users right');
assert.match(config,/\[functions\.yard-hub-settings-api\][\s\S]*?verify_jwt\s*=\s*false/,'YARD HUB API validates the existing opaque session itself');

assert.ok(html.includes('window.refreshDowntimeCentralDirectory=async function()'), 'DOWNTIME exposes a central-user-only refresh hook for Hub account changes');
assert.ok(html.includes('centralBankPayload=result.payload') && html.includes('centralVersion=Number(result.version)'), 'DOWNTIME refresh updates its current bank snapshot and optimistic concurrency version');
assert.ok(ui.includes('const saveCentralUser=window.saveDowntimeCentralUserFromYardHub;'), 'Hub user changes use the serialized DOWNTIME central-user write bridge');
assert.ok(ui.includes("if(typeof saveCentralUser!=='function')throw new Error('Central user mutation bridge is unavailable."), 'Hub user changes fail closed if the serialized bridge is unavailable');
assert.ok(!ui.includes('window.DowntimeCentral.saveUser('), 'Hub UI cannot bypass the serialized central-user bridge');
assert.ok(html.includes('const freshVersion=await window.refreshDowntimeCentralDirectory()') && html.includes('verifiedVersion=await window.refreshDowntimeCentralDirectory()'), 'serialized bridge refreshes Central Bank version before and after account mutation');
assert.ok(!html.includes('window.refreshDowntimeCentralDirectory=async function(){const result=await window.DowntimeCentral.state();centralBankPayload=result.payload;state=centralAppData(centralBankPayload)'), 'central-user refresh does not replace the live DOWNTIME tracker state');

assert.ok(html.includes("function returnToYardHub()") && html.includes("window.dispatchEvent(new Event('yard-hub:shown'))"), 'returning from DOWNTIME refreshes Hub section permissions');

assert.ok(html.includes('window.saveDowntimeCentralUserFromYardHub=function(userData)'), 'Hub central user writes are serialized with DOWNTIME cloud writes');
assert.ok(html.includes('const task=cloudWrite.then(async()=>{'), 'central user writes wait behind outstanding tracker and settings writes');
assert.ok(html.includes('cloudSyncFailed)throw new Error'), 'unsynced DOWNTIME data blocks unrelated central user mutations');
assert.ok(html.includes('await window.refreshDowntimeCentralDirectory()'), 'central user mutations refresh the current Central Bank version before and after saving');
assert.ok(ui.includes('const saveCentralUser=window.saveDowntimeCentralUserFromYardHub;'), 'Hub user create/edit/disable reuses the serialized DOWNTIME bridge');

assert.ok(ui.includes("key:'repairMaintenanceMachinery',label:'R&M MACHINERY'"),'R&M MACHINERY has independent READ / EDIT controls in TIERS');
assert.ok(hubApi.includes('repairMaintenanceMachinery'),'Hub Settings normalizes and persists the new machinery permission');
assert.ok(hubApi.includes('value[key] ?? value.repairMaintenance'),'existing tier values safely seed the new permission');
assert.ok(rmApi.includes('permissions.canReadRepairMaintenanceMachinery')&&rmApi.includes('permissions.canManageRepairMaintenanceMachinery'),'R&M API enforces separate machinery READ / EDIT permissions');
assert.ok(rmApi.includes('const rootOperator =')&&rmApi.includes('hubTier === "DEVACC"'),'DEV and DEVACC retain root machinery permissions');

console.log('YARD HUB Settings isolation, identity compatibility, permission enforcement and DOWNTIME protection contracts passed.');

assert.ok(html.includes('centralPendingWrites++;cloudBusy=true;'), 'YARD HUB central user mutations also block realtime refreshes');
assert.ok(html.includes('flushCentralRealtimeRefresh();'), 'realtime refresh resumes after the serialized central user mutation');
assert.ok(html.includes('error.centralUserSaved=true'), 'partial central-user saves are reported without implying the write failed');

assert.ok(ui.includes("const modes=['NONE','READ','INPUT','EDIT']"),'YARD HUB tier UI includes INPUT mode');
assert.ok(ui.includes("['READ','INPUT','EDIT'].forEach(mode=>{"),'YARD HUB tier UI renders INPUT checkbox');
assert.ok(hubApi.includes('["NONE", "READ", "INPUT", "EDIT"]'),'YARD HUB settings API validates INPUT mode');

// Custom YARD HUB tiers are root-managed and persisted independently.
assert.ok(ui.includes('function addCustomTier()'),'custom tier creation workflow exists');
assert.ok(ui.includes('workingPayload.customTiers'),'custom tier definitions are included in saved payload');
assert.ok(ui.includes('allRoles().forEach(role=>'),'custom profiles render with built-in tiers');
assert.ok(html.includes('id="yardHubCustomTierAdd"'),'tier screen exposes custom tier creation');
assert.ok(hubApi.includes('Invalid custom tier names.'),'API validates custom tier names');
assert.ok(hubApi.includes('Only DEV / DEVACC may assign custom YARD HUB tiers.'),'only root operators may assign custom tiers');
assert.ok(hubApi.includes('Only DEV / DEVACC may create or change custom tiers.'),'only root operators may change tier definitions');

// Custom tiers remain assignable after creation, and deletion is protected against orphaning users.
assert.ok(hubApi.includes('customTiers.includes(saved)'), 'server resolves assigned custom tiers instead of silently downgrading users to USER');
assert.ok(hubApi.includes('removedCustomTiers'), 'server detects custom tier removals');
assert.ok(hubApi.includes('Reassign every user from '), 'server blocks deletion while any account remains assigned');
assert.ok(ui.includes('function deleteTier(role)'), 'root tier management includes a delete workflow');
assert.ok(ui.includes("remove.type='button'"), 'custom tier delete control is an explicit button');
assert.ok(ui.includes("setStatus('REASSIGN '"), 'client warns when a custom tier still has assigned users');

// Tier assignment accepts every active tier; tier removal protects DEV and DEVACC.
assert.ok(ui.includes("if(!allRoles().includes(hubTier))"), 'custom and built-in active tiers pass user assignment validation');
assert.ok(ui.includes("!['OWNER','DEVACC'].includes(role)"), 'only OWNER/DEV and DEVACC tier profiles are protected from deletion');
assert.ok(ui.includes('function deleteTier(role)'), 'all other tiers can be removed through one workflow');
assert.ok(hubApi.includes('retiredTiers'), 'built-in tier removals persist as retired tier profiles');
assert.ok(hubApi.includes('removedBuiltInTiers'), 'backend validates built-in tier removals');
assert.ok(hubApi.includes('activeTierNames.filter(name => ![\"OWNER\", \"DEVACC\"].includes(name))'), 'backend prevents root admins from modifying protected OWNER and DEVACC permission profiles');
