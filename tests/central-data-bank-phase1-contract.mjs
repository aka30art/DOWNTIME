import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('central-bank-admin.html','utf8');
const app=fs.readFileSync('index.html','utf8');

const departments=[
 ['departments','view-departments'],
 ['dept-downtime','view-dept-downtime'],
 ['dept-floor','view-dept-floor'],
 ['dept-checksheets','view-dept-checksheets'],
 ['dept-rm','view-dept-rm'],
 ['dept-yardhub','view-dept-yardhub']
];
for(const [key,view] of departments){
 assert.ok(page.includes('data-section="'+key+'"'),'department navigation '+key);
 assert.ok(page.includes('id="'+view+'"'),'department workspace '+view);
}
for(const label of ['DOWNTIME','FLOOR','CHECK SHEETS','REPAIRS &amp; MAINTENANCE','YARD HUB']){
 assert.ok(page.includes(label),'department tile '+label);
}
assert.match(page,/DOWNTIME OPERATIONAL INTEGRITY/i);
assert.match(page,/does not edit tracker data, permissions, shifts, reports or runtime navigation/i);
assert.match(page,/FLOOR is not currently released/i);
assert.match(page,/CHECK SHEETS is not currently released/i);
assert.match(page,/NO OPERATIONAL CHANGES IN PHASE 01/i);
assert.match(page,/cdb-dept-grid/);
assert.match(page,/cdb-dept-card/);
assert.match(page,/YARDHUB · COMPANY ADMINISTRATION/);
assert.match(page,/data-section="overview"/,'existing configuration overview remains reachable');
assert.match(page,/data-section="organisation"/,'existing master registry remains reachable');
assert.match(page,/data-section="history"/,'existing version history remains reachable');

// Phase 01 is a control-room UI foundation only. The existing authenticated
// launcher and operational application source remain separate from this page.
assert.match(app,/id="yardHub"/);
assert.match(app,/id="launchDowntimeBtn"/);
console.log('PASS: Central Data Bank Phase 01 department launcher, workspace routes, reserved-module boundaries and DOWNTIME protection contract.');
