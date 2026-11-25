import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../repair-maintenance.html');
const sharedUi=read('../shared-ui-system.css');
assert.ok(html.includes('shared-ui-system.css?v=20261124-2'),'R&M loads the shared visual design system');
for(const token of ['--panel:#101f2b','--line:#334b5d','--yellow:#ffc400','--muted:#9aafbd'])assert.ok(sharedUi.includes(token),'shared design token missing: '+token);
for(const selector of ['.machinebar{','.stat{','.faultpanel{','.faultrow{','.dialog{'])assert.ok(sharedUi.includes(selector),'shared R&M styling is missing '+selector);
const app=read('../repair-maintenance-app.js');
const api=read('../supabase/functions/repair-maintenance-api/index.ts');
const migration=read('../supabase/migrations/20261123195000_repair_maintenance_module.sql');
const assetsMigration=read('../supabase/migrations/20261124230000_rm_machinery_registry.sql');
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
assert.match(app,/if\(icon\)icon\.src=currentMachine\.icon/,'selected machine header safely follows the active machine when the icon element exists');
assert.match(html,/\.machine-art img\{[^}]*object-fit:contain/,'selector icons preserve SVG proportions');
assert.match(html,/\.machineicon img\{[^}]*filter:brightness\(0\)/,'header icons remain visible on the yellow header panel');
assert.doesNotMatch(html,/class="machine-art"><svg/,'selector cards no longer use the generic inline machinery drawings');

for(const id of ['selectorView','settingsView','dashboardView','openRmsSettingsShortcut','openSettingsWorkspace','backToMachineryFromSettings','settingsMachineGrid','settingsStatus','machineAssetControls','machineAssetSelect','settingsMachinerySection','machineModelItems','settingsAddMachineryButton','saveModelDropdownSettings','assetSelectorEnabled','saveAssetSelectorSettings','assetOverlay','assetForm','assetCode','assetMakeModel','assetSaveButton','registrationEnabled','saveRegistrationSettings','archiveAssetButton','reportAssetId','pdfExportsAssetId','faultRows','totalCount','highCount','mediumCount','lowCount','createOverlay','reportOverlay','reportMachineType','generatePdfReport','openReports','exportsOverlay','pdfExportsMachineType','pdfExportList','exportReportButton','pdfExportsButton','loadMoreExports','presetsOverlay','presetMachineTitle','presetItems','presetAddForm','newPresetName','addPresetSave','newFaultOtherField','newFaultOther','detailsOverlay','detailStatus','detailPriority','photoInput','fileInput','notesList'])assert.ok(html.includes(`id="${id}"`),`missing HTML element ${id}`);
for(const action of ['access','asset-list','asset-add','asset-update','asset-archive','list','export-create','export-list','export-url','export-delete','preset-list','preset-add','preset-delete','get','create','update','note-add','upload','delete'])assert.ok(api.includes(`action === "${action}"`),`missing API action ${action}`);
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
assert.ok(html.includes('#newFaultOtherField[hidden]'),'hidden attribute is enforced for the optional manual-entry field');
assert.ok(html.includes('id="presetItems"')&&html.includes('id="presetAddForm"'),'RMS settings contain the area / part preset manager');
assert.doesNotMatch(html,/id="openPresets"|id="addMachineryButton"|id="editMachineryButton"/,'machinery header no longer contains RMS management controls');
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
assert.ok(html.includes('repair-maintenance-app.js?v=20261125-2'),'R&M app script cache is refreshed');
assert.match(app,/function updateAssetSelectorVisibility\(\)[\s\S]*host\.hidden=access\?\.canReadRepairMaintenanceMachinery!==true\|\|machineSettings\.asset_selector_enabled!==true/,'R&M registered-machine selector follows its saved per-category setting');
assert.match(app,/machineSettings\.model_dropdown_enabled!==true/,'MAKE / MODEL catalogue visibility remains separately configured');
assert.match(app,/function saveAssetSelectorSetting\(\)/,'registered-machine visibility has an independent save action');
assert.match(api,/asset_selector_enabled/,'R&M API reads and writes the registered-machine visibility field');
assert.match(app,/api\('settings-get',\{machineType:currentMachine\.key\}\)/,'R&M dashboard loads its category setting before showing the selector');
assert.ok(html.includes('id="openRmsSettingsShortcut"'),'RMS settings gear shortcut is present in the header');
assert.ok(html.includes('id="saveModelDropdownSettings"'),'model dropdown configuration has an explicit save button');
assert.ok(html.includes('MACHINERY &amp; MODEL REGISTER'));
assert.ok(html.includes('id="machineModelItems"'),'the consolidated registered-machine list is present');
assert.ok(html.includes('id="settingsAddMachineryButton"'),'the register has one Add Machinery entry point');
assert.ok(html.includes('id="assetForm"')&&html.includes('id="assetOverlay"'),'Add / Edit Machinery uses the shared asset editor');
assert.doesNotMatch(html,/id="modelAddForm"/,'the retired duplicate quick-add form is absent');
assert.match(app,/function renderMachineModelManager\(\)[\s\S]*edit\.addEventListener\('click',\(\)=>openAssetEditor\(asset\)\)/,'registered-machine EDIT actions use the shared asset editor');
assert.match(app,/async function openAssetEditor\(asset=null\)[\s\S]*renderAssetModelField\(asset\?\.make_model\|\|asset\?\.name\|\|''\)[\s\S]*showOverlay\('assetOverlay'\)/,'the shared editor supports both adding and editing registered machines');
assert.match(app,/\$\('settingsAddMachineryButton'\)\?\.addEventListener\('click',\(\)=>openAssetEditor\(\)\)/,'the single Add Machinery control opens the shared editor');
assert.equal((app.match(/\$\('settingsAddMachineryButton'\)\?\.addEventListener\('click'/g)||[]).length,1,'the Add Machinery control has exactly one click handler');
assert.match(app,/async function saveAsset\(event\)[\s\S]*wasEdit\?await api\('asset-update'[\s\S]*:await api\('asset-add'/,'the shared editor saves through the registered-machine add / update API');
assert.match(api,/action === "asset-add"[\s\S]*canAddRepairMaintenanceMachinery !== true/,'adding a registered machine follows machinery INPUT permissions');
assert.match(api,/action === "asset-update"/,'editing a registered machine uses the registry update endpoint');
assert.match(api,/action === "model-list"[\s\S]*from\("repair_maintenance_assets"\)/,'MAKE / MODEL options are derived from the registered-machine asset registry');
assert.doesNotMatch(api,/from\("repair_maintenance_machine_models"\)/,'current catalogue API no longer reads or writes the retired model table');
assert.ok(html.includes('Its model is shown in the Machinery &amp; Model Register.'));
assert.ok(html.includes('id="settingsAddMachineryButton"')&&html.includes('id="machineModelItems"'),'the unified machinery/model register and add action are present');
assert.doesNotMatch(html,/id="addMachineryButton"|id="editMachineryButton"|id="openPresets"/,'dashboard no longer contains machinery management buttons');
assert.match(app,/function saveModelDropdownSetting\(\)/,'MAKE / MODEL dropdown setting is saved explicitly');
assert.match(app,/handleModelDropdownDraftChange/,'checkbox changes are kept as an unsaved draft');
assert.match(app,/openRmsSettingsShortcut.*currentMachine/,'header shortcut opens settings for the current machinery category');
assert.match(app,/function renderSettingsSelector\(\)/,'RMS menu has its own navigation view');
assert.match(app,/function openMachineSettings\(key\)/,'RMS category selection opens the selected category settings');
assert.match(app,/canManageRepairMaintenancePresets!==true/,'RMS settings are permission-gated');
const rmMenuCategories=[...html.matchAll(/data-machine="([^"]+)"/g)].map(match=>match[1]);
const rmsMenuCategories=[...html.matchAll(/data-settings-machine="([^"]+)"/g)].map(match=>match[1]);
assert.deepEqual(rmsMenuCategories,rmMenuCategories,'RMS menu mirrors all six R&M machinery categories in the same order');
assert.match(app,/async function deleteFault\(\)\{[\s\S]*?api\('delete',\{faultId:currentFault\.id\}\)/,'SOLVED permanently deletes the selected fault through the protected API');
const solvedHandler=app.match(/async function deleteFault\(\)\{([^\n]*)/)?.[1]||'';
assert.doesNotMatch(solvedHandler,/api\('update'/,'SOLVED must not merely change the status and retain the record');
assert.match(solvedHandler,/notes, photos and attached files will be deleted/,'confirmation warns that the record and evidence are permanently deleted');
assert.ok(app.includes("$('deleteFault').hidden=access.canDeleteRepairMaintenance!==true;"),'SOLVED is only available to accounts with the dedicated DELETE permission');
assert.match(app,/api\('export-create'/,'PDF export creation is handled by the server');
assert.match(app,/api\('export-list'/,'PDF archive records are loaded from the server');
assert.match(api,/canExportRepairMaintenanceReports!==true/,'report API enforces the existing export permission');
assert.match(api,/createSignedUrl\(report\.storage_path,300\)/,'stored reports use short-lived private links');
assert.match(api,/buildRepairMaintenancePdf\(faults, filter, generatedAt, selectedAsset\?\.name \|\| null\)/,'server generates retained PDF reports with machine context');
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
assert.ok(assetsMigration.includes('create table if not exists public.repair_maintenance_assets'),'individual machinery uses one registry table');
assert.ok(assetsMigration.includes('asset_id uuid'),'fault records gain a nullable asset reference');
assert.ok(assetsMigration.includes('foreign key (asset_id, machine_type)'),'asset references are constrained to their machinery category');
assert.ok(assetsMigration.includes('enable row level security'));
assert.ok(assetsMigration.includes('revoke all on table public.repair_maintenance_assets from public, anon, authenticated'));
assert.ok(assetsMigration.includes('grant all on table public.repair_maintenance_assets to service_role'));
assert.ok(assetsMigration.includes("f.machine_type = 'KIVERCO_PICKING_LINE'")&&assetsMigration.includes("f.machine_type = 'TANNA_SHREDDER'"),'only known singleton category faults are backfilled automatically');
assert.ok(assetsMigration.includes('repair_maintenance_pdf_exports_asset_created_idx'),'PDF archive can be filtered by individual machine');
assert.ok(app.includes("api('asset-list'")&&app.includes("api('asset-add'")&&app.includes("api('asset-update'")&&app.includes("api('asset-archive'"),'R&M UI uses the machinery registry API');
assert.ok(app.includes('assetId:currentAsset.id'),'new faults are stored against the selected machine');
assert.ok(app.includes("unassigned:true"),'legacy unassigned faults remain independently viewable');
assert.ok(app.includes("api('export-create',filters"),'PDF generation supports an individual machine filter');
assert.ok(api.includes('permissions.canManageRepairMaintenanceMachinery'),'registry mutations are server-authorized');
assert.ok(api.includes('permissions.canReadRepairMaintenanceMachinery'),'registry reads are server-authorized');

console.log('R&M module contract checks passed.');

assert.ok(api.includes('permissions.canCreateRepairMaintenance = mode === "INPUT" || mode === "EDIT"'),'R&M INPUT tier can create faults');
assert.ok(api.includes('permissions.canAddRepairMaintenanceMachinery = machineryMode === "INPUT" || machineryMode === "EDIT"'),'R&M Machinery INPUT tier can add machines');
assert.ok(api.includes('permissions.canCreateRepairMaintenance !== true'),'R&M fault creation is server-side permission-gated');
assert.ok(app.includes('access.canCreateRepairMaintenance===true'),'R&M interface exposes create action to INPUT tier');

assert.match(html,/<section id="selectorView" class="view operations-mode" hidden>[\s\S]*?OPERATIONS WORKSPACE[\s\S]*?WORKING AREA/,'operations has a persistent blue workspace identity');
assert.match(html,/<section id="settingsView" class="view configuration-mode" hidden>[\s\S]*?CONFIGURATION WORKSPACE[\s\S]*?SETUP AREA/,'configuration selector has a persistent amber workspace identity');
assert.match(html,/<section id="selectorView" class="view operations-mode" hidden>[\s\S]*?id="openSettingsWorkspace"[^>]*>CONFIGURATION →/,'Operations workspace offers a direct Configuration switch');
assert.match(html,/<div class="machine-nav-actions">[\s\S]*?id="backToMachinery"[^>]*>← MACHINERY[\s\S]*?id="openRmsSettingsShortcut"[^>]*>CONFIGURATION/,'selected-machine configuration action sits beside the Machinery return button');
const heroMarkup = html.match(/<header class="hero">[\s\S]*?<\/header>/)?.[0] || '';
assert.ok(heroMarkup,'R&M hero header exists');
assert.doesNotMatch(heroMarkup,/openRmsSettingsShortcut/,'ambiguous gear shortcut is no longer in hero navigation');
assert.match(app,/function renderSettingsSelector\(\)\{if\(!canOpenMachineryConfiguration\(\)\)/,'Configuration workspace entry requires a dedicated machinery INPUT/EDIT or R&M Settings permission');
assert.match(html,/class="dialog configuration-dialog"[\s\S]*?CONFIGURATION MODE[\s\S]*?NOT THE FAULT REGISTER/,'every machinery configuration modal has an explicit mode warning');
assert.match(html,/\.configuration-mode \.machine-card\{[^}]*#332b1d/,'configuration cards use a separate amber administrative visual language');
assert.ok(html.includes('shared-ui-system.css?v=20261124-2'),'R&M shared stylesheet cache is refreshed');
