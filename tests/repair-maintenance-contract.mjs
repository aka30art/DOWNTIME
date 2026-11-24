import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../repair-maintenance.html');
const sharedUi=read('../shared-ui-system.css');
assert.ok(html.includes('shared-ui-system.css?v=20261124-1'),'R&M loads the shared visual design system');
for(const token of ['--panel:#101f2b','--line:#334b5d','--yellow:#ffc400','--muted:#9aafbd'])assert.ok(sharedUi.includes(token),'shared design token missing: '+token);
for(const selector of ['.machinebar{','.stat{','.faultpanel{','.faultrow{','.dialog{'])assert.ok(sharedUi.includes(selector),'shared R&M styling is missing '+selector);
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
const rmIconMap={
  KIVERCO_PICKING_LINE:'kiverco.svg',
  TANNA_SHREDDER:'tanna.svg',
  FORKLIFT:'forklift.svg',
  TELEHANDLER:'telehandler.svg',
  EXCAVATORS_360:'excavators_360.svg',
  OTHER_EQUIPMENT:'other_equipment.svg'
};
for(const [machine,file] of Object.entries(rmIconMap)){
  const svg=read('../assets/rm-icons/'+file);
  assert.match(svg,/<svg[^>]+viewBox="0 0 1024 1024"/,file+' is a scalable SVG');
  assert.match(svg,/fill="#FFCF00"/,file+' uses the approved industrial yellow');
  assert.ok(html.includes('assets/rm-icons/'+file),file+' is referenced by the R&M interface');
}
assert.match(html,/<img id="machineIcon" src="assets\/rm-icons\/kiverco\.svg"/,'selected machine header starts with a valid icon asset');
assert.match(app,/machineIcon\.src=currentMachine\.icon/,'selected machine header follows the active machine');
assert.match(html,/\.machine-art img\{[^}]*object-fit:contain/,'selector icons preserve SVG proportions');
assert.match(html,/\.machineicon img\{[^}]*filter:brightness\(0\)/,'header icons remain visible on the yellow header panel');
assert.doesNotMatch(html,/class="machine-art"><svg/,'selector cards no longer use the generic inline machinery drawings');

for(const id of ['selectorView','dashboardView','faultRows','totalCount','highCount','mediumCount','lowCount','createOverlay','reportOverlay','reportMachineType','generatePdfReport','openReports','exportsOverlay','pdfExportsMachineType','pdfExportList','exportReportButton','pdfExportsButton','loadMoreExports','presetsOverlay','presetMachineTitle','presetItems','presetAddForm','newPresetName','addPresetSave','openPresets','newFaultOtherField','newFaultOther','detailsOverlay','detailStatus','detailPriority','photoInput','fileInput','notesList'])assert.ok(html.includes(`id="${id}"`),`missing HTML element ${id}`);
for(const action of ['access','list','export-create','export-list','export-url','export-delete','preset-list','preset-add','preset-delete','get','create','update','note-add','upload','delete'])assert.ok(api.includes(`action === "${action}"`),`missing API action ${action}`);
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
assert.ok(html.includes('repair-maintenance-app.js?v=20261124-3'),'R&M app script cache is refreshed');
assert.match(app,/status:'PERM\. FIX'/,'SOLVED marks fault as PERM. FIX');
assert.match(app,/api\('export-create'/,'PDF export creation is handled by the server');
assert.match(app,/api\('export-list'/,'PDF archive records are loaded from the server');
assert.match(api,/canExportRepairMaintenanceReports!==true/,'report API enforces the existing export permission');
assert.match(api,/createSignedUrl\(report\.storage_path,300\)/,'stored reports use short-lived private links');
assert.match(api,/buildRepairMaintenancePdf\(faults,filter,generatedAt\)/,'server generates retained PDF reports');
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
