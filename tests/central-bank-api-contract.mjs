import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');
for(const term of ['bootstrap','login','get-state','central-admin-state','save-state','user-save','user-delete','staff-save','staff-photo-url','staff-photo-read','tiers-save','set-plant-status','logout','PBKDF2','downtime_central_sessions','downtime_central_bank'])assert.ok(src.includes(term),term+' implemented');
assert.ok(src.includes('150000'),'PIN hashing work factor');
assert.ok(config.includes('[functions.central-bank]')&&/verify_jwt\s*=\s*false/.test(config),'central API uses its own opaque-session verification instead of the Supabase JWT gate');
assert.ok(src.includes('eq("id",1).eq("version"'),'singleton version compare-and-swap');
assert.ok(src.includes('login-failed'),'failed login attempts are audited');
assert.ok(src.includes('failedCount||0)>=5'),'server enforces a five-attempt account lock');
assert.ok(src.includes('Try again in five minutes.'),'server lockout window is communicated');
assert.ok(src.includes('await db.from("downtime_central_sessions").delete().eq("username",existing?.username||username)'), 'updating a USER revokes their prior active sessions');
assert.ok(src.includes('await db.from("downtime_central_sessions").delete().eq("username",target)'),'deleting a USER revokes their active sessions');
assert.ok(src.includes('priv.canManageUsers||priv.canViewUsers?bank.users.map(safeUser):[safeUser(currentUser)]'),'only USERS viewers/managers can enumerate accounts');
assert.ok(src.includes('if(!priv.canViewAssignments&&!priv.canManageAssignments)'),'assignment redaction is enforced server-side unless manage access is granted');
assert.ok(src.includes('if(!priv.canViewDashboards)'),'dashboard redaction is enforced server-side');
assert.ok(src.includes('if(!priv.canViewReports)delete restrictedData.archive'),'report redaction is enforced server-side');
assert.ok(src.includes('if(!priv.canEditTracker)return json({error:"Permission denied"},403)'),'plant status and tracker writes are tier gated');
assert.ok(src.includes('action:"set-plant-status"'),'plant status changes are audited');
assert.ok(src.includes('MANAGER:{canEditTracker:true'), 'MANAGER can create and edit operational records');
assert.ok(src.includes('SUPERVISOR:{canEditTracker:true')&&src.includes('canManageAssignments:true'), 'SUPERVISOR can edit existing station assignments');
assert.ok(src.includes('lockedRolePrivileges')&&src.includes('OWNER:{canEditTracker:true'), 'the root OWNER permissions remain immutable on the server');
assert.ok(src.includes('Object.fromEntries(tiers.map(tier=>[tier,{...tierDefault[tier],...(storedTiers[tier]||{})}]))')&&src.includes('Object.assign(b.tiers[tier],permissions)'), 'persisted tier payload is normalized to the approved fixed role baselines');
assert.match(src,/USER:\{canEditTracker:false,[^}]*canViewAreaPresets:false,[^}]*canViewDailyTasks:false/,'USER default includes section-level Settings denials');
assert.match(src,/SPECTATOR:\{canEditTracker:false,[^}]*canViewAreaPresets:false,[^}]*canViewDailyTasks:false/,'SPECTATOR default includes section-level Settings denials');
assert.ok(src.includes('if(action==="save-settings")')&&src.includes('const canManageAreas=priv.canManageSettings||priv.canManageAreaPresets')&&src.includes('const canManageTasks=priv.canManageSettings||priv.canManageDailyTasks'),'Settings writes are authorized by granular section permissions independently of tracker edit rights');
assert.match(src,/if\(!priv\.canManageAssignments\)[\s\S]*if\("station" in existing\)profile\.station=existing\.station/,
  'generic tracker saves cannot overwrite staff station assignments without assignment permission');
assert.ok(src.includes('const nextProfile={...existingProfile,...proposedProfile,name};')&&src.includes('if(!priv.canManageAssignments){'),
  'legacy staff-save action independently protects station assignments');
assert.ok(src.includes('if(!priv.canViewStaff&&!priv.canManageStaff)return json({error:"Permission denied"},403)'),
  'staff managers can read staff photos while view-only STAFF access is separate');

assert.ok(src.includes('The root OWNER username is fixed as JAN'), 'bootstrap fixes the root account name as JAN');
assert.ok(src.includes('Additional OWNER accounts are prohibited'), 'no secondary OWNER accounts can be created');
assert.ok(src.includes('The JAN root OWNER account cannot be deleted or removed.'), 'JAN root account cannot be deleted');
assert.ok(src.includes('addStableRecordIds')&&src.includes('candidate?.recordId===recordId'), 'server issues stable record identifiers and blocks manager/supervisor deletion');
assert.ok(src.includes('!priv.canViewReports||!priv.canDeleteRecords'), 'server preserves archive records for non-deleting roles');
assert.ok(src.includes('canAddDowntimeReasons:true')&&src.includes('existing.some((old:any)=>String(old).trim().toLowerCase()===value.trim().toLowerCase())'), 'SUPERVISOR can only append new downtime reason presets');
assert.ok(src.includes('ADMIN:{canEditTracker:true')&&src.includes('canDeleteRecords:false'), 'ADMIN deletion is limited by default and not equivalent to root OWNER');

assert.ok(src.includes('SUPERVISOR:{canEditTracker:true,canManageUsers:false,canManageStaff:true,canManageAssignments:true'),
  'SUPERVISOR can manage STAFF in the server tier defaults');
const lockedRoles=src.slice(src.indexOf('const lockedRolePrivileges'),src.indexOf('function addStableRecordIds'));
assert.ok(lockedRoles.includes('OWNER:{canEditTracker:true'), 'JAN root OWNER permissions are fixed');
assert.doesNotMatch(lockedRoles, /MANAGER:|SUPERVISOR:|USER:|SPECTATOR:/,
  'non-root tiers are configurable by JAN rather than locked to hard-coded baselines');
assert.ok(src.includes('if(tier!=="ADMIN"&&!isJanRoot)return json({error:"Only ADMIN or the JAN root administrator can change tier access and rights"},403);'),
  'tier rights changes are restricted to the ADMIN tier and JAN root OWNER');
assert.ok(src.includes('const permissionKeys=Object.keys(tierDefault.OWNER)')&&src.includes('typeof supplied[key]!=="boolean"'),
  'tier rights updates validate the permission whitelist and boolean values');
assert.ok(src.includes('action:"tiers-save",details:{tiers:tiers.filter(role=>role!=="OWNER")}'),
  'tier rights changes are audited and exclude root OWNER permissions');

assert.ok(src.includes('if(Array.isArray(bank.appData?.dailyTaskPresets))nextAppData.dailyTaskPresets=bank.appData.dailyTaskPresets;else delete nextAppData.dailyTaskPresets'),
  'non-settings roles can complete daily tasks but cannot edit the preset list');
assert.ok(src.includes('delete nextAppData.quickReasons;delete nextAppData.recentReasons'),
  'legacy quick reason shortcut data is removed during the next central save');


for(const action of ['central-config-state','central-config-save-draft','central-config-publish','central-config-restore-draft'])assert.ok(src.includes('if(action==="'+action+'")'),'configuration control-plane action '+action);
assert.ok(src.includes('action.startsWith("central-config-")&&!isCentralAdmin'),'configuration control-plane API denies all non-ADMIN/non-JAN tiers');
assert.ok(src.includes('configState.draft_version')&&src.includes('configState.published_version'),'configuration drafts and published state have independent version pointers');
assert.ok(src.includes('downtime_central_config_state')&&src.includes('downtime_central_config_history'),'configuration control plane uses isolated tables');
assert.ok(src.includes('normalizeCentralConfig(body.config)'),'server validates configuration before saving a draft');
assert.ok(src.includes('action:"central-config-publish"'),'publishing is audited');
assert.ok(src.includes('action:"central-config-restore-draft"'),'restoring historical configuration is audited');

console.log('Central API security and isolated configuration contracts passed (static source checks).');
