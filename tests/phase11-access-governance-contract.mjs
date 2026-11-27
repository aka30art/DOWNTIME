import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const admin = read("../central-bank-admin.html");
const centralBank = read("../supabase/functions/central-bank/index.ts");
const yardHubApi = read("../supabase/functions/yard-hub-settings-api/index.ts");
const cdbApi = read("../supabase/functions/central-config-admin/index.ts");

assert.match(admin, /data-section="access-governance"/);
assert.match(admin, /id="view-access-governance"/);
assert.match(admin, /Access &amp; Governance|Access & Governance/);
assert.match(admin, /ONE AUTHORITY PER ACCESS DOMAIN/);
assert.match(admin, /downtime_central_bank/);
assert.match(admin, /yard_hub_tier_config/);
assert.match(admin, /central-config-admin/);
assert.match(admin, /DOWNTIME and YARD HUB maintain separate tier models/);
assert.match(admin, /DEV remains the immutable root OWNER/);

const view = admin.match(/<section class="view" id="view-access-governance">([\s\S]*?)<\/section>/)?.[1];
assert.ok(view, "Access & Governance view must exist");
assert.match(view, /href="\.\/index\.html"/);
assert.doesNotMatch(view, /<input\b|<select\b|<textarea\b/i, "Overview must not expose duplicate account or permission editors");
assert.doesNotMatch(view, /PIN HASH|password input|permission matrix editor/i);

assert.match(centralBank, /downtime_central_bank/);
assert.match(centralBank, /action==="user-save"/);
assert.match(centralBank, /action==="tiers-save"/);
assert.match(centralBank, /lockedRolePrivileges/);
assert.match(yardHubApi, /yard_hub_tier_config/);
assert.match(yardHubApi, /settings-state/);
assert.match(yardHubApi, /isHubSettingsAdmin/);
assert.match(cdbApi, /from\("downtime_roots_bootstrap"\)/, "CDB access resolves the immutable DEV bootstrap USER");
assert.match(cdbApi, /resolveRootsAuthority\(user, null, rootsBootstrap\.user_id\)/, "CDB authorization uses the protected ROOTS resolver");
assert.match(cdbApi, /const isDevRoot = rootsAuthority === "DEV"/, "only immutable bootstrap DEV becomes CDB authority");
assert.match(cdbApi, /if \(!isDevRoot\) return json\(\{ error: "Central Data Bank access is restricted to immutable DEV\." \}, 403\)/, "all non-DEV identities are denied by the CDB API");
assert.ok(!cdbApi.includes("DEVACC") && !cdbApi.includes("OWNER"), "legacy tier labels cannot grant CDB configuration authority");

console.log("Phase 11 Access & Governance boundary contract: PASS");
