import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');
for(const term of ['bootstrap','photo-evidence-context','list-users','login','get-state','central-admin-state','save-state','user-save','user-delete','staff-save','staff-photo-url','staff-photo-read','staff-photo-remove','tiers-save','set-plant-status','logout','PBKDF2','downtime_central_sessions','downtime_central_bank'])assert.ok(src.includes(term),term+' implemented');
assert.ok(src.includes('150000'),'PIN hashing work factor');
assert.ok(config.includes('[functions.central-bank]')&&/verify_jwt\s*=\s*false/.test(config),'central API uses its own opaque-session verification instead of the Supabase JWT gate');
assert.ok(src.includes('eq("id",1).eq("version"'),'singleton version compare-and-swap');
assert.ok(src.includes('login-failed'),'failed login attempts are audited');
assert.ok(src.indexOf('if(action==="list-users")')>src.indexOf('const currentUser=bank.users.find'),'full user directory is only available after session resolution');
assert.ok(src.indexOf('if(action==="photo-evidence-context")')>src.indexOf('const currentUser=bank.users.find'),'photo permission context is available only after session validation');
assert.ok(src.includes('permissions:{canViewDashboards:priv.canViewDashboards===true,canEditTracker:priv.canEditTracker===true,canDeleteRecords:priv.canDeleteRecords===true}'),'photo context returns only the three server-resolved tracker capabilities');
assert.ok(src.includes('user:{username:currentUser.username,displayName:currentUser.displayName||currentUser.username}'),'photo context exposes only the authenticated actor snapshot');
assert.ok(!src.includes('login-options'),'no separate pre-authentication directory action exists');
assert.ok(src.includes('if(action==="list-users"&&!req.headers.get("x-downtime-session"))return json({users:bank.users.filter((u:any)=>u.enabled!==false).map((u:any)=>({username:u.username}))});'),'pre-authentication login directory exposes only enabled usernames, without profile or permission metadata');
assert.ok(src.includes('return json({error:"Invalid username or PIN"},401)'),'unknown usernames and incorrect PINs share a generic login error');
assert.ok(src.includes('pinSalt:"central-login-dummy-salt",pinHash:"0".repeat(64)')&&src.includes('const validPin=await verifyPin(pin,pinCandidate)'),'unknown and disabled usernames receive the same PBKDF2 verification work as invalid PIN attempts');
assert.ok(src.includes('priv.canManageUsers||priv.canViewUsers?bank.users.filter((u:any)=>u.enabled!==false).map(safeUser):[safeUser(currentUser)]'),'authenticated directory listing is permission-scoped');
assert.ok(src.includes('failedCount||0)>=5'),'server enforces a five-attempt account lock');
assert.ok(src.includes('Try again in five minutes.'),'server lockout window is communicated');
assert.ok(src.includes('await db.from("downtime_central_sessions").delete().eq("username",existing?.username||username)'), 'updating a USER revokes their prior active sessions');
assert.ok(src.includes('await db.from("downtime_central_sessions").delete().eq("username",target)'),'deleting a USER revokes their active sessions');
assert.ok(src.includes('priv.canManageUsers||priv.canViewUsers?bank.users.filter((u:any)=>u.enabled!==false).map(safeUser):[safeUser(currentUser)]'),'only authenticated USERS viewers/managers can enumerate enabled accounts');
assert.ok(src.includes('if(!priv.canViewAssignments&&!priv.canManageAssignments)'),'assignment redaction is enforced server-side unless manage access is granted');
assert.ok(src.includes('if(!priv.canViewDashboards)'),'dashboard redaction is enforced server-side');
assert.ok(src.includes('if(!priv.canViewReports)delete restrictedData.archive'),'report redaction is enforced server-side');
assert.ok(src.includes('if(!priv.canEditTracker)return json({error:"Permission denied"},403)'),'tracker writes remain gated by Edit tracker');
const plantPowerRoute=src.slice(src.indexOf('if(action==="set-plant-status")'),src.indexOf('if(action==="tiers-save")'));
assert.ok(plantPowerRoute.includes('if(!priv.canControlPlantPower)return json({error:"Permission denied"},403)'),'plant status writes use the dedicated PLANT POWER tier right');
assert.ok(!plantPowerRoute.includes('priv.canEditTracker'),'plant status control is independent of tracker editing');
assert.ok(src.includes('action:"set-plant-status"'),'plant status changes are audited');
assert.ok(src.includes('MANAGER:{canEditTracker:true'), 'MANAGER can create and edit operational records');
assert.ok(src.includes('SUPERVISOR:{canEditTracker:true')&&src.includes('canManageAssignments:true'), 'SUPERVISOR can edit existing station assignments');
assert.ok(src.includes('lockedRolePrivileges')&&src.includes('OWNER:{canEditTracker:true'), 'the root OWNER permissions remain immutable on the server');
assert.ok(src.includes('Object.fromEntries(tiers.map(tier=>[tier,{...tierDefault[tier],...(storedTiers[tier]||{})}]))')&&src.includes('Object.assign(b.tiers[tier],permissions)'), 'persisted tier payload is normalized to the approved fixed role baselines');
assert.match(src,/USER:\{canEditTracker:false,[^}]*canViewAreaPresets:false,[^}]*canViewDailyTasks:false/,'USER default includes section-level Settings denials');
assert.match(src,/SPECTATOR:\{canEditTracker:false,[^}]*canViewAreaPresets:false,[^}]*canViewDailyTasks:false/,'SPECTATOR default includes section-level Settings denials');
assert.ok(src.includes('if(action==="save-settings")')&&src.includes('const canManageAreas=priv.canManageSettings||priv.canManageAreaPresets')&&src.includes('const canManageTasks=priv.canManageSettings||priv.canManageDailyTasks'),'Settings writes are authorized by granular section permissions independently of tracker edit rights');
assert.ok(src.includes('if(existing.stationLocked===true||!priv.canManageAssignments){')&&src.includes('merged.stationLocked=existing.stationLocked===true')&&src.includes('nextAppData.operatorProfiles=savedProfiles'),
  'generic tracker saves preserve existing station assignments and lock metadata, including for locked profiles');
assert.ok(src.includes('const wasLocked=existing.stationLocked===true;')&&src.includes('const explicitlyUnlocked=profile.stationLocked===false;')&&src.includes('if(wasLocked&&!explicitlyUnlocked&&requestedStation!==currentStation)'),
  'save-settings requires an explicit unlock before changing a locked station');
assert.ok(src.includes('const nextProfile={...existingProfile,...proposedProfile,name};')&&src.includes('if(!priv.canManageAssignments){')&&src.includes('if(wasLocked&&!explicitlyUnlocked){')&&src.includes('nextProfile.stationLocked=true;')&&src.includes('nextProfile.stationLocked=proposedProfile.stationLocked===true;'),
  'legacy staff-save action independently protects locked assignments and allows only explicit unlock');
assert.ok(src.includes('if(!priv.canViewStaff&&!priv.canManageStaff)return json({error:"Permission denied"},403)'),
  'staff managers can read staff photos while view-only STAFF access is separate');

assert.ok(src.includes('The root OWNER username is fixed as DEV'), 'bootstrap fixes the root account name as DEV');
assert.ok(src.includes('Additional OWNER accounts are prohibited'), 'no secondary OWNER accounts can be created');
assert.ok(src.includes('The DEV root OWNER account cannot be deleted or removed.'), 'DEV root account cannot be deleted');
assert.ok(src.includes('addStableRecordIds')&&src.includes('candidate?.recordId===recordId'), 'server issues stable record identifiers and blocks manager/supervisor deletion');
assert.ok(src.includes('!priv.canViewReports||!priv.canDeleteRecords'), 'server preserves archive records for non-deleting roles');
assert.ok(src.includes('canAddDowntimeReasons:true')&&src.includes('existing.some((old:any)=>String(old).trim().toLowerCase()===value.trim().toLowerCase())'), 'SUPERVISOR can only append new downtime reason presets');
assert.ok(src.includes('ADMIN:{canEditTracker:true')&&src.includes('canDeleteRecords:false'), 'ADMIN deletion is limited by default and not equivalent to root OWNER');

assert.match(src,/SUPERVISOR:\{[^}]*canEditTracker:true,[^}]*canManageUsers:false,[^}]*canManageStaff:true,[^}]*canManageAssignments:true/,
  'SUPERVISOR can manage STAFF in the server tier defaults');
const lockedRoles=src.slice(src.indexOf('const lockedRolePrivileges'),src.indexOf('function addStableRecordIds'));
assert.ok(lockedRoles.includes('OWNER:{canEditTracker:true'), 'DEV root OWNER permissions are fixed');
assert.doesNotMatch(lockedRoles, /MANAGER:|SUPERVISOR:|USER:|SPECTATOR:/,
  'non-root tiers are configurable by DEV rather than locked to hard-coded baselines');

assert.ok(src.includes('if(Array.isArray(bank.appData?.dailyTaskPresets))nextAppData.dailyTaskPresets=bank.appData.dailyTaskPresets;else delete nextAppData.dailyTaskPresets'),
  'non-settings roles can complete daily tasks but cannot edit the preset list');
assert.ok(src.includes('delete nextAppData.quickReasons;delete nextAppData.recentReasons'),
  'legacy quick reason shortcut data is removed during the next central save');


for(const action of ['central-config-state','central-config-save-draft','central-config-publish','central-config-restore-draft'])assert.ok(src.includes('if(action==="'+action+'")'),'configuration control-plane action '+action);
assert.ok(src.includes('action.startsWith("central-config-")&&!isCentralBankAccess'),'configuration control-plane API denies all non-DEV identities');
assert.ok(src.includes('configState.draft_version')&&src.includes('configState.published_version'),'configuration drafts and published state have independent version pointers');
assert.ok(src.includes('downtime_central_config_state')&&src.includes('downtime_central_config_history'),'configuration control plane uses isolated tables');
assert.ok(src.includes('normalizeCentralConfig(body.config)'),'server validates configuration before saving a draft');
assert.ok(src.includes('action:"central-config-publish"'),'publishing is audited');
assert.ok(src.includes('action:"central-config-restore-draft"'),'restoring historical configuration is audited');

assert.ok(src.includes('const isCentralAdmin=isDevRoot;')&&src.includes('const isCentralBankAccess=isDevRoot;'),
  'the immutable DEV USER is the only central control-plane administrator');
assert.ok(src.includes('if(action==="user-save"){\n   if(!isDevRoot)'), 'only immutable DEV may maintain existing USER identities');
assert.ok(src.includes('if(action==="user-delete"){\n   if(!isDevRoot)'), 'only immutable DEV may perform USER lifecycle operations');
assert.ok(src.includes('if(action==="staff-save"){\n   if(!isRootAuthority)'), 'protected ROOTS identities may maintain STAFF identities');
assert.ok(src.includes('if(action==="tiers-save"){\n   return json({error:"Legacy account-tier permissions are retired. Configure department access through canonical YARD ROLE."},410);'),
  'legacy account-tier permission changes are retired');
assert.ok(src.includes('const rootsAuthority=resolveRootsAuthority(currentUser,rootsAssignment,rootsBootstrap?.user_id||null);'),
  'ROOTS identity resolves from immutable DEV bootstrap and matched USER/STAFF ROOTS assignment');
assert.ok(src.includes('const isRootAuthority=["DEV","DEV1","ADMIN"].includes(rootsAuthority||"");'),
  'DEV1 and ADMIN receive protected ROOTS status independent of legacy tiers');
assert.ok(src.includes('const isDevRoot=rootsAuthority==="DEV";'), 'DEV authority cannot be inferred from username or OWNER tier');
assert.ok(src.includes('yardRolePermissions:u.yardRolePermissions||null'), 'safe current-user contract can carry canonical rights');
assert.ok(src.includes('yardRolePermissions:resolvedYardRole?.departments||null'), 'Central Bank returns the complete five-department permission matrix to the client');
assert.ok(src.includes('const management=resolvedYardRole.departments.Management'), 'DOWNTIME enforcement separately resolves the Management department');
assert.ok(src.includes('canManageSettings:management.manage===true'),'canonical Management MANAGE can edit operational Settings; lower levels cannot');
assert.ok(src.includes('canViewStations:hasManagementAccess'),'canonical Management VIEW/INPUT/MANAGE can read Station Manager configuration');
for(const section of ['AreaPresets','ReasonPresets','ShiftSchedule','DailyTasks']){
 assert.ok(src.includes('canView'+section+':hasManagementAccess'),'Management department access grants read access to '+section);
 assert.ok(src.includes('canManage'+section+':management.manage===true'),'only Management MANAGE may edit '+section);
}
assert.ok(src.includes('canManageSettings:true,canManageAccessRights:false'),'protected DEV1/ADMIN ROOTS can manage operational Settings without opening the legacy tier rights editor');
const rootsSettingsBlock=src.slice(src.indexOf('if(isRootAuthority){'),src.indexOf('// Central Bank USER directory access'));
assert.ok(rootsSettingsBlock.includes('canManageUsers:false,canViewUsers:false'),'DEV1/ADMIN remain denied Central USER directory access');
assert.ok(src.includes('if(!(priv.canViewStations||priv.canViewAssignments||priv.canManageAssignments||priv.canManageSettings))delete restrictedData.stationConfig'),'read-authorised Management roles receive Station Manager data without assignment edit rights');

assert.ok(src.includes('managementRights?.enter===true')&&src.includes('managementRights?.edit===true')&&src.includes('managementRights?.manage===true'),
  'Management Enter, Edit and Manage are independently evaluated');
assert.ok(src.includes('Management ENTER permission is required to add operational records.')&&src.includes('Management EDIT permission is required to change operational records.')&&src.includes('Management MANAGE permission is required to remove operational records.'),
  'record creation, editing and deletion enforce separate server-side rights');
assert.ok(src.includes('Without VIEW, treat omitted records as concealed rather than deleted.'),
  'users without View cannot overwrite or delete concealed operational history');
assert.ok(src.includes('if(!isDevRoot)return json({error:"Only immutable DEV may provision new USER + STAFF identities."},403);'),
  'only immutable DEV can provision linked USER + STAFF identities');
assert.ok(src.includes('if(!isCentralBankAccess)return json({error:"Central Data Bank access is restricted to immutable DEV."},403);'),
  'whole-bank state is restricted to immutable DEV');
assert.ok(src.includes('action.startsWith("central-config-")&&!isCentralBankAccess'),
  'all global configuration actions share the immutable DEV gate');
console.log('Central API ROOTS, USER/STAFF lifecycle, Management YARD ROLE and separate record-rights contracts passed (static source checks).');

assert.ok(src.includes('priv.canManageUsers=rootsAuthority==="DEV";priv.canViewUsers=rootsAuthority==="DEV";'),'legacy tier strings cannot grant Central Bank USER directory visibility or mutation');
