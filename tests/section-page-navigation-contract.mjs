import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile(new URL("../index.html", import.meta.url), "utf8");
const cdb = await readFile(new URL("../central-bank-admin.html", import.meta.url), "utf8");

assert.match(runtime, /id="section-page-navigation"/);
assert.match(runtime, /id="returnMainMenu"/);
assert.match(runtime, /BACK TO MAIN MENU/);
assert.match(runtime, /body\.section-page-open \.shell>\.side\{display:none!important\}/);
assert.match(runtime, /section-page-open/);
assert.match(runtime, /prefers-reduced-motion:reduce/);

assert.match(cdb, /id="cdb-section-page-navigation"/);
assert.match(cdb, /id="cdbBackToMenu"/);
assert.match(cdb, /BACK TO CENTRAL DATA BANK MENU/);
assert.match(cdb, /cdb-section-page/);
assert.match(cdb, /showSection\("departments"\)/);
assert.match(cdb, /prefers-reduced-motion: reduce/);

// The CDB page transition is presentation-only. Existing view IDs and
// section routing remain intact; no API, permission or data model changes.
assert.match(cdb, /id="view-departments"/);
assert.match(cdb, /id="view-release"/);
assert.match(cdb, /function showSection\(section\)/);

console.log("Dedicated section-page navigation contracts passed.");
