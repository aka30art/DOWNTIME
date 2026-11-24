import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app=readFileSync(new URL('../repair-maintenance-app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../repair-maintenance.html',import.meta.url),'utf8');
const match=app.match(/function orderedFaults\(\)\{[\s\S]*?\n  \}/);
assert.ok(match,'the live fault sorter exists');
const sorter=new Function('$','faults','PRIORITIES',match[0]+'; return orderedFaults;');
const records=[
 {id:'low-new',priority:'LOW',created_at:'2026-11-24T10:00:00Z'},
 {id:'high-old',priority:'HIGH',created_at:'2026-11-20T10:00:00Z'},
 {id:'medium',priority:'MEDIUM',created_at:'2026-11-22T10:00:00Z'},
 {id:'high-new',priority:'HIGH',created_at:'2026-11-23T10:00:00Z'}
];
const sort=mode=>sorter(()=>({value:mode}),records,['HIGH','MEDIUM','LOW'])();
assert.deepEqual(sort('priority').map(x=>x.id),['high-new','high-old','medium','low-new']);
assert.deepEqual(sort('newest').map(x=>x.id),['low-new','high-new','medium','high-old']);
assert.deepEqual(sort('oldest').map(x=>x.id),['high-old','medium','high-new','low-new']);
assert.deepEqual(records.map(x=>x.id),['low-new','high-old','medium','high-new'],'sorting must not mutate stored records');
assert.match(html,/option value="priority">PRIORITY/);
assert.match(html,/option value="newest">NEWEST/);
assert.match(html,/option value="oldest">OLDEST/);
assert.doesNotMatch(html,/option value="number"|option value="recent"|>NUMBER</);
console.log('R&M sorting regression: PASS');
