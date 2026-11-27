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
assert.ok(src.includes('userId:currentUser.userId||null,staffId:currentUser.staffId||null'),'photo context binds uploads to immutable authenticated identity IDs');
assert.ok(src.includes('const loadProtectedRootUserIds=async()'),'Central Bank enumerations resolve protected identities before returning account data');
assert.ok(src.includes('if(protectedTarget&&rootsAuthority!=="DEV")'),'ordinary account updates cannot alter protected ROOTS identities');
assert.ok(src.includes('Protected ROOTS identities cannot be deleted through ordinary account management.'),'ordinary account deletion cannot remove protected ROOTS identities');
assert.ok(src.includes('lookupProtectedStaff'),'generic STAFF settings saves preserve protected ROOTS profiles');
assert.ok(src.includes('hideProtectedRootStaff')&&src.includes('rootDirectory.staffIds'),'Central Bank payloads hide protected ROOTS STAFF identities from non-DEV users');
assert.ok(src.includes('getProtectedRootStaffNames')&&src.includes('visibleRoster'),'daily operator assignment cannot target protected ROOTS STAFF identities');
assert.ok(src.includes('history:(history||[]).filter')&&src.includes('publicBank.dailyOperators=(dailyOperators||[])'),'daily operator views hide protected ROOTS STAFF records from non-DEV users');
assert.ok(src.includes('Only immutable DEV may view protected ROOTS STAFF photos.'),'protected ROOTS STAFF photos cannot be inspected by other administrators');
assert.ok(src.includes('if(action==="roots-state")')&&src.includes('rootsAuthority!=="DEV"'),'only immutable DEV can browse protected ROOTS assignments');
assert.ok(src.includes('action==="roots-assign-admin"&&requestedClass!=="ADMIN"'),'DEV1 scoped action can assign ADMIN only');
assert.ok(src.includes('requestedClass==="DEV1"&&rootsAuthority!=="DEV"'),'DEV1 cannot assign another DEV1');
assert.ok(src.includes('downtime_roots_assign_identity'),'ROOTS assignments use the service-role atomic assignment RPC');
assert.ok(src.includes('String(profile.staffId||"").toLowerCase()===String(target.staffId).toLowerCase()&&String(profile.linkedUserId||"").toLowerCase()===String(target.userId).toLowerCase()')&&src.includes('!linkedProfile||String(linkedProfile.status||"").toUpperCase()!=="ACTIVE"'),'ROOTS assignments require an active reciprocal immutable USER/STAFF link');
assert.ok(src.includes('user:{username:currentUser.username,displayName:currentUser.displayName||currentUser.username,userId:currentUser.userId||null,staffId:currentUser.staffId||null}'),'photo context exposes authenticated actor and immutable identity IDs only');
assert.ok(!src.includes('login-options'),'no separate pre-authentication directory action exists');
assert.ok(src.includes('if(action==="list-users"&&!req.headers.get("x-downtime-session"))return json({users:bank.users.map((u:any)=>({username:u.username}))});'),'legacy cached login clients receive usernames only, without profile or permission metadata');
assert.ok(src.includes('return json({error:"Invalid username or PIN"},401)'),'unknown usernames and incorrect PINs share a generic login error');
assert.ok(src.includes('pinSalt:"central-login-dummy-salt",pinHash:"0".repeat(64)')&&src.includes('const validPin=await verifyPin(pin,pinCandidate)'),'unknown and disabled usernames receive the same PBKDF2 verification work as invalid PIN attempts');
assert.ok(src.includes('priv.canManageUsers||priv.canViewUsers?directoryUsers.map(safeUser):[safeUser(currentUser)]')&&src.includes('loadProtectedRootUserIds'),'authenticated directory listing is permission-scoped and hides protected ROOTS identities');
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
assert.ok(src.includes("const isAccessRightsAdmin=tier===\"ADMIN\"&&priv.canManageAccessRights===true")&&src.includes("const editableRoles=isCentralBankAccess?tiers:[\"MANAGER\",\"SUPERVISOR\",\"USER\",\"SPECTATOR\"]"),
  "tier rights changes allow root or delegated ADMIN scope only");
assert.ok(src.includes('const isCentralAdmin=tier==="ADMIN"||isRootAuthority;'),'ADMIN and root-equivalent identities can manage account tiers');
assert.ok(src.includes('if((!existing||newTier!==existing.tier)&&!isCentralAdmin)return json({error:"Only ADMIN, DEV and DEVACC can create accounts or assign user tiers."},403);'),
  'ADMIN and root-equivalent DEV/DEVACC may manage account tiers');
assert.ok(src.includes('if(!priv.canManageUsers)return json({error:"Permission denied"},403);'),
  'other existing account maintenance remains subject to user-management rights');
assert.ok(src.includes('const permissionKeys=Object.keys(tierDefault.OWNER)')&&src.includes('typeof supplied[key]!=="boolean"'),
  'tier rights updates validate the permission whitelist and boolean values');
assert.ok(src.includes('action:"tiers-save",details:{tiers:editableRoles.reduce'),
  "tier rights changes are audited with the permitted role scope");

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


assert.ok(src.includes('const isDevRoot=currentUsername==="DEV"&&tier==="OWNER"'),'DEV is the permanent root OWNER identity');
assert.ok(src.includes('const isDevacc=tier==="DEVACC";')&&src.includes('const isRootAuthority=isDevRoot||isDevacc;')&&src.includes('const isCentralBankAccess=isRootAuthority;'),'DEVACC is a root-equivalent Data Bank principal');
assert.ok(src.includes('if(!isCentralBankAccess)return json({error:"Central Data Bank access is restricted to DEV and DEVACC only."},403);'),'whole-bank state is limited to DEV and DEVACC');
assert.ok(src.includes('action.startsWith("central-config-")&&!isCentralBankAccess'),'all configuration control-plane actions share the DEV/DEVACC gate');
assert.ok(src.includes("const isAccessRightsAdmin=tier===\"ADMIN\"&&priv.canManageAccessRights===true"),"delegated ADMIN permission is checked server-side");
assert.ok(src.includes('if(newTier==="DEVACC"&&(!existing||existing.tier!=="DEVACC")&&!isDevRoot)return json({error:"Only root DEV can assign DEVacc."},403);'),'only root DEV can grant or promote an account to DEVACC');
assert.ok(src.includes('if(existing?.tier==="DEVACC"&&!isCentralBankAccess)return json({error:"Only DEV and DEVACC can modify DEVacc."},403);'),'DEVACC retains authority to edit existing DEVACC accounts');
assert.ok(src.includes('if(existing?.tier==="DEVACC"&&!isCentralBankAccess)return json({error:"Only DEV and DEVACC can modify DEVacc."},403);'),'DEVACC may modify, disable and restore DEVACC users');
assert.ok(src.includes('&&!isCentralBankAccess)return json({error:"Only DEV and DEVACC can remove DEVacc."},403);'),'DEVACC may remove other DEVACC users');
assert.ok(!src.includes('Only one DEVacc account is permitted.'),'the one-DEVACC account restriction is removed');
assert.ok(src.includes('if(newTier==="OWNER")return json({error:"DEV is the only OWNER account. Additional OWNER accounts are prohibited."},403);'),'root-equivalent accounts cannot create a second OWNER');
assert.ok(src.includes('if(!isDevRoot)return json({error:"Only root DEV can update root credentials."},403);'),'only DEV can update its permanent root credentials');
assert.ok(src.includes('The DEV root OWNER account cannot be deleted or removed.'),'DEV root cannot be deleted');
assert.ok(!src.includes('root-account-split')&&!src.includes('isLegacyJanRoot'),'obsolete JAN split authorization is removed');

assert.ok(src.includes('const permissionKeys=Object.keys(tierDefault.OWNER)')&&src.includes('typeof supplied[key]!=="boolean"'),'tier rights updates validate the permission whitelist and boolean values');
assert.ok(src.includes('action:"tiers-save",details:{tiers:editableRoles.reduce'),"tier changes are audited by permitted scope");
for(const action of ['central-config-state','central-config-save-draft','central-config-publish','central-config-restore-draft'])assert.ok(src.includes('if(action==="'+action+'")'),'configuration control-plane action '+action);
assert.ok(src.includes('configState.draft_version')&&src.includes('configState.published_version'),'configuration drafts and published state have independent version pointers');
assert.ok(src.includes('downtime_central_config_state')&&src.includes('downtime_central_config_history'),'configuration control plane uses isolated tables');
assert.ok(src.includes('normalizeCentralConfig(body.config)'),'configuration is validated server-side before saving');
assert.ok(src.includes('action:"central-config-publish"')&&src.includes('action:"central-config-restore-draft"'),'publish and restore actions are separately audited');
console.log('Central API security, DEVACC root equivalence, immutable DEV OWNER and configuration contracts passed (static source checks).');
