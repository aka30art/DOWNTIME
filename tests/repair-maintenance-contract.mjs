import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../repair-maintenance.html');
const app=read('../repair-maintenance-app.js');
const api=read('../supabase/functions/repair-maintenance-api/index.ts');
const migration=read('../supabase/migrations/20261123195000_repair_maintenance_module.sql');
const presetsMigration=read('../supabase/migrations/20261124000000_rm_mechanic_machine_presets.sql');
const launcher=read('../repair-maintenance-launch.js');
const index=read('../index.html');
const central=read('../supabase/functions/central-bank/index.ts');

for(const machine of ['KIVERCO_PICKING_LINE','TANNA_SHREDDER','FORKLIFT','TELEHANDLER','EXCAVATORS_360','OTHER_EQUIPMENT']){
  assert.match(html,new RegExp(`data-machine="${machine}"`));
  assert.ok(api.includes(`"${machine}"`));
}
for(const id of ['selectorView','dashboardView','faultRows','totalCount','highCount','mediumCount','lowCount','createOverlay','presetsOverlay','presetMachineTitle','presetItems','presetAddForm','newPresetName','addPresetSave','openPresets','newFaultOtherField','newFaultOther','detailsOverlay','detailStatus','detailPriority','photoInput','fileInput','notesList'])assert.ok(html.includes(`id="${id}"`),`missing HTML element ${id}`);
for(const action of ['access','list','preset-list','preset-add','preset-delete','get','create','update','note-add','upload','delete'])assert.ok(api.includes(`action === "${action}"`),`missing API action ${action}`);
for(const behaviour of ['create','update','note-add','upload','delete','createSignedUrl','remove('])assert.ok(api.includes(behaviour),`missing backend behaviour ${behaviour}`);
for(const key of ['canAccessYardHub','canAccessRepairMaintenance','canEditRepairMaintenance','canDeleteRepairMaintenance','canExportRepairMaintenanceReports']){
  assert.ok(index.includes(key),`missing HUB UI permission ${key}`);
  assert.ok(central.includes(key),`missing Central Bank permission ${key}`);
  assert.ok(api.includes(key),`missing R&M API permission ${key}`);
}
assert.match(migration,/enable row level security/gi);
assert.match(migration,/public = false/);
assert.match(migration,/revoke all on table public\.repair_maintenance_faults from public, anon, authenticated/);
assert.match(migration,/4194304/,'private R&M evidence storage is capped at 4 MB');
assert.match(app,/window\.confirm\(/,'marking a fault solved needs confirmation');
assert.match(html,/option>PERM\. FIX</,'fault status includes PERM. FIX');
const detailStatusMarkup=html.match(/<select id="detailStatus"[^>]*>([\s\S]*?)<\/select>/)?.[1]||'';
assert.doesNotMatch(detailStatusMarkup,/IN PROGRESS|REPAIRED/,'detail STATUS options exclude IN PROGRESS and REPAIRED');
assert.match(html,/id="deleteFault"[^>]*>✓ SOLVED</,'SOLVED action replaces DELETE');
assert.ok(html.includes('AREA / PART OF MACHINERY'),'fault field label uses machinery terminology');
assert.ok(html.includes('<select id="newFaultName"'),'fault field uses a machine-specific preset dropdown');
assert.ok(html.includes('id="newFaultOtherField" hidden'),'OTHER fallback is a conditional manual-entry field');
assert.ok(html.includes('#newFaultOtherField[hidden],.machine-cog-button[hidden]{display:none!important}'),'hidden attribute is enforced for the optional field and PRESETS button');
assert.ok(html.includes('id="openPresets"'),'machinery header exposes PRESETS');
assert.match(html,/\.machinebar\{[^}]*grid-template-columns:128px minmax\(0,1fr\) max-content;[^}]*padding-right:12px/,'desktop machine header reserves the full back-button width and right-side clearance');
assert.doesNotMatch(html,/\.frame:(?:before|after)/,'all decorative corner-marker selectors are removed from the R&M interface');
assert.ok(app.includes("api('preset-list'"),'the client loads the selected machine preset list');
assert.ok(app.includes('presetId:preset.id'),'fault creation sends the selected preset ID');
assert.ok(app.includes('preset-delete'),'the UI allows individual preset removal');
assert.ok(presetsMigration.includes('repair_maintenance_machine_presets'),'presets are stored in a separate R&M table');
assert.ok(presetsMigration.includes('enable row level security'));
assert.ok(presetsMigration.includes('revoke all on table public.repair_maintenance_machine_presets from public, anon, authenticated'));
assert.ok(presetsMigration.includes('is_other boolean not null default false'));
assert.ok(presetsMigration.includes('OTHER — ENTER MANUALLY'));
assert.ok(api.includes('.eq("machine_type", body.machineType)'),'backend checks preset ownership by machine');
assert.ok(api.includes('.eq("is_other", false)'),'backend protects OTHER from deletion');
assert.doesNotMatch(html,/id="detailAddNote"/,'duplicate bottom ADD NOTE button removed');
assert.doesNotMatch(html,/id="attachFile"/,'duplicate bottom ATTACH FILE button removed');
assert.ok(html.includes('repair-maintenance-app.js?v=20261124-1'),'R&M app script cache is refreshed');
assert.match(app,/status:'PERM\. FIX'/,'SOLVED marks fault as PERM. FIX');
assert.match(app,/window\.open\(/,'report export opens a printable report window');
assert.match(app,/window\.print\(/,'report export invokes the browser print-to-PDF workflow');
assert.match(app,/Save as PDF/,'report export clearly supports saving as PDF');
assert.ok(app.includes('Area / Part of Machinery'),'PDF report uses the new machinery part/area label');
assert.match(app,/Type of Defect/,'PDF report includes the renamed defect type column');
assert.match(launcher,/yard-hub:shown/,'launcher must respond to the existing HUB becoming visible');
assert.match(index,/id="launchRepairMaintenanceBtn"/,'YARD HUB needs the R&M tile');
assert.match(index,/repair-maintenance-launch\.js/,'YARD HUB must load the R&M launcher');

// A removed control must not throw during DOMContentLoaded and prevent init() from running.
const domReady=app.match(/document\.addEventListener\('DOMContentLoaded',\(\)=>\{([\s\S]*?)\n  \}\);/)?.[1]||'';
assert.ok(domReady,'R&M app must initialise from DOMContentLoaded');
for(const match of domReady.matchAll(/\$\(['"]([^'"]+)['"]\)(\?\.|\.)/g)){
  const [,id,access]=match;
  if(!html.includes('id="'+id+'"'))assert.equal(access,'?.','removed DOM element "'+id+'" must have a guarded listener binding');
}

for(const path of ['../repair-maintenance-app.js','../repair-maintenance-launch.js']){
  execFileSync(process.execPath,['--check',new URL(path,import.meta.url).pathname],{stdio:'pipe'});
}
console.log('R&M module contract checks passed.');
