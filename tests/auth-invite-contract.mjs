import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("supabase/functions/admin-user-invite/index.ts", "utf8");
for (const requirement of [
  'startsWith("Bearer ")',
  'auth.getUser(token)',
  '["OWNER", "ADMIN"].includes(callerTier)',
  'callerTier !== "OWNER"',
  'tier === "OWNER"',
  'inviteUserByEmail',
  'updateUserById',
  'SUPABASE_SECRET_KEY',
  'Access-Control-Allow-Origin',
]) {
  assert.ok(source.includes(requirement), "auth endpoint contains security guard: " + requirement);
}
assert.ok(!source.includes("SUPABASE_SERVICE_ROLE_KEY="), "no embedded secret");
console.log("Auth invite contract checks passed.");
