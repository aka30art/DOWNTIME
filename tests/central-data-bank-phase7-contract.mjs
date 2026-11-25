import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../central-bank-admin.html", import.meta.url), "utf8");
const api = await readFile(new URL("../supabase/functions/central-config-admin/index.ts", import.meta.url), "utf8");
const runtime = await readFile(new URL("../index.html", import.meta.url), "utf8");

assert.match(html, /id="view-release"/);
assert.match(html, /id="runImpactBtn"/);
assert.match(html, /id="approveImpactBtn"/);
assert.match(html, /function runImpactAnalysis\(\)/);
assert.match(html, /callConfig\("central-config-impact"/);
assert.match(html, /impactReviewedToken/);
assert.match(html, /impactToken:impactReviewedToken/);
assert.match(html, /CONFIRM REVIEW & AUTHORISE PUBLISH/);
assert.match(api, /action === "central-config-impact"/);
assert.match(api, /draftVersion: Number\(configState\.draft_version\)/);
assert.match(api, /publishedVersion: Number\(configState\.published_version\)/);
assert.match(api, /classification = type === "removed" \? "destructive"/);
assert.match(api, /impactToken,/);
assert.match(api, /body\.impactToken !== expectedImpactToken/);
assert.match(api, /A current change impact report must be reviewed before publishing/);
assert.match(api, /impactReviewed: true/);
assert.doesNotMatch(runtime, /central-config-impact|impactReviewedToken|view-release/);
console.log("CDB Phase 07 change impact and release governance contracts passed.");
