import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const app=read('../repair-maintenance-app.js');
const html=read('../repair-maintenance.html');
const api=read('../supabase/functions/repair-maintenance-api/index.ts');
const migration=read('../supabase/migrations/20261125000000_rm_model_catalogue_machine_register.sql');
const categories=['KIVERCO_PICKING_LINE','TANNA_SHREDDER','FORKLIFT','TELEHANDLER','EXCAVATORS_360','OTHER_EQUIPMENT'];
for(const category of categories){
  assert.ok(api.includes('"'+category+'"'), 'API supports '+category);
  assert.ok(html.includes('data-machine="'+category+'"'), 'UI retains '+category);
}
assert.match(migration,/repair_maintenance_machine_models/);
assert.match(migration,/repair_maintenance_assets/);
assert.match(migration,/lower\(trim\(name\)\)/);
assert.match(migration,/coalesce\(nullif\(trim\(make_model\)/);
assert.match(migration,/fault history is deleted/i) === false;
assert.match(api,/action === "model-list"[\s\S]*from\("repair_maintenance_assets"\)/);
assert.match(api,/action === "model-add"[\s\S]*from\("repair_maintenance_assets"\)/);
assert.match(api,/action === "model-delete"[\s\S]*status: "ARCHIVED"/);
assert.match(app,/function renderMachineModelManager\(\)[\s\S]*settingsAssets\.filter\(asset=>asset\.status==='ACTIVE'\)/);
assert.match(app,/api\('model-add',[\s\S]*syncDashboardAssetsAfterSettings/);
assert.match(app,/api\('list',[\s\S]*assetId:currentAsset\.id/);
assert.match(app,/function selectMachineAsset\(/);
assert.match(app,/function renderAssetSelect\([\s\S]*assets\.forEach/);
assert.match(html,/NEW REGISTERED MACHINE \/ MODEL/);
assert.match(html,/repair-maintenance-app\.js\?v=20261124-15/);
assert.match(app,/function updateAssetSelectorVisibility\([\s\S]*asset_selector_enabled/);
console.log('PR133 model catalogue / registered-machine contracts passed');
