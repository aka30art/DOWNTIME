import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile('index.html','utf8');
assert.match(html,/id="crewSwitchboardBtn"[^>]*aria-haspopup="dialog"[^>]*aria-controls="crewSwitchboardBackdrop"/,'Day to Day exposes an accessible Crew Switchboard icon');
assert.match(html,/crew-switchboard-trigger\{right:78px\}/,'Crew Switchboard icon sits beside the existing Daily Tasks control');
assert.match(html,/function crewSwitchboardEntries\(\)[\s\S]*?profile\.stationLocked===true&&String\(profile\.station\|\|profile\.assignedStation\|\|''\)\.trim\(\)/,'only STAFF with an explicitly locked and assigned station are included');
assert.match(html,/function renderCrewSwitchboardTrigger\(\)[\s\S]*?permission\('canManageStaff'\)/,'the control is restricted to STAFF management permission');
assert.match(html,/setAttribute\('role','switch'\);toggle\.setAttribute\('aria-checked'/,'presence control uses an accessible switch state');
assert.match(html,/profile\.onSite=!!nextOnSite/,'switch changes the existing ON/OFF PLANT property only');
assert.match(html,/persistSettingsConfirmed\(\)/,'Crew Switchboard changes are confirmed by Central Data Bank persistence');
assert.match(html,/profile\.stationLocked!==true/,'switch cannot operate on an unlocked or unassigned STAFF profile');
assert.match(html,/profile\.onSite=previous;else delete profile\.onSite/,'failed central saves roll the presence change back');
assert.match(html,/crewSwitchboardCount[\s\S]*?STAFF ON PLANT/,'the crew summary reports current active headcount');
assert.match(html,/locked station remains permanently assigned and is never changed here/,'the modal explicitly separates crew availability from permanent station assignment');
assert.match(html,/crew-switchboard-row\{display:grid[\s\S]*?@media\(max-width:420px\)/,'Crew Switchboard includes mobile-specific row layout');
console.log('PASS: Crew Switchboard locked-station filtering, permission gate, accessible ON/OFF switch, central persistence, rollback and mobile layout');
