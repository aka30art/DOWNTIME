import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('central-bank-admin.html','utf8');
const tracker=fs.readFileSync('index.html','utf8');
const api=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20261122060000_central_configuration_control_plane.sql','utf8');

for(const id of ['projectUrl','pubKey','loginBtn','bootstrapBtn','companyName','siteCode','sites','plants','areas','stations','areaPresets','downtimeReasons','dailyTaskPresets','equipmentCategories','eventCategories','statusCategories','weekStartsOn','breakDeductionMinutes','shiftSchedule','shiftPresets','historyList','saveDraftBtn','publishBtn','restoreVersion'])assert.ok(page.includes(id),'configuration UI element '+id);
for(const action of ['central-config-state','central-config-save-draft','central-config-publish','central-config-restore-draft','login','bootstrap','logout'])assert.ok(page.includes(action),'configuration API action '+action);
assert.ok(tracker.includes('Only immutable DEV may assign, modify or remove DEVACC. Legacy tier-permission editing is retired; department access is governed by canonical YARD ROLE and protected ROOTS authority.'),'account tier selection explains DEV-only DEVACC governance and canonical YARD ROLE');
for(const legacy of ['user-save','user-delete','staff-save','staff-photo-url','tiers-save','saveUser','saveStaff','saveTiers','centralUsersPanel','centralStaffPanel'])assert.ok(!page.includes(legacy),'new Data Bank Admin must not duplicate Access & Rights or account/staff management: '+legacy);
assert.ok(page.includes('x-downtime-session'),'configuration requests carry the opaque central session');
assert.ok(page.includes('"apikey":$("pubKey").value.trim()'),'configuration requests send the publishable API key');
assert.ok(page.includes('callConfig("central-config-state")'),'admin page loads configuration control-plane state');
assert.ok(page.includes('if(auth&&token)headers["x-downtime-session"]=token'),'session token is attached only to authenticated admin actions');
assert.ok(page.includes('Only the immutable DEV USER may access the Central Data Bank configuration control plane and manage global configuration.'),'configuration UI restricts the control plane to immutable DEV');
assert.ok(page.includes('DEVACC retains locked root-equivalent operational permissions only; it is not a ROOTS identity and has no Central Data Bank or ROOTS governance authority.'),'configuration UI separates DEVACC operational permissions from ROOTS and Central Data Bank authority');
assert.ok(page.includes('Only DEV may assign DEVACC.'),'only immutable DEV may assign DEVACC');
assert.ok(page.includes('Server-side access is restricted to the immutable DEV bootstrap identity with OWNER tier. DEVACC and all other tiers are denied regardless of client visibility; DEVACC operational permissions do not confer ROOTS authority.'),'server-side control-plane boundary is documented');
assert.ok(page.includes('IMMUTABLE DEV ONLY'),'the Data Bank badge identifies the sole authorized control-plane identity');
assert.ok(page.includes('window.confirm("AUTHORISE RELEASE v"+draftVersion'),'publishing requires an explicit confirmation after impact review');
assert.ok(page.includes('RESTORE AS DRAFT'),'history restore creates a draft rather than publishing directly');
assert.ok(page.includes('YARD HUB + R&amp;M · Read-only')&&page.includes('DOWNTIME tracker logic, records, permissions and operational workflows remain untouched'),'page documents the authenticated read-only structure integration and preserves the DOWNTIME operational boundary');
assert.ok(page.includes('YARD ROLE permissions stay separate')&&page.includes('Legacy account-tier permission editing is retired; operational department permissions are governed by canonical YARD ROLE.'),'page separates configuration management from canonical operational permission governance');
for(const term of ['draft_payload','published_payload','draft_version','published_version','next_version'])assert.ok(migration.includes(term),'isolated config schema field '+term);
assert.ok(migration.includes('downtime_central_config_history'),'append-only version history table exists');
assert.ok(migration.includes('revoke all on public.downtime_central_config_state from public, anon, authenticated'),'config state is not exposed to browser database roles');
assert.ok(migration.includes('grant all on public.downtime_central_config_state to service_role'),'only server-side service role can access config state');
for(const action of ['central-config-state','central-config-save-draft','central-config-publish','central-config-restore-draft'])assert.ok(api.includes('action==="'+action+'"'),'Edge Function supports '+action);
assert.ok(api.includes('action.startsWith("central-config-")&&!isCentralBankAccess'),'all config actions have a common server-side DEV-only gate');
assert.ok(api.includes('normalizeCentralConfig(body.config)'),'drafts are validated server-side');
assert.ok(api.includes('central-config-publish'),'publishing is a separate explicit server action');
assert.ok(api.includes('central-config-restore-draft'),'historical versions can be restored only as new drafts');

console.log('Central configuration control-plane UI, isolation, versioning and authorization contracts passed.');
