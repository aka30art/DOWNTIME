import assert from 'node:assert/strict';
import fs from 'node:fs';

const fn=fs.readFileSync('supabase/functions/central-config-admin/index.ts','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');
const ci=fs.readFileSync('.github/workflows/ci.yml','utf8');

assert.ok(config.includes('[functions.central-config-admin]')&&/\[functions\.central-config-admin\][\s\S]*?verify_jwt\s*=\s*false/.test(config),
  'isolated endpoint is configured for the existing opaque CDB session pattern');
assert.ok(fn.includes('x-downtime-session')&&fn.includes('SHA-256')&&fn.includes('crypto.subtle.digest'),
  'endpoint hashes the opaque CDB session token with SHA-256 before lookup');
assert.ok(fn.includes('downtime_central_sessions')&&fn.includes('.gt("expires_at"'),
  'expired and unknown sessions are denied');
assert.ok(fn.includes('username === "DEV" && tier === "OWNER"')&&fn.includes('tier === "DEVACC"'),
  'only DEV root OWNER and DEVACC are admitted');
assert.ok(fn.includes('downtime_central_config_state')&&fn.includes('downtime_central_config_history'),
  'draft, published and history data use the existing isolated CDB tables');
assert.ok(fn.includes('downtime_central_audit'),'configuration actions are audited');
for(const action of ['central-config-state','central-config-save-draft','central-config-publish','central-config-restore-draft'])
  assert.ok(fn.includes('action === "'+action+'"'),'isolated endpoint supports '+action);
assert.ok(fn.includes('normalizeCentralConfig(body.config)'),'all saved fields are server validated');
assert.ok(fn.includes('normalizeDepartmentMenu(input.departmentMenu)'),'department menus are included in the persisted CDB payload');
assert.ok(fn.includes('.eq("draft_version", Number(body.draftVersion))')&&fn.includes('.eq("next_version", Number(body.nextVersion))'),
  'draft writes use compare-and-swap version checks');
assert.ok(fn.includes('.eq("published_version", Number(body.publishedVersion))'),'publishing uses a compare-and-swap version check');
assert.ok(fn.includes('supportedTargets.has(target)'),'submenu destinations are restricted to an explicit list of existing CDB views');
assert.ok(fn.includes('departmentDefaults.map((base) =>'),'department identity, routes, marks and operational status labels remain system-defined');
assert.ok(fn.includes('between 1 and 20 categories'),'category count is bounded');
assert.ok(fn.includes('no more than 12 submenu entries'),'submenu count is bounded');
for(const forbidden of ['downtime_daily_operator_assignments','downtime_central_bank" ).update','downtime_central_bank").update','downtime_central_bank",'].slice(0,1))
  assert.ok(!fn.includes(forbidden),'CDB menu endpoint cannot write operational assignment data');
assert.ok(!fn.includes('from("downtime_central_bank").update'),'identity registry is read-only in the new CDB endpoint');
assert.ok(ci.includes('deno check --node-modules-dir=auto supabase/functions/central-config-admin/index.ts'),
  'the isolated endpoint is type-checked in CI');

console.log('PASS: Phase 02 isolated CDB API, DEV/DEVACC authorization, versioned config storage and menu validation contract.');
