import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../repair-maintenance.html');
const app=read('../repair-maintenance-app.js');
const api=read('../supabase/functions/repair-maintenance-api/index.ts');
const migration=read('../supabase/migrations/20261123195000_repair_maintenance_module.sql');
const launcher=read('../repair-maintenance-launch.js');
const index=read('../index.html');
const central=read('../supabase/functions/central-bank/index.ts');

for(const machine of ['KIVERCO_PICKING_LINE','TANNA_SHREDDER','FORKLIFT','TELEHANDLER','EXCAVATORS_360','OTHER_EQUIPMENT']){
  assert.match(html,new RegExp(`data-machine="${machine}"`));
  assert.ok(api.includes(`"${machine}"`));
}
for(const id of ['selectorView','dashboardView','faultRows','totalCount','highCount','mediumCount','lowCount','createOverlay','detailsOverlay','detailStatus','detailPriority','photoInput','fileInput','notesList'])assert.ok(html.includes(`id="${id}"`),`missing HTML element ${id}`);
for(const action of ['access','list','get','create','update','note-add','upload','delete'])assert.ok(api.includes(`action === "${action}"`),`missing API action ${action}`);
for(const behaviour of ['create','update','note-add','upload','delete','createSignedUrl','remove('])assert.ok(api.includes(behaviour),`missing backend behaviour ${behaviour}`);
for(const key of ['canAccessYardHub','canAccessRepairMaintenance','canEditRepairMaintenance','canDeleteRepairMaintenance','canExportRepairMaintenanceReports']){
  assert.ok(index.includes(key),`missing HUB UI permission ${key}`);
  assert.ok(central.includes(key),`missing Central Bank permission ${key}`);
  assert.ok(api.includes(key),`missing R&M API permission ${key}`);
}
assert.match(migration,/enable row level security/gi);
assert.match(migration,/public = false/);
assert.match(migration,/revoke all on table public\.repair_maintenance_faults from public, anon, authenticated/);
assert.match(migration,/5242880/);
assert.match(app,/window\.confirm\(/,'fault deletion needs confirmation');
assert.match(app,/createObjectURL/,'report export needs a downloadable output');
assert.match(launcher,/yard-hub:shown/,'launcher must respond to the existing HUB becoming visible');
assert.match(index,/id="launchRepairMaintenanceBtn"/,'YARD HUB needs the R&M tile');
assert.match(index,/repair-maintenance-launch\.js/,'YARD HUB must load the R&M launcher');

for(const path of ['../repair-maintenance-app.js','../repair-maintenance-launch.js']){
  execFileSync(process.execPath,['--check',new URL(path,import.meta.url).pathname],{stdio:'pipe'});
}
console.log('R&M module contract checks passed.');
