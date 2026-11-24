import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../repair-maintenance.html');
const app=read('../repair-maintenance-app.js');
const packageJson=JSON.parse(read('../package.json'));
const categories=['KIVERCO_PICKING_LINE','TANNA_SHREDDER','FORKLIFT','TELEHANDLER','EXCAVATORS_360','OTHER_EQUIPMENT'];

for(const category of categories){
  assert.ok(html.includes('data-machine="'+category+'"'),'existing R&M category remains: '+category);
  assert.ok(app.includes("key:'"+category+"'"),'RMS reuses the canonical machinery category: '+category);
}
for(const id of ['openRmsSettings','rmsView','rmsMachineGrid','rmsStatus','backFromRmsSettings']){
  assert.ok(html.includes('id="'+id+'"'),'missing RMS navigation element: '+id);
}
assert.ok(html.includes('RMS · R&amp;M SETTINGS'));
assert.ok(html.includes('SELECT A MACHINERY TYPE TO MANAGE ITS AREA / PART PRESETS'));
assert.ok(app.includes('function settingsStatusTarget()'));
assert.ok(app.includes('function renderRmsMenu()'));
assert.ok(app.includes('MACHINES.forEach(item=>'));
assert.ok(app.includes("card.addEventListener('click',()=>{currentMachine=item"));
assert.ok(app.includes('openPresetManager()'));
assert.ok(app.includes("$('openRmsSettings').hidden=access.canManageRepairMaintenancePresets!==true"));
assert.ok(app.includes("api('preset-add'"));
assert.ok(app.includes("api('preset-delete'"));
assert.ok(packageJson.scripts['test:rm'].includes('rm-settings-menu-contract.mjs'));
console.log('R&M Settings (RMS) category menu and permission regression: PASS');
