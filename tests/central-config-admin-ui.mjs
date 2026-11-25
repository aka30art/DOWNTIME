import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const file=fileURLToPath(new URL('../central-bank-admin.html',import.meta.url));
function defaultDepartmentMenu(){return {categories:[{id:'operations',label:'Operations',order:0},{id:'administration',label:'Administration',order:1}],entries:[{id:'downtime',route:'dept-downtime',mark:'D',title:'DOWNTIME',description:'PLANT DOWNTIME & OPERATIONS',categoryId:'operations',enabled:true,order:0,status:'PROTECTED LIVE APPLICATION',statusTone:'live',submenu:[]},{id:'floor',route:'dept-floor',mark:'F',title:'FLOOR',description:'FLOOR & YARD OPERATIONS',categoryId:'operations',enabled:true,order:1,status:'RESERVED MODULE',statusTone:'planned',submenu:[]},{id:'check-sheets',route:'dept-checksheets',mark:'CS',title:'CHECK SHEETS',description:'INSPECTIONS & COMPLIANCE',categoryId:'operations',enabled:true,order:2,status:'RESERVED MODULE',statusTone:'planned',submenu:[]},{id:'repairs-maintenance',route:'dept-rm',mark:'R&M',title:'R&M',description:'REPAIRS & MAINTENANCE',categoryId:'operations',enabled:true,order:3,status:'EXISTING APPLICATION',statusTone:'live',submenu:[]},{id:'hub-settings',route:'dept-yardhub',mark:'YH',title:'HUB SETTINGS',description:'YARD HUB & APPLICATION ACCESS',categoryId:'administration',enabled:true,order:0,status:'ADMINISTRATION',statusTone:'admin',submenu:[]}]};}
let draft={
 schemaVersion:1,
 departmentMenu:defaultDepartmentMenu(),
 modules:['Central Data Bank','YARD HUB','Repair & Maintenance'],
 navigation:{overview:'Overview',organisation:'Organisation',structure:'Plant & Areas',libraries:'Operational Libraries',defaults:'System Defaults',history:'Version History',navigation:'Menu & Labels',modules:'Module Registry',controls:'System Controls',information:'System Information'},
 organization:{companyName:'',siteCode:'',timezone:'Europe/London',locale:'en-GB'},
 structure:{sites:[],plants:[],areas:[],stations:[]},
 libraries:{areaPresets:['Line 1'],downtimeReasons:['Mechanical failure'],dailyTaskPresets:['Check guards'],equipmentCategories:[],eventCategories:[],statusCategories:['Running','Stopped']},
 defaults:{shiftSchedule:{MONDAY:{start:'06:30',stop:'17:00'}},shiftPresets:[],weekStartsOn:'MONDAY',operatingDays:['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'],breakDeductionMinutes:75}
};
const initialDraft=structuredClone(draft);
let draftVersion=1,publishedVersion=1,nextVersion=2,activeTestUser='DEV';
let versions=[{version:1,parent_version:null,action:'initial',actor:'SYSTEM',note:'Initial baseline',created_at:new Date().toISOString(),published_at:new Date().toISOString(),status:'PUBLISHED'}];
const calls=[];
const promptValues=[];
function state(user={username:'DEV',displayName:'DEV',tier:'OWNER'}){
 return {draft,published:draftVersion===publishedVersion?draft:publishedVersion===1?draft:{...draft,organization:{...draft.organization,companyName:'published'}},draftVersion,publishedVersion,nextVersion,updatedBy:'DEV',updatedAt:new Date().toISOString(),publishedBy:'DEV',publishedAt:new Date().toISOString(),versions,user};
}
const server=http.createServer((req,res)=>{
 if(req.url==='/central-bank-admin.html'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fs.readFileSync(file));return;
 }
 res.writeHead(404);res.end('Not found');
});
const browser=await chromium.launch({headless:true});
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();
 const page=await browser.newPage({viewport:{width:1440,height:1050}});
 await page.route('**/functions/v1/central-bank',async route=>{
  const request=route.request();
  if(request.method()==='OPTIONS'){
   await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type, apikey, x-downtime-session'}});return;
  }
  const body=request.postDataJSON();calls.push(body.action);
  if(body.action==='login'){
   activeTestUser=String(body.username||'DEV').toUpperCase();
   const tier=activeTestUser==='DEV'?'OWNER':activeTestUser==='DEVACC'?'DEVACC':activeTestUser==='MANAGER'?'MANAGER':'ADMIN';
   await route.fulfill({json:{token:'test-session-token',expiresAt:new Date(Date.now()+3600000).toISOString(),user:{username:body.username,displayName:body.username,tier}}});return;
  }
  if(body.action==='logout'){await route.fulfill({json:{ok:true}});return;}
  if(body.action==='central-config-state'){
   const user=activeTestUser==='DEV'?{username:'DEV',displayName:'DEV',tier:'OWNER'}:{username:activeTestUser,displayName:activeTestUser,tier:activeTestUser==='DEVACC'?'DEVACC':'ADMIN'};
   if(!((user.username==='DEV'&&user.tier==='OWNER')||user.tier==='DEVACC')){await route.fulfill({status:403,json:{error:'Central Data Bank access is restricted to DEV and DEVACC only.'}});return;}
   await route.fulfill({json:state(user)});return;
  }
  if(body.action==='central-config-save-draft'){
   if(body.draftVersion!==draftVersion||body.nextVersion!==nextVersion){await route.fulfill({status:409,json:{error:'Draft changed in another session.'}});return;}
   draft=body.config;draftVersion=nextVersion;nextVersion++;
   versions.unshift({version:draftVersion,parent_version:draftVersion-1,action:'draft-save',actor:'DEV',note:body.note,created_at:new Date().toISOString(),published_at:null,status:'CURRENT DRAFT'});
   await route.fulfill({json:{ok:true,draftVersion,nextVersion}});return;
  }
  if(body.action==='central-config-impact'){
   await route.fulfill({json:{draftVersion,publishedVersion,summary:{added:1,modified:0,removed:0,highImpact:0,total:1},classifications:{structural:0,destructive:0,configuration:1},changes:[{type:'added',path:'organization.companyName',classification:'configuration',before:null,after:'Test'}],truncated:false,impactToken:'test-impact-token'}});return;
  }
  if(body.action==='central-config-publish'){
   if(body.draftVersion!==draftVersion||body.publishedVersion!==publishedVersion||draftVersion===publishedVersion||body.impactToken!=='test-impact-token'){await route.fulfill({status:409,json:{error:'Publish conflict or impact review missing.'}});return;}
   publishedVersion=draftVersion;
   versions=versions.map(v=>v.version===publishedVersion?{...v,published_at:new Date().toISOString(),status:'PUBLISHED'}:v);
   await route.fulfill({json:{ok:true,publishedVersion,publishedAt:new Date().toISOString()}});return;
  }
  if(body.action==='central-config-restore-draft'){
   if(body.draftVersion!==draftVersion||body.nextVersion!==nextVersion){await route.fulfill({status:409,json:{error:'Restore conflict.'}});return;}
   draft=JSON.parse(JSON.stringify(versions.find(v=>v.version===body.sourceVersion)?.version===1?{...draft,organization:{companyName:'',siteCode:'',timezone:'Europe/London',locale:'en-GB'}}:draft));
   draftVersion=nextVersion;nextVersion++;
   versions.unshift({version:draftVersion,parent_version:body.sourceVersion,action:'restore-draft',actor:'ADMIN',note:'Restored historical snapshot',created_at:new Date().toISOString(),published_at:null,status:'CURRENT DRAFT'});
   await route.fulfill({json:{ok:true,draftVersion,nextVersion,sourceVersion:body.sourceVersion}});return;
  }
  await route.fulfill({status:400,json:{error:'Unexpected action '+body.action}});
 });
 await page.route('**/functions/v1/central-config-admin',async route=>{
  const request=route.request();
  if(request.method()==='OPTIONS'){
   await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type, apikey, x-downtime-session'}});return;
  }
  const body=request.postDataJSON();calls.push(body.action);
  const user=activeTestUser==='DEV'?{username:'DEV',displayName:'DEV',tier:'OWNER'}:{username:activeTestUser,displayName:activeTestUser,tier:activeTestUser==='DEVACC'?'DEVACC':'ADMIN'};
  if(body.action==='central-config-state'){
   if(!((user.username==='DEV'&&user.tier==='OWNER')||user.tier==='DEVACC')){await route.fulfill({status:403,json:{error:'Central Data Bank access is restricted to DEV and DEVACC only.'}});return;}
   await route.fulfill({json:state(user)});return;
  }
  if(body.action==='central-config-save-draft'){
   if(body.draftVersion!==draftVersion||body.nextVersion!==nextVersion){await route.fulfill({status:409,json:{error:'Draft changed in another session.'}});return;}
   draft=structuredClone(body.config);draftVersion=nextVersion;nextVersion++;
   versions.unshift({version:draftVersion,parent_version:draftVersion-1,action:'draft-save',actor:activeTestUser,note:body.note,created_at:new Date().toISOString(),published_at:null,status:'CURRENT DRAFT'});
   await route.fulfill({json:{ok:true,draftVersion,nextVersion}});return;
  }
  if(body.action==='central-config-impact'){
   await route.fulfill({json:{draftVersion,publishedVersion,summary:{added:1,modified:0,removed:0,highImpact:0,total:1},classifications:{structural:0,destructive:0,configuration:1},changes:[{type:'added',path:'organization.companyName',classification:'configuration',before:null,after:'Test'}],truncated:false,impactToken:'test-impact-token'}});return;
  }
  if(body.action==='central-config-publish'){
   if(body.draftVersion!==draftVersion||body.publishedVersion!==publishedVersion||draftVersion===publishedVersion||body.impactToken!=='test-impact-token'){await route.fulfill({status:409,json:{error:'Publish conflict or impact review missing.'}});return;}
   publishedVersion=draftVersion;versions=versions.map(v=>v.version===publishedVersion?{...v,published_at:new Date().toISOString(),status:'PUBLISHED'}:v);
   await route.fulfill({json:{ok:true,publishedVersion,publishedAt:new Date().toISOString()}});return;
  }
  if(body.action==='central-config-restore-draft'){
   if(body.draftVersion!==draftVersion||body.nextVersion!==nextVersion){await route.fulfill({status:409,json:{error:'Restore conflict.'}});return;}
   draft=body.sourceVersion===1?structuredClone(initialDraft):structuredClone(draft);
   draftVersion=nextVersion;nextVersion++;
   versions.unshift({version:draftVersion,parent_version:body.sourceVersion,action:'restore-draft',actor:activeTestUser,note:'Restored historical snapshot',created_at:new Date().toISOString(),published_at:null,status:'CURRENT DRAFT'});
   await route.fulfill({json:{ok:true,draftVersion,nextVersion,sourceVersion:body.sourceVersion}});return;
  }
  await route.fulfill({status:400,json:{error:'Unexpected config action '+body.action}});
 });
 page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?(promptValues.shift()||''):''));
 await page.goto('http://127.0.0.1:'+address.port+'/central-bank-admin.html');
 assert.equal(await page.locator('#workspace').isVisible(),false,'workspace starts inaccessible before authentication');
 await page.locator('#username').fill('DEV');
 await page.locator('#pin').fill('1234');
 await page.locator('#loginBtn').click();
 await page.locator('#view-departments').waitFor({state:'visible'});
 assert.equal(await page.locator('.cdb-dept-card').count(),5,'department launcher presents all five YARD HUB application areas');
 await page.locator('[data-section="dept-downtime"]').click();
 assert.ok(await page.getByText('DOWNTIME OPERATIONAL INTEGRITY').count(),'DOWNTIME control page states the operational protection boundary');
 await page.locator('#view-dept-downtime [data-section="departments"]').click();
 await page.locator('[data-section="dept-floor"]').click();
 assert.ok(await page.getByText('RESERVED MODULE').count(),'FLOOR remains a reserved module');
 await page.locator('#view-dept-floor [data-section="departments"]').click();
 await page.locator('[data-section="dept-checksheets"]').click();
 assert.ok(await page.getByText('CHECK SHEETS is not currently released').count(),'CHECK SHEETS remains unreleased');
 await page.locator('#view-dept-checksheets [data-section="departments"]').click();
 assert.equal(await page.locator('#publishedKpi').textContent(),'v1');
 assert.equal(await page.locator('#draftKpi').textContent(),'v1');
 assert.ok(await page.locator('text=Access & Rights stays separate').count(),'separate responsibilities are explained');

 // Phase 03: create and persist a fully parented site → plant → area → station hierarchy.
 await page.locator('[data-section="structure"]').click();
 promptValues.push('North Yard');await page.locator('#addSiteBtn').click();
 const site=page.locator('#hierarchyTree [data-node-level="site"]').filter({hasText:'North Yard'});
 assert.equal(await site.count(),1,'new site is created in the hierarchy');
 promptValues.push('Sorting Plant');await site.locator('[data-hierarchy-action="add-plant"]').click();
 const plant=page.locator('#hierarchyTree [data-node-level="plant"]').filter({hasText:'Sorting Plant'});
 assert.equal(await plant.count(),1,'plant is created under its selected site');
 promptValues.push('Picking Line');await plant.locator('[data-hierarchy-action="add-area"]').click();
 const area=page.locator('#hierarchyTree [data-node-level="area"]').filter({hasText:'Picking Line'});
 assert.equal(await area.count(),1,'area is created under its selected plant');
 promptValues.push('Line 1');await area.locator('[data-hierarchy-action="add-station"]').click();
 assert.equal(await page.locator('#hierarchyTree [data-node-level="station"]').filter({hasText:'Line 1'}).count(),1,'station is created under its selected area');
 assert.equal(await page.locator('#saveDraftBtn').isEnabled(),true,'hierarchy edits mark the configuration draft dirty');

 // Phase 02: department label, category, visibility, ordering and submenu controls.
 await page.locator('[data-section="department-menu-settings"]').click();
 await page.locator('[data-menu-entry-id="downtime"] [data-menu-entry-title]').fill('PLANT CONTROL');
 await page.locator('[data-menu-entry-id="downtime"] [data-menu-entry-description]').fill('PLANT OPERATIONS & SHIFT CONTROL');
 await page.locator('[data-menu-entry-id="floor"] [data-menu-entry-enabled]').uncheck();
 await page.locator('[data-menu-entry-id="repairs-maintenance"] [data-menu-entry-move-up]').click();
 await page.locator('#newDepartmentCategory').fill('Support');
 await page.locator('#addDepartmentCategoryBtn').click();
 await page.locator('[data-menu-entry-id="hub-settings"] [data-menu-entry-category]').selectOption('support');
 await page.locator('[data-menu-entry-id="downtime"] button').filter({hasText:'ADD SUBMENU ITEM'}).click();
 await page.locator('[data-menu-entry-id="downtime"] [data-menu-submenu-label]').fill('Control Overview');
 await page.locator('[data-menu-entry-id="downtime"] [data-menu-submenu-target]').selectOption('overview');
 assert.equal(await page.locator('#departmentLauncher [data-section="dept-floor"]').count(),0,'disabled departments are hidden from the launcher');
 assert.equal((await page.locator('#departmentLauncher [data-section="dept-downtime"] strong').textContent()).trim(),'PLANT CONTROL','department titles update in the launcher');
 assert.equal(await page.locator('#departmentLauncher [data-section="overview"]').count(),1,'enabled submenu links are rendered in the launcher');
 const launcherOrder=await page.locator('#departmentLauncher .cdb-dept-card').evaluateAll(cards=>cards.map(card=>card.dataset.section));
 assert.ok(launcherOrder.indexOf('dept-rm')<launcherOrder.indexOf('dept-checksheets'),'department move controls reorder launcher cards');
 assert.ok(await page.locator('#departmentLauncher .cdb-dept-group-title').filter({hasText:'Support'}).count(),'new categories are reflected in launcher grouping');

 await page.locator('[data-section="navigation"]').click();
 await page.locator('#navLabelStructure').fill('Facility Map');
 await page.locator('[data-section="modules"]').click();
 await page.locator('#moduleRegistry').fill('Central Data Bank\nYARD HUB\nRepair & Maintenance\nDEV Diagnostics');
 await page.locator('[data-section="navigation"]').click();
 await page.locator('#navLabelModules').fill('Component Catalogue');
 await page.locator('#navLabelControls').fill('Safety Controls');
 await page.locator('#navLabelInformation').fill('Diagnostics');
 await page.locator('[data-section="organisation"]').click();
 await page.locator('#companyName').fill('QA Example Company');
 await page.locator('#saveDraftBtn').click();
 await page.getByText('Draft saved as version v2.',{exact:false}).waitFor();
 assert.equal(await page.locator('#draftKpi').textContent(),'v2','saved draft increments only the draft version');
 assert.equal(await page.locator('#publishedKpi').textContent(),'v1','saving a draft does not publish it');
 await page.reload();
 await page.locator('#username').fill('DEV');
 await page.locator('#pin').fill('1234');
 await page.locator('#loginBtn').click();
 await page.locator('#view-departments').waitFor({state:'visible'});
 assert.equal((await page.locator('[data-section="structure"] .navtext').textContent()).trim(),'Facility Map','saved DEV menu title persists after a fresh page load and authenticated state fetch');
 assert.equal(await page.locator('#moduleRegistry').inputValue(),'Central Data Bank\nYARD HUB\nRepair & Maintenance\nDEV Diagnostics','module registry persists after reload');
 assert.equal(await page.locator('#hierarchyTree [data-node-level="site"] strong').filter({hasText:'North Yard'}).count(),1,'site hierarchy persists after reload');
 assert.equal(await page.locator('#hierarchyTree [data-node-level="plant"] strong').filter({hasText:'Sorting Plant'}).count(),1,'plant parent relationship persists after reload');
 assert.equal(await page.locator('#hierarchyTree [data-node-level="area"] strong').filter({hasText:'Picking Line'}).count(),1,'area parent relationship persists after reload');
 assert.equal(await page.locator('#hierarchyTree [data-node-level="station"] strong').filter({hasText:'Line 1'}).count(),1,'station parent relationship persists after reload');
 assert.equal((await page.locator('[data-section="modules"] .navtext').textContent()).trim(),'Component Catalogue','module menu label persists after reload');
 assert.equal((await page.locator('[data-section="controls"] .navtext').textContent()).trim(),'Safety Controls','system controls menu label persists after reload');
 assert.equal((await page.locator('[data-section="information"] .navtext').textContent()).trim(),'Diagnostics','system information menu label persists after reload');
 assert.equal((await page.locator('#departmentLauncher [data-section="dept-downtime"] strong').textContent()).trim(),'PLANT CONTROL','department title persists in the versioned configuration');
 assert.equal(await page.locator('#departmentLauncher [data-section="dept-floor"]').count(),0,'department visibility persists after reload');
 assert.equal(await page.locator('#departmentLauncher [data-section="overview"]').count(),1,'department submenu persists after reload');
 assert.ok(await page.locator('#departmentLauncher .cdb-dept-group-title').filter({hasText:'Support'}).count(),'new category persists after reload');
 await page.locator('[data-section="department-menu-settings"]').click();
 await page.locator('#restoreDepartmentMenuBtn').click();
 assert.equal((await page.locator('#departmentLauncher [data-section="dept-downtime"] strong').textContent()).trim(),'DOWNTIME','restore returns the original department title');
 assert.equal(await page.locator('#departmentLauncher [data-section="dept-floor"]').count(),1,'restore re-enables original department visibility');
 assert.equal(await page.locator('#departmentLauncher [data-section="overview"]').count(),0,'restore clears configured submenu links');
 await page.reload();
 await page.locator('#username').fill('DEV');await page.locator('#pin').fill('1234');await page.locator('#loginBtn').click();
 await page.locator('#view-departments').waitFor({state:'visible'});
 assert.equal((await page.locator('#departmentLauncher [data-section="dept-downtime"] strong').textContent()).trim(),'PLANT CONTROL','unsaved reset is discarded while the saved menu remains durable');
 await page.locator('[data-section="controls"]').click();
 assert.ok(await page.getByText('Server-side access is restricted').count(),'system controls document the server-side access boundary');
 await page.locator('[data-section="information"]').click();
 assert.ok(await page.getByText('Not connected by design').count(),'system information confirms no live runtime integration');
 await page.locator('[data-section="release"]').click();
 await page.locator('#runImpactBtn').click();
 await page.getByText('Impact analysis complete. Inspect the change register before confirming review.').waitFor();
 await page.locator('#approveImpactBtn').click();
 assert.equal(await page.locator('#publishBtn').isEnabled(),true,'saved draft can be published only after impact review');

 await page.locator('#publishBtn').click();
 await page.getByText('Reviewed configuration v2 published to the isolated registry.',{exact:false}).waitFor();
 assert.equal(await page.locator('#publishedKpi').textContent(),'v2','publish updates the published registry version');

 await page.locator('[data-section="history"]').click();
 await page.locator('[data-restore-version="1"]').click();
 await page.getByText('restored as new draft',{exact:false}).waitFor();
 assert.equal(await page.locator('#draftKpi').textContent(),'v3','restore creates a new draft version');
 assert.equal(await page.locator('#publishedKpi').textContent(),'v2','restore does not change the published version');

 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('button.nav[data-section="departments"]').isVisible(),true,'mobile department navigation remains available');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
 assert.equal(overflow,false,'mobile control room has no horizontal page overflow');

 await page.locator('#logoutBtn').click();
 await page.locator('#workspace').waitFor({state:'hidden'});
 assert.equal(await page.locator('#workspace').isVisible(),false,'logout closes the admin workspace');
 await page.locator('#username').fill('ADMIN');
 await page.locator('#pin').fill('1234');
 await page.locator('#loginBtn').click();
 await page.getByText('Central Data Bank access is restricted',{exact:false}).waitFor();
 assert.equal(await page.locator('#workspace').isVisible(),false,'ADMIN is rejected when server returns HTTP 403');
 await page.locator('#username').fill('DEVACC');
 await page.locator('#pin').fill('1234');
 await page.locator('#loginBtn').click();
 await page.locator('#workspace').waitFor({state:'visible'});
 assert.equal(await page.locator('#workspace').isVisible(),true,'DEVACC is admitted to the Central Data Bank');
 assert.ok((await page.locator('#identity').textContent()).includes('DEVACC'),'DEVACC identity is shown in the control room');
 await page.locator('[data-section="organisation"]').click();
 await page.locator('#companyName').fill('DEVACC authority validation');
 await page.locator('#saveDraftBtn').click();
 await page.getByText('Draft saved as version v4.',{exact:false}).waitFor();
 assert.equal(await page.locator('#draftKpi').textContent(),'v4','DEVACC can save configuration drafts');
 assert.equal(await page.locator('#publishedKpi').textContent(),'v2','DEVACC draft save does not publish the registry');
 assert.ok(calls.includes('central-config-save-draft')&&calls.includes('central-config-publish')&&calls.includes('central-config-restore-draft'),'draft, publish and restore actions were exercised');
 assert.ok(!calls.includes('central-admin-state')&&!calls.includes('get-state'),'configuration UI never requests tracker or legacy admin state');
 console.log('PASS: Central Data Bank Admin browser QA — DEV and DEVACC login, draft save, explicit publish, restore-as-draft, mobile layout, logout, and ADMIN denial.');

} finally {
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
