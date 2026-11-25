import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile(new URL("../index.html", import.meta.url), "utf8");
const cdb = await readFile(new URL("../central-bank-admin.html", import.meta.url), "utf8");

assert.match(runtime, /id="phase-08-operator-friendly-navigation"/);
assert.match(runtime, /BACK TO YARD HUB/);
assert.match(runtime, /MAIN MENU · OPEN TO NAVIGATE/);
assert.match(runtime, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(runtime, /@media\(max-width:380px\)/);
assert.match(runtime, /prefers-reduced-motion:reduce/);

assert.match(cdb, /id="phase-08-accessible-navigation"/);
assert.match(cdb, /START HERE/);
assert.match(cdb, /COMPANY & PLANT/);
assert.match(cdb, /OPERATIONAL SETTINGS/);
assert.match(cdb, /HISTORY & APPROVALS/);
assert.match(cdb, /ADVANCED SETTINGS/);
assert.match(cdb, /Search settings or areas/);
assert.match(cdb, /min-height:56px/);
assert.match(cdb, /prefers-reduced-motion:reduce/);

// Phase 08 is navigation presentation only; Phase 07 release governance must
// remain a separately merged feature and must not be reintroduced here.
assert.match(cdb, /id="view-release"/);\nassert.match(cdb, /central-config-impact/);\nassert.match(cdb, /impactReviewedToken/);
console.log("Phase 08 accessible navigation contracts passed.");
