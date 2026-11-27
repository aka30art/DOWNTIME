import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const edge = await readFile("supabase/functions/central-bank/index.ts", "utf8");
const migration = await readFile("supabase/migrations/20261127110000_canonical_user_session_tier_nullable.sql", "utf8");

assert.match(edge, /downtime_central_sessions"\)\.insert\(\{token_hash:tokenHash,username:user\.username,expires_at:expires\.toISOString\(\)\}\)/,
  "new canonical USER sessions must not write the retired legacy tier");
assert.match(edge, /downtime_central_sessions"\)\.select\("username,expires_at"\)/,
  "session resolution must not depend on the retired legacy tier");
assert.doesNotMatch(edge, /downtime_central_sessions"\)\.insert\(\{[^}]*tier:/,
  "session insertion must not contain a tier field");
assert.match(migration, /ALTER COLUMN tier DROP NOT NULL/i,
  "historical session tier column remains optional for canonical USER identities");
console.log("PASS: canonical USER sessions no longer depend on legacy tier.");
