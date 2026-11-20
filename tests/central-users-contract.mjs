import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync("supabase/functions/central-users/index.ts","utf8");
const config=fs.readFileSync("supabase/config.toml","utf8");
for(const action of ["list","create","update","delete"]) assert.ok(source.includes('action==="'+action+'"'),"API action "+action);
assert.ok(source.includes('["OWNER","ADMIN"].includes(actor.tier)'),"Only OWNER/ADMIN access management");
assert.ok(source.includes('target.tier==="OWNER"||target.username==="jan"'),"OWNER account protected");
assert.ok(source.includes("600_000")&&source.includes("PBKDF2"),"PINs are hashed server-side");
assert.ok(source.includes("enc.encode(pin)"),"PIN value is the actual KDF input");
assert.ok(source.includes("body?.pin")&&source.includes("4–8 digits"),"PIN creation and reset validation exists");
assert.ok(!source.includes("SPECTATOR"),"Spectator tier is excluded from central user creation");
assert.ok(source.includes("revoked_at")&&source.includes('is("revoked_at",null)'),"Session revocation is enforced");
assert.ok(source.includes("downtime_sync_audit"),"User changes are audited");
assert.ok(source.includes('actor.tier==="ADMIN"&&tier==="ADMIN"'),"ADMIN cannot create another ADMIN");
assert.ok(source.includes('target.tier==="ADMIN"&&actor.tier!=="OWNER"'),"Only OWNER can manage ADMIN accounts");
assert.ok(source.includes('userId===session.user_id&&actor.tier!=="OWNER"'),"Non-owner cannot self-manage central account");
assert.ok(!source.toLowerCase().includes("email"),"No email-based workflows");
assert.ok(config.includes("[functions.central-users]")&&config.includes("verify_jwt = false"),"Function config present");

// JAN / ROOT OWNER invariants: central management must never demote, disable, rename, PIN-reset, or delete OWNER.
const updateBlock=source.slice(source.indexOf('if(action==="update")'),source.indexOf('if(action==="delete")'));
const deleteBlock=source.slice(source.indexOf('if(action==="delete")'));
assert.ok(updateBlock.includes('target.tier==="OWNER"||target.username==="jan"'),"OWNER update guard is present (covers demotion/disable/rename/PIN reset)");
assert.ok(deleteBlock.includes('target.tier==="OWNER"||target.username==="jan"'),"OWNER deletion guard is present");

console.log("Central users contract checks passed (static checks only).");
