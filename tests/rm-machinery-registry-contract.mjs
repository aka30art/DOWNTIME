import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../repair-maintenance.html');
const app=read('../repair-maintenance-app.js');
const api=read('../supabase/functions/repair-maintenance-api/index.ts');
const settings=read('../yard-hub-settings.js');
const settingsApi=read('../supabase/functions/yard-hub-settings-api/index.ts');
const migration=read('../supabase/migrations/20261124230000_rm_machinery_registry.sql');
const assetForeignKeyIndexMigration=read('../supabase/migrations/20261124240000_rm_machinery_fault_asset_fk_index.sql');
const pdf=read('../supabase/functions/repair-maintenance-api/pdf.ts');
const archiveMigration=read('../supabase/migrations/20261124210000_rm_pdf_export_archive.sql');

for(const category of ['KIVERCO_PICKING_LINE','TANNA_SHREDDER','FORKLIFT','TELEHANDLER','EXCAVATORS_360','OTHER_EQUIPMENT']){
  assert.ok(html.includes('data-machine="'+category+'"'),'existing category card remains: '+category);
  assert.ok(api.includes('"'+category+'"'),'API category allow-list remains: '+category);
}
assert.match(migration,/create table if not exists public\.repair_maintenance_assets/);
assert.match(migration,/machine_type text not null check/);
assert.match(migration,/status text not null default 'ACTIVE'/);
assert.match(migration,/lower\(name\)/);
assert.match(migration,/upper\(asset_code\)/);
assert.match(migration,/add column if not exists asset_id uuid/);
assert.match(migration,/foreign key \(asset_id, machine_type\)/);
assert.match(migration,/references public\.repair_maintenance_assets \(id, machine_type\)/);
assert.match(migration,/on delete restrict/);
assert.match(migration,/enable row level security/);
assert.match(migration,/revoke all on table public\.repair_maintenance_assets from public, anon, authenticated/);
assert.match(migration,/grant all on table public\.repair_maintenance_assets to service_role/);
assert.match(migration,/repair_maintenance_pdf_exports_asset_created_idx/);
assert.match(assetForeignKeyIndexMigration,/repair_maintenance_faults_asset_machine_idx/);
assert.match(assetForeignKeyIndexMigration,/on public\.repair_maintenance_faults \(asset_id, machine_type\)/);
assert.match(migration,/KIVERCO — PICKING LINE/);
assert.match(migration,/TANNA — SHREDDER/);
assert.match(migration,/f\.machine_type = 'KIVERCO_PICKING_LINE'[\s\S]*f\.machine_type = 'TANNA_SHREDDER'/);
assert.doesNotMatch(migration,/update public\.repair_maintenance_faults[\s\S]*FORKLIFT'[\s\S]*set asset_id/,'fleet legacy records must not be guessed onto an individual machine');

for(const action of ['asset-list','asset-add','asset-update','asset-archive'])assert.ok(api.includes('action === "'+action+'"'),'missing asset API action '+action);
assert.match(api,/canReadRepairMaintenanceMachinery !== true/);
assert.match(api,/canManageRepairMaintenanceMachinery !== true/);
assert.match(api,/action === "export-url"[\s\S]*canReadRepairMaintenanceMachinery!==true/,'opening PDF exports requires Machinery READ');
assert.match(api,/action === "export-delete"[\s\S]*canReadRepairMaintenanceMachinery!==true/,'deleting PDF exports requires Machinery READ');
assert.match(api,/\.eq\("asset_id", assetId\)/);
assert.match(api,/\.is\("asset_id", null\)/);
assert.match(api,/asset_id: assetId/);
assert.match(api,/status !== "ACTIVE"/);
assert.match(api,/hubTier === "DEVACC"/);
assert.match(api,/tier === "DEVACC" \|\| hubTier === "DEVACC"/,'legacy and Hub DEVACC accounts retain root machinery access');

for(const id of ['machineAssetControls','machineAssetSelect','addMachineryButton','editMachineryButton','assetOverlay','assetForm','assetName','assetCode','assetMakeModel','assetSaveButton','archiveAssetButton','reportAssetId','pdfExportsAssetId'])assert.ok(html.includes('id="'+id+'"'),'missing asset UI element '+id);
assert.match(app,/api\('asset-list'/);
assert.match(app,/api\('asset-add'/);
assert.match(app,/api\('asset-update'/);
assert.match(app,/api\('asset-archive'/);
assert.match(app,/assetId:currentAsset\.id/);
assert.match(app,/unassigned:true/);
assert.match(app,/currentAsset\?\.status==='ACTIVE'/);
assert.match(app,/canManageRepairMaintenanceMachinery/);

assert.ok(settings.includes("key:'repairMaintenanceMachinery',label:'R&M MACHINERY'"));
assert.ok(settingsApi.includes('repairMaintenanceMachinery'));
assert.ok(settingsApi.includes('value[key] ?? value.repairMaintenance'));
assert.match(settingsApi,/tierPermissions: normalizeTierPermissions/);

assert.match(pdf,/asset_name/);
assert.match(pdf,/asset_code/);
assert.match(pdf,/UNASSIGNED \/ LEGACY RECORDS/);
assert.match(api,/buildRepairMaintenancePdf\(faults, filter, generatedAt, selectedAsset\?\.name \|\| null\)/);
assert.match(migration,/repair_maintenance_pdf_exports/);
assert.ok(archiveMigration.includes('repair_maintenance_pdf_exports'));

assert.ok(html.includes('repair-maintenance-app.js?v=20261124-6'));
assert.match(app,/currentAsset\?\(currentAsset\.asset_code\?/,'fault details display the selected individual machine');
assert.match(app,/Archived machines remain selectable/,'archived machine history remains discoverable');
console.log('R&M machinery registry and asset-scoped fault regression: PASS');
