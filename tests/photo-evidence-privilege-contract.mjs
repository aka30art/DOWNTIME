import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile("supabase/migrations/20261125020000_photo_attachment_privilege_hardening.sql","utf8");
assert.match(sql,/revoke all on table public\.downtime_attachments from public, anon, authenticated/i);
assert.match(sql,/grant select, insert, update, delete on table public\.downtime_attachments to service_role/i);
console.log("Photo attachment metadata privilege contract passed.");
