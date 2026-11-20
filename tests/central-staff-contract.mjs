import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync("index.html","utf8");
assert.match(app,/function staffRoster\(\)[\s\S]*?state\.staffRoster/,"STAFF list reads from central shared state");
assert.match(app,/state\.staffRoster=\[\.\.\.staffRoster\(\),name\]/,"Adding staff updates shared state");
assert.match(app,/state\.staffRoster=staffRoster\(\)\.filter\(n=>n!==name\)/,"Removing staff updates shared state only");
assert.match(app,/function persist\(\)[\s\S]*?if\(centralSessionToken\(\)\)centralSyncWrite\(\);else syncCloud\(\);/,"STAFF edits persist through the central sync mechanism");
assert.match(app,/state\.operatorProfiles\[name\]=Object\.assign/,"STAFF presence/station/profile metadata uses central payload profiles");
assert.doesNotMatch(app,/localStorage\.setItem\(STAFF_ROSTER_KEY,JSON\.stringify\(\[\.\.\.staffRoster\(\),name\]\)/,"No new STAFF records written to local roster cache");
assert.doesNotMatch(app,/localStorage\.setItem\(STAFF_ROSTER_KEY,JSON\.stringify\(staffRoster\(\)\.filter/,"No STAFF removals written to local roster cache");
assert.ok(app.includes('id="addStaffBtn"')&&app.includes('id="staffRosterList"'),"STAFF has independent management controls");
assert.ok(app.includes('state.staffRoster=staffRoster().filter(n=>n!==name)'),"STAFF deletion does not delete USER accounts");
assert.ok(app.includes('state.operatorProfiles[name]=Object.assign'),"STAFF profile edits persist in shared payload");
assert.ok(app.includes("staffRoster();await centralSyncWrite()")||app.includes("staffRoster();const {error:migrationError}"),"central payload migrates legacy STAFF records");
console.log("Central STAFF independence and sync contract passed (static checks only).");
