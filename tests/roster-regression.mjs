import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html=await readFile('index.html','utf8');
const client=await readFile('central-bank-client.js','utf8');
const api=await readFile('supabase/functions/central-bank/index.ts','utf8');

// USERS and STAFF are deliberately separate central collections.
assert.match(html,/DowntimeCentral\.listUsers\(\)/,'login choices come from central USERS');
assert.match(html,/DowntimeCentral\.login\(username,pin\)/,'username/PIN authentication is central');
assert.match(html,/function staffRoster\(\)\{const names=Array\.isArray\(state\?\.staffRoster\)/,'STAFF roster is loaded from central app data');
assert.match(html,/Central USER accounts, PINs and privileges are managed in the single central database/,'local user administration is retired');
assert.match(html,/id="centralAdminNav" class="nav central-admin-nav" href="central-bank-admin.html"/,'main tracker exposes the ADMIN/JAN-only Central Data Bank navigation entry');
assert.doesNotMatch(html,/OPEN CENTRAL USERS & PRIVILEGES|centralUsersAdminLink/,'former duplicate Central Data Bank link is removed from USERS settings');

// No legacy PIN constants, local PIN storage or direct writes to the old shared-state table remain in the tracker.
assert.doesNotMatch(html,/TEAM_PIN\s*=|PIN_OVERRIDES_KEY|operatorPins\(|operatorPrivileges\(/,'legacy local PIN/user privilege storage is absent from main tracker');
assert.doesNotMatch(html,/downtime_shared_state/,'main tracker no longer reads or writes the legacy shared-state table');
assert.match(html,/DowntimeCentral\.saveTracker\(snapshot,centralVersion\)/,'tracker changes use central versioned save');
assert.match(html,/DowntimeCentral\.state\(\)/,'manual refresh and cross-device sync read central state');
assert.match(html,/centralPendingWrites>0/,'polling is suspended while central writes are pending');
assert.match(html,/if\(!centralReady\|\|cloudSyncFailed\|\|managementPollBusy\|\|cloudBusy\|\|centralPendingWrites>0\)return/,'polling is suspended after a failed central write so unsynced local edits are not overwritten');
assert.match(html,/if\(cloudSyncFailed&&!confirm\(/,'manual refresh requires confirmation before discarding a failed local snapshot');

assert.match(client,/list-users/,'client loads central USER choices');
assert.match(client,/sessionStorage/,'opaque sessions are held in tab-scoped storage');
assert.match(api,/action==="save-state"/,'central API supports tracker saves');
assert.match(api,/eq\("version",Number\(body\.version\)\)\.select\("id"\)\.maybeSingle\(\)/,'tracker writes use compare-and-swap and confirm a returned row');
assert.match(api,/if\(!priv\.canManageStaff\)/,'tracker saves preserve STAFF data for non-managers');
assert.match(api,/nextAppData\.staffRoles=nextStaffRoles/,'on-site role definitions persist in the existing Central Data Bank payload');
assert.match(api,/Reassign staff using a role before removing it/,'server rejects removal of roles still assigned to staff');
assert.match(api,/const newProfiles=structuredClone\(currentProfiles\|\|\{\}\)/,'staff profile updates retain existing records rather than replacing the directory');
assert.match(api,/\[\.\.\.retainedRoster,\.\.\.incomingRoster\]/,'staff roster updates retain archived and historical roster entries');
assert.match(api,/staff-archived|staff-restored|staff-created|staff-updated/,'staff lifecycle changes generate structured audit events');
assert.match(api,/staff-roles-updated/,'on-site role changes generate an audit event');
assert.doesNotMatch(api,/staff_account_links|link-account|unlink-account/,'the central staff directory has no account-linking feature');
console.log('PASS: central USERS/STAFF separation, retired local PIN auth and central versioned sync contracts.');
