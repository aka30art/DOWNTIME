import assert from "node:assert/strict";
import fs from "node:fs";
const source = fs.readFileSync("supabase/functions/admin-user-management/index.ts", "utf8");
for (const rule of [
  'auth.getUser(token)',
  '["OWNER", "ADMIN"].includes(callerTier)',
  'body.action === "list"',
  'body.action === "update"',
  'body.action === "delete"',
  'assignable.includes(body.tier)',
  'targetTier === "OWNER" || targetTier === "ADMIN"',
  'admin.auth.admin.listUsers',
  'admin.auth.admin.updateUserById',
  'admin.auth.admin.deleteUser',
  'SUPABASE_SECRET_KEY',
]) assert.ok(source.includes(rule), "central USERS endpoint guard/action: " + rule);
assert.ok(!source.includes('tier: "OWNER"'), "endpoint never assigns OWNER");
console.log("Central USERS management contract passed.");
