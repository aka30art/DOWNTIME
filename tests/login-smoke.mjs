import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const indexHtml=await readFile(resolve('index.html'),'utf8');
const overviewHtml=await readFile(resolve('plant-overview-preview.html'),'utf8');
const adapter=await readFile(resolve('central-bank-client.js'),'utf8');
const server=createServer((req,res)=>{
  res.writeHead(200,{'content-type':req.url?.startsWith('/central-bank-client.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8','cache-control':'no-store'});
  if(req.url?.startsWith('/central-bank-client.js'))return res.end(adapter);
  res.end(req.url?.startsWith('/plant-overview-preview.html')?overviewHtml:indexHtml);
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(4173,'127.0.0.1',ok)});
const browser=await chromium.launch({headless:true});
const errors=[];
const tiers={
 OWNER:{canEditTracker:true,canManageUsers:true,canManageStaff:true,canManageSettings:true,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 ADMIN:{canEditTracker:true,canManageUsers:true,canManageStaff:true,canManageSettings:true,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 MANAGER:{canEditTracker:false,canManageUsers:false,canManageStaff:false,canManageSettings:false,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 SUPERVISOR:{canEditTracker:true,canManageUsers:false,canManageStaff:true,canManageSettings:false,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 USER:{canEditTracker:false,canManageUsers:false,canManageStaff:false,canManageSettings:false,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 SPECTATOR:{canEditTracker:false,canManageUsers:false,canManageStaff:false,canManageSettings:false,canViewStaff:false,canViewAssignments:false,canViewDashboards:false,canViewReports:false}
};
function makeBank(){
 const profiles=Object.fromEntries(['Jan','Mick','Gigi','Daz','Shayne'].map((name,i)=>[name,{station:'Station '+(i+1)+' · WOOD',onSite:true,photo:'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='}]));
 return {appData:{weeks:{},areas:['Feeder','Incline conveyor','Shaker','Magnet 1','Middle size conveyor','Oversize conveyor','Picking line','Magnet 2','Blowers','Cage','E-Stop','Mick/360','Other'],reasons:['Blockage'],archive:[],plantOn:true,dailyTaskPresets:[]},users:[],tiers,staff:{roster:Object.keys(profiles),profiles},statsSource:{weeks:{}}};
}
async function openFor(tier,pin='2468',username='JAN',initialBank=null,initialVersion=1){
 const context=await browser.newContext();
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const realtime={handler:null};
  window.__downtimeRealtimeMock=realtime;
  window.__downtimeEmitBroadcast=message=>realtime.handler?.(message);
  const channel={
   on(type,filter,callback){if(type==='broadcast'&&filter?.event==='central_state_changed')realtime.handler=callback;return this},
   subscribe(callback){window.__downtimeRealtimeSubscribed=true;callback?.('SUBSCRIBED');return this},
   unsubscribe(){return Promise.resolve('ok')}
  };
window.supabase={createClient:()=>({
   auth:{getSession:async()=>({data:{session:null}}),signInAnonymously:async()=>({data:{session:{access_token:'test-anonymous-session'}}})},
   realtime:{setAuth:async()=>{}},
   channel:(topic,options)=>{window.__downtimeRealtimeTopic=topic;window.__downtimeRealtimePrivate=options?.config?.private===true;return channel},
   removeChannel:async()=>({status:'ok'}),
   from:table=>({
    select(){return this},
    order:async()=>({data:table==='downtime_reports'?[{id:'weekly-report-qa',week_start:'2026-11-16',file_name:'Downtime_2026-11-16_Weekly.pdf',file_size_bytes:18432,operators:{Monday:'Jan'},storage_path:'2026-11-16/weekly-report-qa.pdf'}]:[],error:null})
   }),
   storage:{from:bucket=>({
    download:async path=>{window.__weeklyReportDownloads=window.__weeklyReportDownloads||[];window.__weeklyReportDownloads.push({bucket,path});const stream='BT /F1 26 Tf 70 760 Td (WEEKLY REPORT PREVIEW QA) Tj 0 -45 Td /F1 15 Tf (Week of 16 November 2026) Tj ET\n';let pdf='%PDF-1.4\n';const offsets=[0];const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream'];objects.forEach((object,index)=>{offsets.push(pdf.length);pdf+=(index+1)+' 0 obj\n'+object+'\nendobj\n'});const xref=pdf.length;pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';return {data:new Blob([pdf],{type:'application/pdf'}),error:null}}
   })}
  })};
 });
 let bank=initialBank?JSON.parse(JSON.stringify(initialBank)):makeBank(),version=initialVersion,token='central-session-'+username;
 const actions=[];
 await context.route('https://ygwfipksbbprqynvbklk.supabase.co/functions/v1/central-bank',async route=>{
  const req=route.request().postDataJSON(),action=req.action;
  actions.push({action,body:req});
  const ok=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(action==='list-users')return ok({users:[{username:'JAN',displayName:'Jan',tier:'OWNER'},{username:'MICK',displayName:'Mick',tier:username==='MICK'?tier:'USER'}]});
  if(action==='login'){
   if(req.username!==username||req.pin!==pin)return ok({error:'Invalid username or PIN'},401);
   return ok({token,expiresAt:new Date(Date.now()+3600000).toISOString(),user:{username,displayName:username==='JAN'?'Jan':'Mick',tier}});
  }
  if(action==='get-state'){
   const copy=JSON.parse(JSON.stringify(bank));
   if(tier==='SPECTATOR'){
    copy.staff={roster:[],profiles:{}};
    delete copy.appData.operatorProfiles;
    delete copy.appData.archive;
   }
   return ok({payload:copy,user:{username,displayName:username==='JAN'?'Jan':'Mick',tier},version,updatedAt:new Date().toISOString()});
  }
  if(action==='save-state'){
   const effectiveRights={...(tiers[tier]||{}),...(bank.tiers?.[tier]||{})};
   if(!effectiveRights.canEditTracker)return ok({error:'Permission denied'},403);
   if(Number(req.version)!==version)return ok({error:'Version conflict; refresh before saving'},409);
   bank.appData=req.appData;
   if(effectiveRights.canManageStaff){bank.staff.profiles=req.appData.operatorProfiles||bank.staff.profiles;bank.staff.roster=req.appData.staffRoster||bank.staff.roster}
   version++;
   return ok({version,updatedAt:new Date().toISOString()});
  }
  if(action==='save-settings'){
   if(Number(req.version)!==version)return ok({error:'Version conflict; refresh before saving Settings'},409);
   const rights={...(tiers[tier]||{}),...(bank.tiers?.[tier]||{})};
   const canManageAreas=rights.canManageSettings===true||rights.canManageAreaPresets===true;
   const canManageReasons=rights.canManageSettings===true||rights.canManageReasonPresets===true;
   const canAddReasons=canManageReasons||rights.canAddDowntimeReasons===true;
   const canManageSchedule=rights.canManageSettings===true||rights.canManageShiftSchedule===true;
   const canManageTasks=rights.canManageSettings===true||rights.canManageDailyTasks===true;
   const canManageStaff=rights.canManageStaff===true;
   const canManageAssignments=rights.canManageAssignments===true||canManageStaff;
   if(!(canManageAreas||canAddReasons||canManageSchedule||canManageTasks||canManageStaff||canManageAssignments))return ok({error:'Permission denied'},403);
   const next={...bank.appData};
   if(canManageAreas)next.areas=req.appData.areas;
   if(canManageReasons)next.reasons=req.appData.reasons;
   else if(canAddReasons){const existing=next.reasons||[];next.reasons=[...existing,...(req.appData.reasons||[]).filter(value=>!existing.includes(value))]}
   if(canManageSchedule){next.shiftSchedule=req.appData.shiftSchedule;next.shiftPresets=req.appData.shiftPresets}
   if(canManageTasks)next.dailyTaskPresets=req.appData.dailyTaskPresets;
   if(canManageStaff){next.operatorProfiles=req.appData.operatorProfiles;next.staffRoster=req.appData.staffRoster;bank.staff.profiles=req.appData.operatorProfiles;bank.staff.roster=req.appData.staffRoster}
   else if(canManageAssignments){next.operatorProfiles={...(next.operatorProfiles||{})};for(const [name,profile] of Object.entries(req.appData.operatorProfiles||{})){if(next.operatorProfiles[name])next.operatorProfiles[name]={...next.operatorProfiles[name],station:profile.station}}}
   bank.appData=next;version++;
   return ok({version,updatedAt:new Date().toISOString()});
  }
  if(action==='tiers-save'){
   if(username!=='JAN'||tier!=='OWNER')return ok({error:'Only JAN can change tier rights'},403);
   if(Number(req.version)!==version)return ok({error:'Version conflict'},409);
   bank.tiers=req.tiers;version++;
   return ok({ok:true,version});
  }
  if(action==='set-plant-status'){
   if(!tiers[tier].canEditTracker)return ok({error:'Permission denied'},403);
   if(Number(req.version)!==version)return ok({error:'Version conflict; refresh before changing plant status'},409);
   bank.appData.plantOn=req.plantOn;version++;
   return ok({version,updatedAt:new Date().toISOString()});
  }
  if(action==='logout')return ok({ok:true});
  return ok({error:'Unknown action'},400);
 });
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',route=>route.abort());
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#centralUsername')?.options.length>1,{timeout:5000});
 return {context,page,actions,getBank:()=>bank,getVersion:()=>version,setVersion:value=>{version=value}};
}
async function pinpad(page,pin){for(const digit of pin)await page.locator('[data-pinpad="teamPin"] [data-key="'+digit+'"]').click()}
async function signIn(page,pin='2468',username='JAN'){
 await page.locator('#centralUsername').selectOption(username);
 await pinpad(page,pin);
 await page.locator('#unlockBtn').click();
 await page.waitForFunction(()=>document.querySelector('#authGate').style.display==='none',{timeout:5000});
 await page.waitForFunction(()=>document.querySelector('#cloudStatus').textContent.includes('CENTRAL'),{timeout:5000});
 await page.waitForFunction(()=>window.__downtimeRealtimeSubscribed===true,{timeout:5000});
 assert.equal(await page.locator('.nav[data-view="weekly"]').evaluate(el=>el.classList.contains('active')),true,'successful login always activates Weekly Sheet navigation');
 assert.equal(await page.locator('#weekly').evaluate(el=>el.classList.contains('active')),true,'successful login always lands on the Weekly Sheet view');
 assert.equal(await page.locator('.view.active').count(),1,'login leaves exactly one active view');
 assert.equal(await page.evaluate(()=>window.__downtimeRealtimeTopic),'downtime-central-state','client subscribes to the central state topic');
 assert.equal(await page.evaluate(()=>window.__downtimeRealtimePrivate),true,'central state topic is private');
}

async function openStaffSettings(page){
 const menu=page.locator('.nav-menu');
 if(!await menu.evaluate(node=>node.open))await menu.locator(':scope > summary').click();
 await page.locator('.nav[data-view="settings"]').click();
 await page.locator('[data-settings-open="staff"]').click();
 await page.locator('#staffRosterList').waitFor({state:'visible'});
}

async function openSettingsHub(page){
 const menu=page.locator('.nav-menu');
 if(!await menu.evaluate(node=>node.open))await menu.locator(':scope > summary').click();
 await page.locator('.nav[data-view="settings"]').click();
 await page.locator('#settingsHub').waitFor({state:'visible'});
}

try{
 // Invalid credentials never unlock the tracker.
 const rejected=await openFor('OWNER');
 await rejected.page.locator('#centralUsername').selectOption('JAN');
 await pinpad(rejected.page,'9999');
 await rejected.page.locator('#unlockBtn').click();
 await rejected.page.waitForFunction(()=>document.querySelector('#authMsg').textContent.includes('Invalid username or PIN'),{timeout:5000});
 assert.equal(await rejected.page.locator('#authGate').isVisible(),true,'bad PIN must keep central login gate open');
 await rejected.context.close();

 // OWNER login and central versioned persistence.
 const owner=await openFor('OWNER');
 await signIn(owner.page);
 assert.equal(await owner.page.locator('#authGate').isVisible(),false,'central login closes after authentication');

 await owner.page.locator('.nav-menu > summary').click();
 assert.equal(await owner.page.locator('.nav[data-view="reports"]').textContent().then(value=>value.includes('WEEKLY Reports')),true,'navigation label is renamed to WEEKLY Reports');
 await owner.page.locator('.nav[data-view="reports"]').click();
 await owner.page.locator('[data-report-display="weekly-report-qa"]').waitFor({state:'visible',timeout:5000});
 assert.equal(await owner.page.locator('#reports h2').textContent(),'WEEKLY REPORTS','reports section uses the new heading');
 await owner.page.locator('[data-report-display="weekly-report-qa"]').click();
 await owner.page.waitForFunction(()=>document.querySelector('#reportPreviewModal')?.classList.contains('show')&&document.querySelector('#reportPreviewFrame')?.src.startsWith('blob:'),{timeout:5000});
 await owner.page.waitForTimeout(1200); // Allow Chromium's built-in PDF renderer to paint the loaded page before screenshots.
 assert.equal(await owner.page.locator('#reportPreviewTitle').textContent(),'WEEK OF 16/11/2026','Display opens the selected report, not the current tracker week');
 assert.deepEqual(await owner.page.evaluate(()=>window.__weeklyReportDownloads),[{bucket:'downtime-pdfs',path:'2026-11-16/weekly-report-qa.pdf'}],'Display fetches only the selected report PDF from cloud storage');
 await mkdir(resolve('artifacts/weekly-reports'),{recursive:true});
 for(const width of [320,390,600,601,768,1280]){
  await owner.page.setViewportSize({width,height:900});
  const bounds=await owner.page.locator('.report-preview-modal').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height,frameHeight:el.querySelector('iframe').getBoundingClientRect().height}});
  assert.ok(bounds.left>=0&&bounds.right<=width+1,'weekly report preview stays within viewport width '+width);
  assert.ok(bounds.frameHeight>200,'weekly report PDF viewer remains usable at '+width+'px');
  await owner.page.screenshot({path:resolve('artifacts/weekly-reports/report-preview-'+width+'px.png')});
 }
 await owner.page.keyboard.press('Escape');
 await owner.page.waitForFunction(()=>!document.querySelector('#reportPreviewModal')?.classList.contains('show'),{timeout:3000});
 assert.equal(await owner.page.locator('#reportPreviewFrame').getAttribute('src'),null,'closing the preview releases its PDF object URL');
 await owner.page.locator('.nav[data-view="weekly"]').click();
 assert.equal(await owner.page.locator('.nav[data-view="staff"]').count(),0,'STAFF is no longer a standalone navigation item');
 assert.equal(await owner.page.locator('.nav[data-view="settings"]').isVisible(),true,'OWNER can open Settings');
 await openSettingsHub(owner.page);
 await mkdir(resolve('artifacts/settings-hub'),{recursive:true});
 const settingsGrid=owner.page.locator('.settings-card-grid');
 for(const [width,columns] of [[1280,3],[1000,2],[600,1]]){
  await owner.page.setViewportSize({width,height:900});
  const layout=await settingsGrid.evaluate(el=>{
   const cards=Array.from(el.querySelectorAll(':scope > [data-settings-open]'));
   const rects=Object.fromEntries(cards.map(card=>[card.dataset.settingsOpen,card.getBoundingClientRect()]));
   return {columns:getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length,count:cards.length,staffTop:rects.staff?.top,dailyTasksTop:rects.dailyTasks?.top};
  });
  assert.equal(layout.count,6,'all six Settings cards are inside the grid at '+width+'px');
  assert.equal(layout.columns,columns,'Settings grid has '+columns+' columns at '+width+'px');
  if(width===1280)assert.ok(Math.abs(layout.staffTop-layout.dailyTasksTop)<2,'STAFF occupies the sixth grid position alongside the other cards');
  await owner.page.screenshot({path:resolve('artifacts/settings-hub/settings-'+width+'px.png')});
 }
 await owner.page.setViewportSize({width:1280,height:900});
 const accessRightsTile=owner.page.locator('[data-settings-open="accessRights"]');
 assert.equal(await accessRightsTile.isVisible(),true,'JAN root OWNER sees the dedicated ACCESS AND RIGHTS Settings destination');
 await accessRightsTile.click();
 assert.equal(await owner.page.locator('#settingsPanelAccessRights').isVisible(),true,'JAN opens the dedicated tier rights editor');
 assert.equal(await owner.page.locator('#accessRightsTierList [data-access-tier-card]').count(),5,'JAN can configure all five non-root tiers');
 assert.equal(await owner.page.locator('#accessRightsTierList [data-access-tier="OWNER"]').count(),0,'root OWNER rights are never editable');
 const adminDeleteRight=owner.page.locator('[data-access-tier="ADMIN"][data-access-right="canDeleteRecords"]');
 assert.equal(await adminDeleteRight.isChecked(),false,'ADMIN delete-record permission starts disabled');
 await adminDeleteRight.check();
 await owner.page.evaluate(()=>{
  const admin=document.querySelector('[data-access-tier-card="ADMIN"]'),manager=document.querySelector('[data-access-tier-card="MANAGER"]');
  admin.querySelectorAll('input[data-access-right]').forEach(source=>{const target=manager.querySelector('[data-access-right="'+source.dataset.accessRight+'"]');if(target)target.checked=source.checked});
 });
 await owner.page.locator('#saveAccessRights').click();
 await owner.page.waitForFunction(()=>document.querySelector('#accessRightsStatus')?.textContent.includes('saved centrally'),{timeout:5000});
 assert.equal(owner.getBank().tiers.ADMIN.canDeleteRecords,true,'JAN saves tier rights to central state');
 assert.equal(owner.getBank().tiers.MANAGER.canEditTracker,owner.getBank().tiers.ADMIN.canEditTracker,'MANAGER receives the same tracker-edit right as ADMIN');
 assert.deepEqual(owner.getBank().tiers.MANAGER,owner.getBank().tiers.ADMIN,'MANAGER permission profile exactly matches ADMIN');
 assert.ok(owner.actions.some(item=>item.action==='tiers-save'),'tier rights are saved through the central API');
 await owner.page.screenshot({path:resolve('artifacts/settings-hub/access-rights-1280px.png')});
 await owner.page.locator('#settingsPanelAccessRights [data-settings-back]').click();
 const nonJanAdmin=await openFor('ADMIN','2468','MICK');
 await signIn(nonJanAdmin.page,'2468','MICK');
 await openSettingsHub(nonJanAdmin.page);
 assert.equal(await nonJanAdmin.page.locator('[data-settings-open="accessRights"]').isVisible().catch(()=>false),false,'non-JAN ADMIN cannot see Access and Rights');
 await nonJanAdmin.context.close();
 const manager=await openFor('MANAGER','2468','MICK',owner.getBank(),owner.getVersion());
 await signIn(manager.page,'2468','MICK');
 await openSettingsHub(manager.page);
 assert.equal(await manager.page.locator('[data-settings-open="accessRights"]').isVisible().catch(()=>false),false,'MANAGER never gains access to JAN-only Access and Rights');
 assert.equal(await manager.page.locator('[data-settings-open="areas"]').isVisible(),true,'MANAGER receives ADMIN-equivalent Settings access');
 await manager.page.locator('[data-settings-open="areas"]').click();
 assert.equal(await manager.page.locator('#newAreaPreset').isEnabled(),true,'MANAGER can edit Area Presets when granted ADMIN-equivalent rights');
 await manager.page.locator('#newAreaPreset').fill('Manager QA Bay');
 await manager.page.locator('#addAreaPresetBtn').click();
 for(let attempt=0;attempt<40&&!manager.getBank().appData.areas.includes('Manager QA Bay');attempt++)await manager.page.waitForTimeout(50);
 assert.ok(manager.getBank().appData.areas.includes('Manager QA Bay'),'MANAGER Settings save succeeds without relying on tracker save-state permission');
 assert.ok(manager.actions.some(action=>action.action==='save-settings'),'MANAGER uses the dedicated central Settings save route');
 manager.getBank().tiers.MANAGER.canManageSettings=false;
 manager.getBank().tiers.MANAGER.canManageAreaPresets=false;
 const revokedVersion=manager.getVersion()+1;manager.setVersion(revokedVersion);
 await manager.page.evaluate(version=>window.__downtimeEmitBroadcast({payload:{version,updated_at:new Date().toISOString()}}),revokedVersion);
 await manager.page.waitForFunction(()=>document.querySelector('#newAreaPreset')?.disabled===true,{timeout:5000});
 assert.equal(await manager.page.locator('[data-settings-open="areas"]').isVisible(),true,'MANAGER keeps read access when edit permission is revoked');
 assert.equal(await manager.page.locator('#newAreaPreset').isDisabled(),true,'live central permission change revokes Settings edit controls without a new login');
 assert.equal(await manager.page.locator('#authGate').isVisible(),false,'live permission changes do not force a logout');
 await manager.page.locator('.nav[data-view="weekly"]').click();
 assert.equal(await manager.page.locator('#addEntry').isEnabled(),true,'MANAGER has the same tracker-edit control state as ADMIN');
 await manager.page.locator('#addEntry').click();
 await manager.page.locator('#entryModal').waitFor({state:'visible'});
 await manager.page.locator('#areaButtons [data-preset]').first().click();
 await manager.page.locator('#reasonButtons [data-preset]').first().click();
 await manager.page.locator('#durationMinutes').evaluate(input=>{input.value='5';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
 await manager.page.locator('#saveEntry').click();
 for(let attempt=0;attempt<40&&!Object.values(manager.getBank().appData.weeks||{}).some(week=>week.days?.some(day=>day.entries?.some(entry=>entry.minutes===5)));attempt++)await manager.page.waitForTimeout(50);
 assert.ok(Object.values(manager.getBank().appData.weeks||{}).some(week=>week.days?.some(day=>day.entries?.some(entry=>entry.minutes===5))),'MANAGER can create and save an operational entry with ADMIN-equivalent rights');
 assert.ok(manager.actions.some(action=>action.action==='save-state'),'MANAGER operational edits use the tracker save route');
 await manager.context.close();
 await owner.page.locator('[data-settings-open="areas"]').click();
 await owner.page.locator('#areaPresetAdminList [data-area-name]').first().waitFor({state:'visible',timeout:5000});
 const configuredAreas=['Feeder','Incline conveyor','Shaker','Magnet 1','Middle size conveyor','Oversize conveyor','Picking line','Magnet 2','Blowers','Cage','E-Stop','Mick/360','Other'];
 assert.deepEqual(await owner.page.locator('#areaPresetAdminList [data-area-name]').allTextContents(),configuredAreas,
  'AREA PRESETS displays the same centrally configured area values as the entry form');
 await owner.page.screenshot({path:resolve('artifacts/settings-hub/area-presets-1280px.png')});
 await owner.page.locator('#newAreaPreset').fill('QA Test Bay');
 await owner.page.locator('#addAreaPresetBtn').click();
 await owner.page.locator('#areaPresetAdminList [data-area-preset="QA Test Bay"]').waitFor({state:'visible',timeout:3000});
 for(let attempt=0;attempt<40&&!owner.getBank().appData.areas.includes('QA Test Bay');attempt++)await owner.page.waitForTimeout(50);
 assert.ok(owner.getBank().appData.areas.includes('QA Test Bay'),'new AREA PRESET is saved through the central settings route');
 await owner.page.locator('#areaPresetAdminList button[aria-label="Remove area QA Test Bay"]').click();
 await owner.page.waitForFunction(()=>!document.querySelector('#areaPresetAdminList [data-area-preset="QA Test Bay"]'),{timeout:3000});
 for(let attempt=0;attempt<40&&owner.getBank().appData.areas.includes('QA Test Bay');attempt++)await owner.page.waitForTimeout(50);
 assert.equal(owner.getBank().appData.areas.includes('QA Test Bay'),false,'removed AREA PRESET is saved through the central settings route');
 await owner.page.locator('.nav[data-view="weekly"]').click();
 await owner.page.locator('#addEntry').click();
 assert.deepEqual(await owner.page.locator('#areaButtons [data-preset]').evaluateAll(nodes=>nodes.map(node=>node.dataset.preset)),configuredAreas,
  'ADD DOWNTIME ENTRY uses the same area presets shown in Settings');
 await owner.page.locator('#cancelEntry').click();
 await openSettingsHub(owner.page);
 await owner.page.locator('[data-settings-open="staff"]').click();
 assert.equal(await owner.page.locator('#settingsPanelStaff').isVisible(),true,'OWNER can open the STAFF panel from Settings');
 assert.equal(await owner.page.locator('#addStaffBtn').isEnabled(),true,'OWNER retains STAFF management privileges');
 assert.equal(await owner.page.locator('.nav[data-view="reports"]').isVisible(),true,'OWNER can view reports');
 assert.equal(await owner.page.locator('.overview-link').isVisible(),true,'OWNER can view Plant Overview');
 assert.equal(await owner.page.locator('#addEntry').isDisabled(),false,'OWNER can edit tracker');
 await owner.page.locator('.overview-link').click();
 const overview=owner.page.frameLocator('#overviewFrame');
 await owner.page.waitForFunction(()=>{const overlay=document.querySelector('#overviewOverlay'),frame=document.querySelector('#overviewFrame');return overlay&&!overlay.hidden&&frame?.contentDocument?.readyState==='complete'},{timeout:7000});
 await overview.locator('#plantControlNote').waitFor({state:'visible'});
 await owner.page.waitForFunction(()=>document.querySelector('#overviewFrame')?.contentWindow?.document?.querySelector('#plantControlNote')?.textContent.includes('LIVE SYNC'),{timeout:5000});
 assert.equal(await owner.page.locator('#overviewOverlay').isVisible(),true,'Plant Overview opens over the existing tracker');
 assert.equal(await owner.page.locator('#overviewFrame').count(),1,'Overview is embedded rather than opened in a new tab');
 assert.equal(owner.context.pages().length,1,'Overview does not create a browser tab or window');
 assert.equal(await overview.locator('#plantToggle').isVisible(),true,'OWNER retains plant toggle access in the embedded Overview');
 const versionBeforePlantAndTrackerEdits=owner.getVersion();
 await overview.locator('#plantToggle').click();
 await owner.page.waitForTimeout(150);
 assert.equal(owner.getBank().appData.plantOn,false,'Embedded Overview plant toggle writes centrally');
 assert.ok(owner.actions.some(x=>x.action==='set-plant-status'),'Embedded Overview status change uses the central status action');
 await overview.locator('#exitOverview').click();
 await owner.page.waitForFunction(()=>document.querySelector('#overviewOverlay')?.hidden===true,{timeout:3000});
 assert.equal(await owner.page.locator('#authGate').isVisible(),false,'Exiting Overview returns to the still-authenticated main app');
 assert.equal(await owner.page.locator('.view.active').count(),1,'The underlying tracker view remains active');
 await owner.page.locator('.overview-link').click();
 assert.equal(await owner.page.locator('#overviewOverlay').isVisible(),true,'Overview can be reopened');
 await overview.locator('#overviewFullscreen').focus();
 await owner.page.keyboard.press('Escape');
 await owner.page.waitForFunction(()=>document.querySelector('#overviewOverlay')?.hidden===true,{timeout:3000});
 await owner.page.locator('.overview-link').click();
 await owner.page.keyboard.press('Escape');
 await owner.page.waitForFunction(()=>document.querySelector('#overviewOverlay')?.hidden===true,{timeout:3000});
 await owner.page.locator('.overview-link').click();
 await owner.page.locator('#overviewClose').click();
 await owner.page.waitForFunction(()=>document.querySelector('#overviewOverlay')?.hidden===true,{timeout:3000});
 assert.equal(owner.context.pages().length,1,'Closing overlay keeps the same app tab');

 const pollsBefore=owner.actions.filter(x=>x.action==='get-state').length;
 await owner.page.waitForTimeout(5500);
 assert.ok(owner.actions.filter(x=>x.action==='get-state').length>pollsBefore,'main tracker automatically polls central state for cross-device changes');
 const transitionAck=owner.page.locator('#plantTransitionAlertHost button');
 if(await transitionAck.count())await transitionAck.click();
 await owner.page.locator('#manualRefreshBtn').click();
 await owner.page.waitForFunction(()=>document.querySelector('#cloudStatus').textContent.includes('MANUAL REFRESH COMPLETE'),{timeout:5000});
 await owner.page.locator('.nav[data-view="settings"]').click();
 await owner.page.locator('[data-settings-open="areas"]').click();
 await owner.page.locator('#newAreaPreset').fill('Central Sync Test');
 await owner.page.locator('#addAreaPresetBtn').click();
 await owner.page.waitForFunction(()=>document.body.textContent.includes('Central Sync Test'));
 for(let i=0;i<30&&!owner.actions.some(x=>x.action==='save-settings'&&x.body.appData.areas?.includes('Central Sync Test'));i++)await owner.page.waitForTimeout(100);
 assert.ok(owner.actions.some(x=>x.action==='save-settings'&&x.body.appData.areas?.includes('Central Sync Test')),'AREA PRESETS must use the independent central save-settings route');
 assert.ok(owner.getBank().appData.areas.includes('Central Sync Test'),'central bank mock should retain the edited tracker setting');
 assert.equal(owner.getVersion(),versionBeforePlantAndTrackerEdits+2,'plant status and tracker edits must each advance the compare-and-swap version');

 // Daily Tasks are preset in Settings, then checked independently for each operating day.
 const versionBeforeDailyTaskFlow=owner.getVersion();
 await owner.page.locator('#settingsPanelAreas [data-settings-back]').click();
 await owner.page.locator('[data-settings-open="dailyTasks"]').click();
 await owner.page.locator('#dailyTaskPresetInput').fill('Check guards and safety covers');
 await owner.page.locator('#addDailyTaskPresetBtn').click();
 await owner.page.locator('#dailyTaskPresetInput').fill('Inspect emergency stops');
 await owner.page.locator('#addDailyTaskPresetBtn').click();
 for(let attempt=0;attempt<40&&owner.getBank().appData.dailyTaskPresets?.length!==2;attempt++)await owner.page.waitForTimeout(100);
 assert.deepEqual(owner.getBank().appData.dailyTaskPresets,['Check guards and safety covers','Inspect emergency stops'],'daily task presets sync to the central bank');
 assert.ok(owner.actions.filter(x=>x.action==='save-settings'&&Array.isArray(x.body.appData.dailyTaskPresets)).length>=2,'daily task presets use the settings-specific write action');
 const ownerMenu=owner.page.locator('.nav-menu');
 if(!await ownerMenu.evaluate(node=>node.open))await ownerMenu.locator(':scope > summary').click();
 await owner.page.locator('.nav[data-view="weekly"]').click();
 const daySetup=owner.page.locator('.day-setup');
 if(!await daySetup.evaluate(node=>node.open))await daySetup.locator(':scope > summary').click();
 await owner.page.locator('#dayTabs [data-day="0"]').click();
 await owner.page.locator('#openDailyTasks').click();
 assert.equal((await owner.page.locator('#dailyTasksDay').textContent()).trim().startsWith('MONDAY ·'),true,'the task fixture is explicitly operating on Monday');
 assert.equal(await owner.page.locator('#dailyTasksModal').isVisible(),true,'clipboard opens the Daily Tasks popup');
 assert.equal(await owner.page.locator('#dailyTasksList input[type="checkbox"]').count(),2,'popup displays all preset tasks');
 await owner.page.locator('[aria-label="Complete task: Check guards and safety covers"]').check();
 await owner.page.waitForFunction(()=>document.querySelector('[aria-label="Complete task: Check guards and safety covers"]')?.checked===true,{timeout:3000});
 const includesMondayTask=()=>owner.actions.some(x=>x.action==='save-state'&&Object.values(x.body.appData.weeks||{}).some(w=>w.days?.[0]?.dailyTasksDone?.includes('Check guards and safety covers')));
 for(let attempt=0;attempt<60&&!includesMondayTask();attempt++)await owner.page.waitForTimeout(100);
 const mondayWrite=[...owner.actions].reverse().find(x=>x.action==='save-state'&&Object.values(x.body.appData.weeks||{}).some(w=>w.days?.[0]?.dailyTasksDone?.includes('Check guards and safety covers')));
 assert.ok(mondayWrite,'Monday task completion is included in a central save-state request after earlier queued writes finish');
 const weekKey=Object.keys(owner.getBank().appData.weeks)[0];
 for(let attempt=0;attempt<30&&!owner.getBank().appData.weeks[weekKey]?.days?.[0]?.dailyTasksDone?.includes('Check guards and safety covers');attempt++)await owner.page.waitForTimeout(100);
 assert.ok(owner.getBank().appData.weeks[weekKey].days[0].dailyTasksDone?.includes('Check guards and safety covers'),'Monday task completion is written centrally');
 assert.equal(owner.getBank().appData.weeks[weekKey].days[0].dailyTasksDone?.includes('Inspect emergency stops')||false,false,'unchecked Monday tasks remain incomplete');
 await owner.page.setViewportSize({width:390,height:844});
 await mkdir(resolve('artifacts/stage-3'),{recursive:true});
 await owner.page.locator('#dailyTasksModal').screenshot({path:resolve('artifacts/stage-3/daily-tasks-popup-390px.png')});
 console.log('PASS: Daily Tasks presets use save-settings and day-specific completions use save-state');
 await owner.page.locator('#closeDailyTasks').click();
 await owner.page.locator('#dayTabs [data-day="1"]').click();
 await owner.page.locator('#openDailyTasks').click();
 assert.equal(await owner.page.locator('[aria-label="Complete task: Check guards and safety covers"]').isChecked(),false,'Tuesday starts with an independent checklist');
 assert.equal(await owner.page.locator('[aria-label="Complete task: Inspect emergency stops"]').isChecked(),false,'Tuesday does not inherit Monday completion');
 await owner.page.locator('[aria-label="Complete task: Inspect emergency stops"]').check();
 await owner.page.locator('#closeDailyTasks').click();
 await owner.page.locator('#dayTabs [data-day="0"]').click();
 await owner.page.locator('#openDailyTasks').click();
 assert.equal(await owner.page.locator('[aria-label="Complete task: Check guards and safety covers"]').isChecked(),true,'Monday completion is retained after switching days');
 assert.equal(await owner.page.locator('[aria-label="Complete task: Inspect emergency stops"]').isChecked(),false,'Monday completion does not inherit Tuesday changes');
 assert.equal(owner.getVersion(),versionBeforeDailyTaskFlow+4,'daily task presets and two day-specific completions are versioned central writes');
 await owner.page.locator('#closeDailyTasks').click();

 // STAFF additions and station assignments must immediately appear in the already-open Overview iframe.
 await openStaffSettings(owner.page);
 await owner.page.locator('#newStaffName').fill('Rita');
 await owner.page.locator('#addStaffBtn').click();
 const ritaStation=owner.page.locator('[aria-label="Station assignment for Rita"]');
 await ritaStation.waitFor({state:'visible'});
 assert.equal(await ritaStation.inputValue(),'','new STAFF member starts unassigned');
 await ritaStation.selectOption('Station 6 · GENERAL');
 for(let attempt=0;attempt<40&&!owner.getBank().staff.profiles.Rita?.station;attempt++)await owner.page.waitForTimeout(100);
 assert.equal(owner.getBank().staff.profiles.Rita.station,'Station 6 · GENERAL','station assignment is saved centrally');
 assert.equal(owner.getVersion(),versionBeforeDailyTaskFlow+6,'daily task presets, day completions and STAFF operations all advance central version');
 await owner.page.locator('.overview-link').click();
 const ritaCard=owner.page.frameLocator('#overviewFrame').locator('[data-opprofile="RITA"]');
 await ritaCard.waitFor({state:'visible',timeout:3000});
 assert.equal(await ritaCard.locator('.name').textContent(),'RITA','new STAFF card is created dynamically');
 assert.equal(await ritaCard.locator('.station').textContent(),'Station 6 · GENERAL','Overview immediately shows the assigned station');
 assert.equal(await owner.page.frameLocator('#overviewFrame').locator('[data-stationassigned="6"]').textContent(),'RITA','station blueprint updates immediately');

 // Simulate a change from another device: the private Realtime invalidation causes a fresh, permission-checked read.
 owner.getBank().staff.profiles.Rita.station='Station 5 · GENERAL';
 owner.getBank().appData.operatorProfiles.Rita.station='Station 5 · GENERAL';
 const externalVersion=owner.getVersion()+1;
 owner.setVersion(externalVersion);
 await owner.page.evaluate(version=>window.__downtimeEmitBroadcast({payload:{version,updated_at:new Date().toISOString()}}),externalVersion);
 await owner.page.waitForFunction(()=>document.querySelector('#overviewFrame')?.contentWindow?.document?.querySelector('[data-opprofile="RITA"] .station')?.textContent==='Station 5 · GENERAL',{timeout:3000});
 assert.equal(await owner.page.frameLocator('#overviewFrame').locator('[data-stationassigned="5"]').textContent(),'SHAYNE, RITA','remote station reassignment propagates to the station blueprint');
 assert.equal(await owner.page.frameLocator('#overviewFrame').locator('[data-stationassigned="6"]').textContent(),'UNASSIGNED','previous station assignment is cleared live');
 await owner.page.locator('#overviewClose').click();
 await owner.page.waitForFunction(()=>document.querySelector('#overviewOverlay')?.hidden===true,{timeout:3000});
 assert.equal(await owner.page.locator('.side #logoutBtn').isVisible(),true,'Log Out is available in the top navigation');
 assert.equal(await owner.page.locator('.top #logoutBtn').count(),0,'Log Out is no longer duplicated in the content header');
 await owner.page.locator('.side #logoutBtn').click();
 await owner.page.waitForFunction(()=>document.querySelector('#authGate').style.display!=='none');
 await owner.page.waitForFunction(()=>document.querySelector('#centralUsername')?.options.length>1,{timeout:5000});
 assert.equal(await owner.page.locator('#authGate h2').textContent(),'DOWNTIME · CENTRAL LOGIN','Log Out returns OWNER to the central USER login screen');
 assert.ok(owner.actions.some(x=>x.action==='logout'),'Log Out calls the central logout endpoint');
 await owner.context.close();

 // USER is fully informed but cannot edit or submit anything.
 const user=await openFor('USER','2468');
 await signIn(user.page);

 await user.page.locator('.nav-menu > summary').click();
 await user.page.locator('.nav[data-view="reports"]').click();
 await user.page.locator('[data-report-display="weekly-report-qa"]').waitFor({state:'visible',timeout:5000});
 assert.equal(await user.page.locator('[data-report-display="weekly-report-qa"]').isVisible(),true,'USER can display weekly reports with view permission');
 assert.equal(await user.page.locator('[data-report-download="weekly-report-qa"]').isVisible(),false,'USER cannot download reports without export permission');
 await user.page.locator('[data-report-display="weekly-report-qa"]').click();
 await user.page.waitForFunction(()=>document.querySelector('#reportPreviewFrame')?.src.startsWith('blob:'),{timeout:5000});
 await user.page.keyboard.press('Escape');
 await user.page.waitForFunction(()=>!document.querySelector('#reportPreviewModal')?.classList.contains('show'),{timeout:3000});
 assert.equal(await user.page.locator('#addEntry').isDisabled(),true,'USER is read-only');
 assert.equal(await user.page.locator('.nav[data-view="staff"]').count(),0,'STAFF is not a standalone USER navigation item');
 await openStaffSettings(user.page);
 assert.equal(await user.page.locator('#staffRosterList').isVisible(),true,'USER can view STAFF information inside Settings');
 assert.equal(await user.page.locator('#addStaffBtn').isDisabled(),true,'USER cannot manage STAFF');
 assert.equal(await user.page.locator('[data-settings-open="dailyTasks"]').isVisible(),false,'USER cannot manage Daily Tasks presets');
 assert.equal(await user.page.locator('.nav[data-view="reports"]').isVisible(),true,'USER can see reports');
 assert.equal(await user.page.locator('.overview-link').isVisible(),true,'USER can see Plant Overview');
 assert.notEqual(await user.page.locator('.weeklyKpis').evaluate(el=>getComputedStyle(el).display),'none','USER can see dashboards');
 assert.equal(await user.page.locator('.side #logoutBtn').isVisible(),true,'USER has Log Out in the top navigation');
 await user.page.locator('.side #logoutBtn').click();
 await user.page.waitForFunction(()=>document.querySelector('#authGate').style.display!=='none');
 await user.page.waitForFunction(()=>document.querySelector('#centralUsername')?.options.length>1,{timeout:5000});
 assert.equal(await user.page.locator('#authGate h2').textContent(),'DOWNTIME · CENTRAL LOGIN','USER is returned to the central login screen');
 assert.ok(user.actions.some(x=>x.action==='logout'),'USER sign-out invalidates the central session');
 await user.context.close();

 // SUPERVISOR can edit tracker data but not manage users or STAFF.
 const supervisor=await openFor('SUPERVISOR','2468');
 await signIn(supervisor.page);
 await supervisor.page.locator('.nav-menu > summary').click();
 assert.equal(await supervisor.page.locator('#addEntry').isDisabled(),false,'SUPERVISOR can edit tracker');
 assert.equal(await supervisor.page.locator('#newStaffName').isVisible().catch(()=>false),false,'STAFF editing is not exposed before selecting the Settings STAFF panel');
 await openStaffSettings(supervisor.page);
 assert.equal(await supervisor.page.locator('#addStaffBtn').isEnabled(),true,'SUPERVISOR can manage STAFF');
 assert.equal(await supervisor.page.locator('[data-settings-open="dailyTasks"]').isVisible(),false,'SUPERVISOR can manage STAFF but not general Settings presets');
 assert.equal(await supervisor.page.locator('#newStaffName').isEnabled(),true,'SUPERVISOR can add staff names');
 await supervisor.page.locator('#newStaffName').fill('Supervisor QA');
 await supervisor.page.locator('#addStaffBtn').click();
 assert.ok(supervisor.getBank().staff.roster.includes('Supervisor QA'),'SUPERVISOR staff changes sync to central roster');
 const supervisorStation=supervisor.page.locator('[aria-label="Station assignment for Supervisor QA"]');
 await supervisorStation.waitFor({state:'visible'});
 assert.equal(await supervisorStation.isEnabled(),true,'SUPERVISOR can assign stations to staff');
 assert.equal(await supervisor.page.locator('[aria-label="Supervisor QA on-site toggle"]').isEnabled(),true,'SUPERVISOR can change on-site presence');
 await supervisor.context.close();

 // SPECTATOR receives no staff/assignment/dashboard/report surfaces.
 const spectator=await openFor('SPECTATOR','2468');
 await signIn(spectator.page);
 await spectator.page.locator('.nav-menu > summary').click();
 assert.equal(await spectator.page.locator('.nav[data-view="staff"]').count(),0,'STAFF is not a standalone navigation item');
 assert.equal(await spectator.page.locator('.nav[data-view="settings"]').isVisible(),false,'SPECTATOR cannot open Settings');
 assert.equal(await spectator.page.locator('[data-settings-open="staff"]').isVisible(),false,'SPECTATOR cannot view STAFF');
 assert.equal(await spectator.page.locator('.nav[data-view="reports"]').isVisible(),false,'SPECTATOR cannot view reports');
 assert.equal(await spectator.page.locator('.overview-link').isVisible(),false,'SPECTATOR cannot view assignments overview');
 assert.equal(await spectator.page.locator('.weeklyKpis').evaluate(el=>getComputedStyle(el).display),'none','SPECTATOR cannot view dashboards');
 assert.equal(await spectator.page.locator('#addEntry').isDisabled(),true,'SPECTATOR is read-only');
 await spectator.context.close();

 assert.deepEqual(errors,[],'no browser JavaScript errors');
 console.log('PASS: central username/PIN authentication and invalid PIN rejection');
 console.log('PASS: central save-state writes use versioned compare-and-swap');
 console.log('PASS: OWNER and SUPERVISOR edit restrictions');
 console.log('PASS: USER sees all operational data in read-only mode');
 console.log('PASS: SPECTATOR restrictions hide staff, assignments, reports and dashboards');
}finally{
 await browser.close();
 await new Promise(ok=>server.close(ok));
}
