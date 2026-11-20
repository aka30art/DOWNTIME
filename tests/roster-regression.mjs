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
assert.match(html,/OPEN CENTRAL USERS & PRIVILEGES/,'main tracker links to the central admin surface');

// No legacy PIN constants, local PIN storage or direct writes to the old shared-state table remain in the tracker.
assert.doesNotMatch(html,/TEAM_PIN\s*=|PIN_OVERRIDES_KEY|operatorPins\(|operatorPrivileges\(/,'legacy local PIN/user privilege storage is absent from main tracker');
assert.doesNotMatch(html,/downtime_shared_state/,'main tracker no longer reads or writes the legacy shared-state table');
assert.match(html,/DowntimeCentral\.saveTracker\(snapshot,centralVersion\)/,'tracker changes use central versioned save');
assert.match(html,/DowntimeCentral\.state\(\)/,'manual refresh and cross-device sync read central state');
assert.match(html,/centralPendingWrites>0/,'polling is suspended while central writes are pending');

assert.match(client,/list-users/,'client loads central USER choices');
assert.match(client,/sessionStorage/,'opaque sessions are held in tab-scoped storage');
assert.match(api,/action==="save-state"/,'central API supports tracker saves');
assert.match(api,/eq\("version",Number\(body\.version\)\)\.select\("id"\)\.maybeSingle\(\)/,'tracker writes use compare-and-swap and confirm a returned row');
assert.match(api,/if\(!priv\.canManageStaff\)/,'tracker saves preserve STAFF data for non-managers');
console.log('PASS: central USERS/STAFF separation, retired local PIN auth and central versioned sync contracts.');
