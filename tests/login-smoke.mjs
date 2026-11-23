import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const indexHtml=await readFile(resolve('index.html'),'utf8');
const overviewHtml=await readFile(resolve('plant-overview-preview.html'),'utf8');
const adapter=await readFile(resolve('central-bank-client.js'),'utf8');
const staffImageLibrary=await readFile(resolve('assets/staff/staff-image-library.js'),'utf8');
const server=createServer((req,res)=>{
  const pathname=String(req.url||'').split('?')[0];
  const isJavaScript=pathname==='/central-bank-client.js'||pathname==='/assets/staff/staff-image-library.js';
  res.writeHead(200,{'content-type':isJavaScript?'application/javascript; charset=utf-8':'text/html; charset=utf-8','cache-control':'no-store'});
  if(pathname==='/central-bank-client.js')return res.end(adapter);
  if(pathname==='/assets/staff/staff-image-library.js')return res.end(staffImageLibrary);
  res.end(pathname==='/plant-overview-preview.html'?overviewHtml:indexHtml);
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(4173,'127.0.0.1',ok)});
const browser=await chromium.launch({headless:true});
const errors=[];
const tiers={
 OWNER:{canEditTracker:true,canControlPlantPower:true,canManageUsers:true,canManageStaff:true,canManageAssignments:true,canManageSettings:true,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 ADMIN:{canEditTracker:true,canControlPlantPower:true,canManageUsers:true,canManageStaff:true,canManageAssignments:true,canManageSettings:true,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 MANAGER:{canEditTracker:false,canControlPlantPower:true,canManageUsers:false,canManageStaff:false,canManageSettings:false,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 SUPERVISOR:{canEditTracker:true,canControlPlantPower:true,canManageUsers:false,canManageStaff:true,canManageAssignments:true,canManageSettings:false,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 USER:{canEditTracker:false,canControlPlantPower:true,canManageUsers:false,canManageStaff:false,canManageSettings:false,canViewStaff:true,canViewAssignments:true,canViewDashboards:true,canViewReports:true},
 STAFF_ONLY:{canEditTracker:false,canControlPlantPower:true,canManageUsers:false,canManageStaff:true,canManageAssignments:false,canManageSettings:false,canViewStaff:true,canViewAssignments:true,canViewDashboards:false,canViewReports:false},
 ASSIGNMENT_ONLY:{canEditTracker:false,canControlPlantPower:true,canManageUsers:false,canManageStaff:false,canManageAssignments:true,canManageSettings:false,canViewStaff:true,canViewAssignments:true,canViewDashboards:false,canViewReports:false},
 SPECTATOR:{canEditTracker:false,canControlPlantPower:true,canManageUsers:false,canManageStaff:false,canManageSettings:false,canViewStaff:false,canViewAssignments:false,canViewDashboards:false,canViewReports:false}
};
tiers.DEVACC={...tiers.OWNER};
function makeBank(){
 const profiles=Object.fromEntries(['Jan','Mick','Gigi','Daz','Shayne'].map((name,i)=>[name,{station:'Station '+(i+1)+' · WOOD',onSite:true,photo:'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='}]));
 const roster=Object.keys(profiles);
 return {appData:{weeks:{},areas:['Feeder','Incline conveyor','Shaker','Magnet 1','Middle size conveyor','Oversize conveyor','Picking line','Magnet 2','Blowers','Cage','E-Stop','Mick/360','Other'],reasons:['Blockage'],archive:[],plantOn:true,dailyTaskPresets:[],staffRoster:roster.slice(),operatorProfiles:JSON.parse(JSON.stringify(profiles))},users:[],tiers,staff:{roster,profiles},statsSource:{weeks:{}}};
}
async function dismissPlantTransitionAlerts(page){
 const host=page.locator('#plantTransitionAlertHost');
 for(let attempt=0;attempt<30;attempt++){
  if(!(await host.count())){
   await page.waitForTimeout(80);
   if(!(await host.count()))return;
   continue;
  }
  const acknowledgement=host.getByRole('button',{name:'ACKNOWLEDGE'});
  try{
   await acknowledgement.waitFor({state:'visible',timeout:1500});
   await acknowledgement.click({timeout:1500});
  }catch(error){
   if(!(await host.count()))continue;
   await page.waitForTimeout(100);
  }
  await page.waitForTimeout(100);
 }
 throw new Error('Plant transition alerts did not drain after acknowledgement.');
}
async function clickOverview(page){
 const link=page.locator('.overview-link');
 for(let attempt=0;attempt<10;attempt++){
  await dismissPlantTransitionAlerts(page);
  try{await link.click({timeout:1800});return}
  catch(error){
   if(await page.locator('#plantTransitionAlertHost').count()){
    await dismissPlantTransitionAlerts(page);
    continue;
   }
   throw error;
  }
 }
 throw new Error('Plant transition alert repeatedly blocked Plant Overview navigation.');
}
async function openFor(tier,pin='2468',username='DEV',initialBank=null,initialVersion=1){
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
    download:async path=>{window.__weeklyReportDownloads=window.__weeklyReportDownloads||[];window.__weeklyReportDownloads.push({bucket,path});const stream='BT /F1 26 Tf 70 760 Td (WEEKLY REPORT PREVIEW QA) Tj 0 -45 Td /F1 15 Tf (Week of 16 November 2026) Tj ET\n';let pdf='%PDF-1.4\n';const offsets=[0];const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream'];objects.forEach((object,index)=>{offsets.push(pdf.length);pdf+=(index+1)+' 0 obj\n'+object+'\nendobj\n'});const xref=pdf.length;pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';return {data:new Blob([pdf],{type:'application/pdf'}),error:null}},
    uploadToSignedUrl:async(path,token,file,options)=>{window.__staffPhotoUploads=window.__staffPhotoUploads||[];window.__staffPhotoUploads.push({bucket,path,type:file?.type,size:file?.size,contentType:options?.contentType});return {data:{path},error:null}},
    remove:async paths=>{window.__staffPhotoRemovals=window.__staffPhotoRemovals||[];window.__staffPhotoRemovals.push({bucket,paths});return {data:(paths||[]).map(name=>({name})),error:null}}
   })}
  })};
 });
 let bank=initialBank?JSON.parse(JSON.stringify(initialBank)):makeBank(),version=initialVersion,token='central-session-'+username,failNextSettingsSave=false;
 const actions=[];
 const staffPhotoRemovals=[];
 let staffPhotoSequence=1;
 await context.route('https://ygwfipksbbprqynvbklk.supabase.co/functions/v1/central-bank',async route=>{
  const req=route.request().postDataJSON(),action=req.action;
  actions.push({action,body:req});
  const ok=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(action==='list-users'){
   const listed=bank.users?.length?bank.users.filter(user=>user.enabled!==false).map(user=>({username:user.username,displayName:user.displayName||user.username,tier:user.tier})):[{username:'DEV',displayName:'DEV',tier:'OWNER'},{username:'Jan',displayName:'Jan',tier:'USER'},{username:'MICK',displayName:'Mick',tier:username.toUpperCase()==='MICK'?tier:'USER'}];
   if(!listed.some(user=>user.username.toLowerCase()===username.toLowerCase()))listed.push({username,displayName:username,tier});
   return ok({users:listed});
  }
  if(action==='user-save'){
   const target=String(req.username||'').trim(),newTier=String(req.tier||'USER');
   const index=(bank.users||[]).findIndex(user=>String(user.username).toLowerCase()===target.toLowerCase());
   const existing=index>=0?bank.users[index]:null;
   const isDevRoot=username.toUpperCase()==='DEV'&&tier==='OWNER';
   const isRootAuthority=isDevRoot||tier==='DEVACC';
   if(!(tier==='ADMIN'||isRootAuthority))return ok({error:'Permission denied'},403);
   if(newTier==='OWNER')return ok({error:'DEV is the only OWNER account.'},403);
   if(newTier==='DEVACC'&&(!existing||existing.tier!=='DEVACC')&&!isDevRoot)return ok({error:'Only root DEV can assign DEVacc.'},403);
   if(existing?.tier==='DEVACC'&&!isRootAuthority)return ok({error:'Only DEV and DEVACC can modify DEVacc.'},403);
   if(existing?.tier==='OWNER')return ok({error:'The root OWNER account is protected.'},403);
   if(!existing&&!req.pin)return ok({error:'PIN required for new user'},400);
   if(req.pin&&!/^[0-9]{4,8}$/.test(String(req.pin)))return ok({error:'PIN must be 4-8 digits'},400);
   const user=existing||{username:target};
   user.username=target;user.displayName=String(req.displayName||target);user.tier=newTier;user.enabled=req.enabled!==false;
   if(index>=0)bank.users[index]=user;else bank.users.push(user);
   version++;
   return ok({ok:true,version});
  }
  if(action==='login'){
   if(req.username.toLowerCase()!==username.toLowerCase()||req.pin!==pin)return ok({error:'Invalid username or PIN'},401);
   return ok({token,expiresAt:new Date(Date.now()+3600000).toISOString(),user:{username,displayName:username.toUpperCase()==='DEV'?'DEV':username.toLowerCase()==='jan'?'Jan':'Mick',tier}});
  }
  if(action==='staff-original-upload'){
   const rights={...(tiers[tier]||{}),...(bank.tiers?.[tier]||{})};
   if(!rights.canManageStaff)return ok({error:'Permission denied'},403);
   const staffKey=String(req.staffKey||'').toLowerCase();
   if(!/^[a-z0-9]{1,30}$/.test(staffKey))return ok({error:'Invalid STAFF destination'},400);
   if(req.mimeType!=='image/png'||!req.base64)return ok({error:'Invalid PNG payload'},415);
   return ok({ok:true,staff:staffKey,path:'assets/staff/originals/'+staffKey+'/original.png',commitSha:'mock-commit-sha'});
  }
  if(action==='staff-photo-url'){
   const rights={...(tiers[tier]||{}),...(bank.tiers?.[tier]||{})};
   if(!rights.canManageStaff)return ok({error:'Permission denied'},403);
   const slug=String(req.name||'').toLowerCase().replace(/[^a-z0-9_-]/g,'-')||'staff';
   const path=slug+'/'+('00000000-0000-4000-8000-'+String(staffPhotoSequence++).padStart(12,'0'));
   return ok({path,token:'signed-photo-token',signedUrl:'https://storage.test/'+path});
  }
  if(action==='staff-photo-read'){
   const rights={...(tiers[tier]||{}),...(bank.tiers?.[tier]||{})};
   if(!rights.canViewStaff&&!rights.canManageStaff)return ok({error:'Permission denied'},403);
   return ok({url:'https://storage.test/'+req.path});
  }
  if(action==='staff-photo-remove'){
   const rights={...(tiers[tier]||{}),...(bank.tiers?.[tier]||{})};
   if(!rights.canManageStaff)return ok({error:'Permission denied'},403);
   staffPhotoRemovals.push({path:req.path});
   return ok({ok:true});
  }
  if(action==='get-state'){
   const copy=JSON.parse(JSON.stringify(bank));
   if(tier==='SPECTATOR'){
    copy.staff={roster:[],profiles:{}};
    delete copy.appData.operatorProfiles;
    delete copy.appData.archive;
   }
   return ok({payload:copy,user:{username,displayName:username.toUpperCase()==='DEV'?'DEV':username.toLowerCase()==='jan'?'Jan':'Mick',tier},version,updatedAt:new Date().toISOString()});
  }
  if(action==='save-state'){
   const effectiveRights={...(tiers[tier]||{}),...(bank.tiers?.[tier]||{})};
   if(!effectiveRights.canEditTracker)return ok({error:'Permission denied'},403);
   if(Number(req.version)!==version)return ok({error:'Version conflict; refresh before saving'},409);
   const currentProfiles=bank.staff.profiles||bank.appData.operatorProfiles||{},incomingProfiles=req.appData.operatorProfiles||{},profiles=effectiveRights.canManageStaff?JSON.parse(JSON.stringify(incomingProfiles)):JSON.parse(JSON.stringify(currentProfiles));for(const [name,incoming] of Object.entries(incomingProfiles)){if(!Object.prototype.hasOwnProperty.call(currentProfiles,name)||!incoming||typeof incoming!=='object')continue;const old=currentProfiles[name]||{},merged=effectiveRights.canManageStaff?{...incoming}:{...old};if(old.stationLocked===true||!effectiveRights.canManageAssignments){if('station' in old)merged.station=old.station;else delete merged.station;if('assignedStation' in old)merged.assignedStation=old.assignedStation;else delete merged.assignedStation}if('stationLocked' in old)merged.stationLocked=old.stationLocked===true;else delete merged.stationLocked;profiles[name]=merged}req.appData.operatorProfiles=profiles;if(effectiveRights.canManageStaff){bank.staff.roster=req.appData.staffRoster||bank.staff.roster}else req.appData.staffRoster=bank.staff.roster||[];bank.staff.profiles=profiles;bank.appData=req.appData;
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
   const canManageAssignments=rights.canManageAssignments===true;
   const canManageStations=rights.canManageSettings===true;
   if(failNextSettingsSave){failNextSettingsSave=false;return ok({error:'Simulated central save failure'},503)}
   if(!(canManageAreas||canAddReasons||canManageSchedule||canManageTasks||canManageStaff||canManageAssignments||canManageStations))return ok({error:'Permission denied'},403);
   const next={...bank.appData};
   if(canManageStations&&Array.isArray(req.appData.stationConfig))next.stationConfig=JSON.parse(JSON.stringify(req.appData.stationConfig));
   if(canManageAreas)next.areas=req.appData.areas;
   if(canManageReasons)next.reasons=req.appData.reasons;
   else if(canAddReasons){const existing=next.reasons||[];next.reasons=[...existing,...(req.appData.reasons||[]).filter(value=>!existing.includes(value))]}
   if(canManageSchedule){next.shiftSchedule=req.appData.shiftSchedule;next.shiftPresets=req.appData.shiftPresets}
   if(canManageTasks)next.dailyTaskPresets=req.appData.dailyTaskPresets;
   if(canManageStaff){const currentProfiles=bank.staff.profiles||next.operatorProfiles||{},newProfiles=JSON.parse(JSON.stringify(req.appData.operatorProfiles||currentProfiles));for(const [name,profile] of Object.entries(newProfiles)){const old=currentProfiles[name]||{};if(!canManageAssignments){if('station' in old)profile.station=old.station;else delete profile.station;if('assignedStation' in old)profile.assignedStation=old.assignedStation;else delete profile.assignedStation;if('stationLocked' in old)profile.stationLocked=old.stationLocked;else delete profile.stationLocked;continue}const wasLocked=old.stationLocked===true,explicitlyUnlocked=profile.stationLocked===false,requested=profile.station??profile.assignedStation??'',current=old.station??old.assignedStation??'';if(wasLocked&&!explicitlyUnlocked&&requested!==current){if('station' in old)profile.station=old.station;else delete profile.station;if('assignedStation' in old)profile.assignedStation=old.assignedStation;else delete profile.assignedStation;profile.stationLocked=true}else if(wasLocked&&!explicitlyUnlocked)profile.stationLocked=true;else if('stationLocked' in profile)profile.stationLocked=profile.stationLocked===true}next.operatorProfiles=newProfiles;next.staffRoster=req.appData.staffRoster;bank.staff.profiles=newProfiles;bank.staff.roster=req.appData.staffRoster}
   else if(canManageAssignments){const profiles=JSON.parse(JSON.stringify(bank.staff.profiles||next.operatorProfiles||{}));for(const [name,profile] of Object.entries(req.appData.operatorProfiles||{})){if(!profiles[name])continue;const old=profiles[name],requested=profile.station??profile.assignedStation??'',current=old.station??old.assignedStation??'',hasLockValue=Object.prototype.hasOwnProperty.call(profile,'stationLocked'),explicitlyUnlocked=profile.stationLocked===false;if(old.stationLocked!==true||explicitlyUnlocked||requested===current){if('station' in profile)old.station=requested;else if('assignedStation' in profile)old.assignedStation=requested}if(hasLockValue)old.stationLocked=profile.stationLocked===true;else if(old.stationLocked===true)old.stationLocked=true;profiles[name]=old}next.operatorProfiles=profiles;bank.staff.profiles=profiles;}
   bank.appData=next;version++;
   return ok({version,updatedAt:new Date().toISOString()});
  }
  if(action==='tiers-save'){
   if(!(username.toUpperCase()==='DEV'&&tier==='OWNER'))return ok({error:'Only root DEV can change tier rights'},403);
   if(Number(req.version)!==version)return ok({error:'Version conflict'},409);
   bank.tiers=req.tiers;version++;
   return ok({ok:true,version});
  }
  if(action==='set-plant-status'){
   const effectiveRights={...(tiers[tier]||{}),...(bank.tiers?.[tier]||{})};
   if(!effectiveRights.canControlPlantPower)return ok({error:'Permission denied'},403);
   if(Number(req.version)!==version)return ok({error:'Version conflict; refresh before changing plant status'},409);
   bank.appData.plantOn=req.plantOn;version++;
   return ok({version,updatedAt:new Date().toISOString()});
  }
  if(action==='logout')return ok({ok:true});
  return ok({error:'Unknown action'},400);
 });
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',route=>route.abort());
 await page.route('**/functions/v1/repair-maintenance-api',async route=>{
  const origin='http://127.0.0.1:4173';
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-headers':'apikey, content-type, x-downtime-session','access-control-allow-methods':'POST, OPTIONS','vary':'Origin'}});
  return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':origin,'vary':'Origin'},body:JSON.stringify({user:{username:'DEV',displayName:'DEV',tier:'DEV'},permissions:{canAccessYardHub:true,canAccessRepairMaintenance:true,canEditRepairMaintenance:true,canDeleteRepairMaintenance:true,canExportRepairMaintenanceReports:true}})});
 });
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 try{await page.waitForFunction(()=>document.querySelector('#centralUsername')?.options.length>1,{timeout:8000})}catch(error){throw new Error('Central login options failed to populate. Browser errors: '+errors.slice(-10).join(' | ')+'; auth message: '+await page.locator('#authMsg').textContent().catch(()=> 'missing')+'; window adapter: '+await page.evaluate(()=>String(!!window.DowntimeCentral)).catch(()=> 'unavailable')+'; original: '+error.message)}
 return {context,page,actions,getBank:()=>bank,getVersion:()=>version,getPhotoRemovals:()=>staffPhotoRemovals,setVersion:value=>{version=value},failNextSettingsSave:()=>{failNextSettingsSave=true}};
}
async function pinpad(page,pin){for(const digit of pin)await page.locator('[data-pinpad="teamPin"] [data-key="'+digit+'"]').click()}
async function signIn(page,pin='2468',username='DEV'){
 await page.locator('#centralUsername').selectOption(username);
 await pinpad(page,pin);
 await page.locator('#unlockBtn').click();
 await page.waitForFunction(()=>document.querySelector('#authGate').style.display==='none',{timeout:5000});
 await page.waitForFunction(()=>document.querySelector('#cloudStatus').textContent.includes('CENTRAL'),{timeout:5000});
 await page.waitForFunction(()=>window.__downtimeRealtimeSubscribed===true,{timeout:5000});
 assert.equal(await page.locator('#yardHub').isVisible(),true,'successful login lands on YARD HUB first');
 assert.equal(await page.locator('.shell').evaluate(el=>getComputedStyle(el).display==='none'),true,'DOWNTIME stays closed until the user launches it');
 assert.equal(await page.locator('#yardHubUsername').textContent().then(value=>value.trim().length>0),true,'YARD HUB identifies the authenticated user');
 assert.equal(await page.locator('.yard-tile[data-app]').count(),4,'YARD HUB exposes all four application tiles');
 assert.equal(await page.locator('#launchDowntimeBtn').isEnabled(),true,'DOWNTIME is the available application');
 assert.equal(await page.locator('.yard-tile[data-app="floor"]').isDisabled(),true,'FLOOR stays unavailable until released');
 assert.equal(await page.locator('.yard-tile[data-app="check-sheets"]').isDisabled(),true,'CHECK SHEETS stays unavailable until released');
 assert.equal(await page.locator('.yard-tile[data-app="repair-maintenance"]').isEnabled(),true,'R&M unlocks after the existing DOWNTIME session passes its module permission check');
 await page.locator('#launchDowntimeBtn').click();
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.shell')).display!=='none',{timeout:3000});
 assert.equal(await page.locator('#yardHub').isVisible(),false,'launching DOWNTIME closes YARD HUB');
 assert.equal(await page.locator('.nav[data-view="weekly"]').evaluate(el=>el.classList.contains('active')),true,'DOWNTIME opens its weekly tracker view');
 assert.equal(await page.locator('#weekly').evaluate(el=>el.classList.contains('active')),true,'DOWNTIME opens its existing tracker dashboard');
 assert.equal(await page.locator('.view.active').count(),1,'DOWNTIME leaves exactly one active view');
 assert.match(await page.locator('.nav[data-view="weekly"]').textContent(),/DOWNTIME/,'the old Home Page label is removed from DOWNTIME navigation');
 assert.equal(await page.evaluate(()=>window.__downtimeRealtimeTopic),'downtime-central-state','client subscribes to the central state topic');
 assert.equal(await page.evaluate(()=>window.__downtimeRealtimePrivate),true,'central state topic is private');
}

async function openStaffSettings(page){
 await dismissPlantTransitionAlerts(page);
 const menu=page.locator('.nav-menu');
 if(!await menu.evaluate(node=>node.open))await menu.locator(':scope > summary').click();
 await dismissPlantTransitionAlerts(page);
 await page.locator('.nav[data-view="settings"]').click();
 await dismissPlantTransitionAlerts(page);
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
 await rejected.page.locator('#centralUsername').selectOption('DEV');
 await pinpad(rejected.page,'9999');
 await rejected.page.locator('#unlockBtn').click();
 await rejected.page.waitForFunction(()=>document.querySelector('#authMsg').textContent.includes('Invalid username or PIN'),{timeout:5000});
 assert.equal(await rejected.page.locator('#authGate').isVisible(),true,'bad PIN must keep central login gate open');
 await rejected.context.close();

 // OWNER login and central versioned persistence.
 const owner=await openFor('OWNER');
 await signIn(owner.page);
 assert.equal(await owner.page.locator('#centralAdminNav').evaluate(el=>getComputedStyle(el).display!=='none'),true,'DEV root OWNER sees the Central Data Bank menu entry');
 assert.equal(await owner.page.locator('#authGate').isVisible(),false,'central login closes after authentication');
 await owner.page.locator('#backToYardHub').click();
 assert.equal(await owner.page.locator('#yardHub').isVisible(),true,'DOWNTIME returns to YARD HUB');
 assert.equal(await owner.page.locator('.shell').evaluate(el=>getComputedStyle(el).display==='none'),true,'the DOWNTIME shell closes when returning to YARD HUB');
 await owner.page.locator('#launchDowntimeBtn').click();
 await owner.page.waitForFunction(()=>getComputedStyle(document.querySelector('.shell')).display!=='none',{timeout:3000});
 assert.equal(await owner.page.locator('#yardHub').isVisible(),false,'relaunching DOWNTIME closes YARD HUB');
 // Jan remains a normal operational USER rather than a root/admin identity.
 const janOperational=await openFor('USER','1357','Jan');
 await signIn(janOperational.page,'1357','Jan');
 await janOperational.page.locator('.nav-menu > summary').click();
 assert.equal(await janOperational.page.locator('#centralAdminNav').evaluate(el=>getComputedStyle(el).display!=='none'),false,'Jan USER does not see the Central Data Bank admin entry');
 assert.equal(await janOperational.page.locator('#plantOperatorToggle').isVisible(),true,'USER tier sees Plant Power when its permission is enabled');
 assert.equal(await janOperational.page.locator('#plantOperatorToggle').textContent(),'PLANT ON · GREEN','USER sees the live plant status');
 await janOperational.page.locator('#plantOperatorToggle').click();
 await janOperational.page.waitForFunction(()=>document.querySelector('#plantOperatorToggle')?.textContent==='PLANT OFF · RED',{timeout:5000});
 assert.equal(janOperational.getBank().appData.plantOn,false,'USER can operate Plant Power despite having no tracker-edit right');
 await dismissPlantTransitionAlerts(janOperational.page);
 await openSettingsHub(janOperational.page);
 assert.equal(await janOperational.page.locator('[data-settings-open="accessRights"]').isVisible().catch(()=>false),false,'Jan USER cannot open root-only Access and Rights');
 await janOperational.context.close();

 // Isolated central API regression: both save-state and save-settings must reject locked station moves.
 const lockedFixture=makeBank();
 lockedFixture.appData.operatorProfiles=JSON.parse(JSON.stringify(lockedFixture.staff.profiles));
 lockedFixture.appData.staffRoster=lockedFixture.staff.roster.slice();
 lockedFixture.staff.profiles.Jan.stationLocked=true;
 lockedFixture.appData.operatorProfiles.Jan.stationLocked=true;
 const lockGuard=await openFor('OWNER','2468','DEV',lockedFixture,1);
 await signIn(lockGuard.page);
 const trackerAttempt=JSON.parse(JSON.stringify(lockGuard.getBank().appData));
 trackerAttempt.operatorProfiles.Jan.station='Station 2 · WOOD';
 const trackerResult=await lockGuard.page.evaluate(({snapshot,version})=>window.DowntimeCentral.saveTracker(snapshot,version),{snapshot:trackerAttempt,version:lockGuard.getVersion()});
 lockGuard.setVersion(trackerResult.version);
 assert.equal(lockGuard.getBank().staff.profiles.Jan.station,'Station 1 · WOOD','save-state cannot reassign a locked station');
 assert.equal(lockGuard.getBank().staff.profiles.Jan.stationLocked,true,'save-state preserves the station lock');
 const settingsAttempt=JSON.parse(JSON.stringify(lockGuard.getBank().appData));
 settingsAttempt.operatorProfiles.Jan.station='Station 3 · SCRAP';
 const settingsResult=await lockGuard.page.evaluate(({snapshot,version})=>window.DowntimeCentral.saveSettings(snapshot,version),{snapshot:settingsAttempt,version:lockGuard.getVersion()});
 lockGuard.setVersion(settingsResult.version);
 assert.equal(lockGuard.getBank().staff.profiles.Jan.station,'Station 1 · WOOD','save-settings cannot reassign a locked station without explicit unlock');
 assert.equal(lockGuard.getBank().staff.profiles.Jan.stationLocked,true,'save-settings preserves the station lock');
 await lockGuard.context.close();


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
 await owner.page.locator('[data-settings-open="stations"]').click();
 assert.equal(await owner.page.locator('#stationManagerList > div').count(),6,'Station Manager starts with the six existing station definitions');
 const firstStation=owner.page.locator('#stationManagerList > div').nth(0);
 await firstStation.locator('input[aria-label="Station name"]').fill('Bay A');
 await owner.page.locator('#stationManagerList > div').nth(1).locator('input[type="checkbox"]').uncheck();
 await owner.page.locator('#addStationBtn').click();
 const newStation=owner.page.locator('#stationManagerList > div').nth(6);
 await newStation.locator('input[aria-label="Station name"]').fill('Station 7');
 await newStation.locator('input[aria-label="Station category"]').fill('GENERAL');
 await owner.page.locator('#saveStationsBtn').click();
 await owner.page.waitForFunction(()=>document.querySelector('#stationManagerStatus')?.textContent.includes('saved centrally'),{timeout:5000});
 const savedStations=owner.getBank().appData.stationConfig;
 assert.equal(savedStations.length,7,'adding a station is stored centrally');
 assert.equal(savedStations[0].name,'Bay A','renaming a station is stored centrally');
 assert.ok(savedStations[0].aliases.includes('Station 1 · WOOD'),'station rename retains its prior label alias');
 assert.equal(savedStations[1].active,false,'station deactivation is stored centrally without deleting its record');
 assert.equal(savedStations[6].name,'Station 7','the newly-added station is available centrally');
 await owner.page.locator('#settingsPanelStations [data-settings-back]').click();
 await owner.page.locator('[data-settings-open="staff"]').click();
 await owner.page.locator('.staff-settings-icon[aria-label="Staff settings for Jan"]').click();
 const stationOptionLabels=await owner.page.locator('#smStation option').allTextContents();
 assert.ok(stationOptionLabels.includes('Bay A · WOOD'),'STAFF profile choices display the renamed station label');
 assert.ok(stationOptionLabels.includes('Station 7 · GENERAL'),'STAFF profile choices include the newly-added active station');
 assert.equal(stationOptionLabels.includes('Station 2 · WOOD'),false,'STAFF assignment choices exclude a deactivated station');
 assert.equal(await owner.page.locator('#smStation').inputValue(),'Bay A · WOOD','an existing assignment resolves through the previous station label alias');
 await owner.page.locator('#smStation').selectOption('Station 7 · GENERAL');
 await owner.page.locator('#smSave').click();
 await owner.page.waitForFunction(()=>document.querySelector('#staffModalBackdrop')?.hidden===true,{timeout:5000});
 assert.equal(owner.getBank().staff.profiles.Jan.station,'Station 7 · GENERAL','STAFF station reassignment is confirmed in the central data bank');
 await owner.page.locator('#settingsPanelStaff [data-settings-back]').click();
 await owner.page.locator('[data-settings-open="stations"]').click();
 assert.equal(await owner.page.locator('#stationManagerList > div').count(),7,'saved station configuration is reloaded in Station Manager');
 await owner.page.locator('#settingsPanelStations [data-settings-back]').click();
 await mkdir(resolve('artifacts/settings-hub'),{recursive:true});
 const settingsGrid=owner.page.locator('.settings-card-grid');
 for(const [width,columns] of [[1280,3],[1000,2],[600,1]]){
  await owner.page.setViewportSize({width,height:900});
  const layout=await settingsGrid.evaluate(el=>{
   const cards=Array.from(el.querySelectorAll(':scope > [data-settings-open]'));
   const rects=Object.fromEntries(cards.map(card=>[card.dataset.settingsOpen,card.getBoundingClientRect()]));
   return {columns:getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length,count:cards.length,staffTop:rects.staff?.top,dailyTasksTop:rects.dailyTasks?.top};
  });
  assert.equal(layout.count,7,'all seven Settings cards are inside the grid at '+width+'px');
  assert.equal(layout.columns,columns,'Settings grid has '+columns+' columns at '+width+'px');
  if(width===1280)assert.ok(Math.abs(layout.staffTop-layout.dailyTasksTop)<2,'STAFF occupies the sixth grid position alongside the other cards');
  await owner.page.screenshot({path:resolve('artifacts/settings-hub/settings-'+width+'px.png')});
 }
 await owner.page.setViewportSize({width:1280,height:900});
 const accessRightsTile=owner.page.locator('[data-settings-open="accessRights"]');
 assert.equal(await accessRightsTile.isVisible(),true,'DEV root OWNER sees the dedicated ACCESS AND RIGHTS Settings destination');
 await accessRightsTile.click();
 assert.equal(await owner.page.locator('#settingsPanelAccessRights').isVisible(),true,'DEV opens the dedicated tier rights editor');
 assert.equal(await owner.page.locator('#accessRightsTierList [data-access-tier-card]').count(),7,'DEV can see Access & Rights cards for all seven tiers');
 assert.equal(await owner.page.locator('#accessRightsTierList [data-access-tier-card="OWNER"]').count(),1,'root OWNER has a dedicated tier card for Plant Power configuration');
 assert.equal(await owner.page.locator('#accessRightsTierList [data-access-tier-card="DEVACC"]').count(),1,'root-equivalent DEVACC has a dedicated tier card for Plant Power configuration');
 const ownerPlantPower=owner.page.locator('[data-access-tier="OWNER"][data-access-right="canControlPlantPower"]');
 const devaccPlantPower=owner.page.locator('[data-access-tier="DEVACC"][data-access-right="canControlPlantPower"]');
 assert.equal(await ownerPlantPower.isEnabled(),true,'OWNER Plant Power can be configured separately');
 assert.equal(await devaccPlantPower.isEnabled(),true,'DEVACC Plant Power can be configured separately');
 assert.equal(await owner.page.locator('[data-access-tier="OWNER"][data-access-right="canEditTracker"]').isDisabled(),true,'other root OWNER rights remain immutable');
 assert.equal(await owner.page.locator('[data-access-tier="DEVACC"][data-access-right="canManageUsers"]').isDisabled(),true,'other DEVACC root rights remain immutable');
 await ownerPlantPower.uncheck();
 await owner.page.locator('#saveAccessRights').click();
 await owner.page.waitForFunction(()=>document.querySelector('#accessRightsStatus')?.textContent.includes('saved centrally'),{timeout:5000});
 assert.equal(owner.getBank().tiers.OWNER.canControlPlantPower,false,'DEV can disable Plant Power for root OWNER');
 await ownerPlantPower.check();
 await devaccPlantPower.uncheck();
 await owner.page.locator('#saveAccessRights').click();
 await owner.page.waitForFunction(()=>document.querySelector('#accessRightsStatus')?.textContent.includes('saved centrally'),{timeout:5000});
 assert.equal(owner.getBank().tiers.OWNER.canControlPlantPower,true,'OWNER Plant Power can be re-enabled');
 assert.equal(owner.getBank().tiers.DEVACC.canControlPlantPower,false,'DEV can disable Plant Power for DEVACC');
 await devaccPlantPower.check();
 await owner.page.locator('#saveAccessRights').click();
 await owner.page.waitForFunction(()=>document.querySelector('#accessRightsStatus')?.textContent.includes('saved centrally'),{timeout:5000});
 assert.equal(owner.getBank().tiers.DEVACC.canControlPlantPower,true,'DEVACC Plant Power can be re-enabled');
 const userPlantPower=owner.page.locator('[data-access-tier="USER"][data-access-right="canControlPlantPower"]');
 const spectatorPlantPower=owner.page.locator('[data-access-tier="SPECTATOR"][data-access-right="canControlPlantPower"]');
 await userPlantPower.uncheck();
 await spectatorPlantPower.uncheck();
 await owner.page.locator('#saveAccessRights').click();
 await owner.page.waitForFunction(()=>document.querySelector('#accessRightsStatus')?.textContent.includes('saved centrally'),{timeout:5000});
 assert.equal(owner.getBank().tiers.USER.canControlPlantPower,false,'DEV can disable Plant Power for USER');
 assert.equal(owner.getBank().tiers.SPECTATOR.canControlPlantPower,false,'DEV can disable Plant Power for SPECTATOR');
 await userPlantPower.check();
 await spectatorPlantPower.check();
 await owner.page.locator('#saveAccessRights').click();
 await owner.page.waitForFunction(()=>document.querySelector('#accessRightsStatus')?.textContent.includes('saved centrally'),{timeout:5000});
 assert.equal(owner.getBank().tiers.USER.canControlPlantPower,true,'USER Plant Power can be re-enabled');
 assert.equal(owner.getBank().tiers.SPECTATOR.canControlPlantPower,true,'SPECTATOR Plant Power can be re-enabled');
 const adminDeleteRight=owner.page.locator('[data-access-tier="ADMIN"][data-access-right="canDeleteRecords"]');
 assert.equal(await adminDeleteRight.isChecked(),false,'ADMIN delete-record permission starts disabled');
 await adminDeleteRight.check();
 await owner.page.evaluate(()=>{
  const admin=document.querySelector('[data-access-tier-card="ADMIN"]'),manager=document.querySelector('[data-access-tier-card="MANAGER"]');
  admin.querySelectorAll('input[data-access-right]').forEach(source=>{const target=manager.querySelector('[data-access-right="'+source.dataset.accessRight+'"]');if(target)target.checked=source.checked});
 });
 await owner.page.locator('#saveAccessRights').click();
 await owner.page.waitForFunction(()=>document.querySelector('#accessRightsStatus')?.textContent.includes('saved centrally'),{timeout:5000});
 assert.equal(owner.getBank().tiers.ADMIN.canDeleteRecords,true,'DEV saves tier rights to central state');
 assert.equal(owner.getBank().tiers.MANAGER.canEditTracker,owner.getBank().tiers.ADMIN.canEditTracker,'MANAGER receives the same tracker-edit right as ADMIN');
 assert.deepEqual(owner.getBank().tiers.MANAGER,owner.getBank().tiers.ADMIN,'MANAGER permission profile exactly matches ADMIN');
 assert.ok(owner.actions.some(item=>item.action==='tiers-save'),'tier rights are saved through the central API');
 await owner.page.screenshot({path:resolve('artifacts/settings-hub/access-rights-1280px.png')});
 await owner.page.locator('#settingsPanelAccessRights [data-settings-back]').click();
 const nonJanAdmin=await openFor('ADMIN','2468','MICK');
 await signIn(nonJanAdmin.page,'2468','MICK');
 assert.equal(await nonJanAdmin.page.locator('#centralAdminNav').evaluate(el=>getComputedStyle(el).display!=='none'),false,'ADMIN tier cannot see the DEV-only Central Data Bank menu entry');
 await openSettingsHub(nonJanAdmin.page);
 assert.equal(await nonJanAdmin.page.locator('[data-settings-open="accessRights"]').isVisible().catch(()=>false),true,'delegated ADMIN can access the Access and Rights editor');
 await nonJanAdmin.page.locator('[data-settings-open="users"]').click();
 await nonJanAdmin.page.locator('#settingsPanelUsers').waitFor({state:'visible'});
 assert.equal(await nonJanAdmin.page.locator('#centralUsersManager').isVisible(),true,'ADMIN retains ordinary account-management access');
 await nonJanAdmin.context.close();
 const devaccBank=makeBank();
 devaccBank.users=[
  {username:'DEV',displayName:'DEV',tier:'OWNER',enabled:true},
  {username:'DEVacc',displayName:'DEVacc',tier:'DEVACC',enabled:true},
  {username:'Jan',displayName:'Jan',tier:'USER',enabled:true},
  {username:'MICK',displayName:'Mick',tier:'ADMIN',enabled:true}
 ];
 const devacc=await openFor('DEVACC','2468','DEVacc',devaccBank);
 await signIn(devacc.page,'2468','DEVacc');
 assert.equal(await devacc.page.locator('#centralAdminNav').evaluate(el=>getComputedStyle(el).display!=='none'),true,'DEVACC sees the root-equivalent Central Data Bank menu entry');
 await openSettingsHub(devacc.page);
 assert.equal(await devacc.page.locator('[data-settings-open="accessRights"]').isVisible().catch(()=>false),true,'DEVACC can open the root-equivalent Access and Rights editor');
 await devacc.page.locator('[data-settings-open="users"]').click();
 await devacc.page.locator('#settingsPanelUsers').waitFor({state:'visible'});
 assert.equal(await devacc.page.locator('#centralUsersManager').isVisible(),true,'DEVACC can manage accounts');
 assert.equal(await devacc.page.locator('#centralAccountTier').isDisabled(),false,'DEVACC can manage standard account tiers');
 assert.equal(await devacc.page.locator('#centralAccountTier option[value="DEVACC"]').isDisabled(),true,'DEVACC cannot assign the DEVACC tier');
 const devaccTarget=devacc.page.locator('#centralUsersManageList > div').filter({hasText:'DEVacc'});
 assert.ok(await devaccTarget.locator('button').count()>0,'DEVACC can edit, disable or remove DEVACC accounts');
 await devaccTarget.getByRole('button',{name:'EDIT'}).click();
 assert.equal(await devacc.page.locator('#centralAccountUsername').inputValue(),'DEVacc','DEVACC can open an existing DEVACC account for editing');
 assert.equal(await devacc.page.locator('#centralAccountTier').inputValue(),'DEVACC','editing preserves the existing DEVACC tier');
 assert.equal(await devacc.page.locator('#centralAccountTier option[value="DEVACC"]').isDisabled(),true,'the DEVACC tier remains unavailable for reassignment while editing');
 await devacc.page.locator('#centralAccountDisplay').fill('DEVacc Updated');
 await devacc.page.locator('#centralAccountSave').click();
 await devacc.page.waitForFunction(()=>document.querySelector('#centralUsersStatus')?.textContent.includes('Account updated.'),{timeout:5000});
 assert.equal(devacc.getBank().users.find(user=>user.username==='DEVacc')?.displayName,'DEVacc Updated','DEVACC can save changes to an existing DEVACC account without reassigning its tier');
 const forbiddenGrant=await devacc.page.evaluate(async version=>{
  try{await window.DowntimeCentral.saveUser({username:'DEVacc QA',displayName:'DEVacc QA',tier:'DEVACC',pin:'8642'},version);return null}
  catch(error){return {status:error.status,message:error.message}}
 },devacc.getVersion());
 assert.equal(forbiddenGrant?.status,403,'a direct DEVACC user-save request cannot grant a new DEVACC account');
 assert.match(forbiddenGrant?.message||'',/Only root DEV can assign DEVacc/,'the API denial identifies root DEV as the sole DEVACC grant authority');
 assert.equal(devacc.getBank().users.some(user=>user.username==='DEVacc QA'),false,'a denied DEVACC grant does not create an account');

 await devacc.context.close();
 const manager=await openFor('MANAGER','2468','MICK',owner.getBank(),owner.getVersion());
 await signIn(manager.page,'2468','MICK');
 assert.equal(await manager.page.locator('#centralAdminNav').evaluate(el=>getComputedStyle(el).display!=='none'),false,'MANAGER with ADMIN-equivalent configurable rights cannot see Central Data Bank');
 await openSettingsHub(manager.page);
 assert.equal(await manager.page.locator('[data-settings-open="accessRights"]').isVisible().catch(()=>false),false,'MANAGER never gains access to ADMIN/DEV-only Access and Rights');
 assert.equal(await manager.page.locator('[data-settings-open="areas"]').isVisible(),true,'MANAGER receives ADMIN-equivalent Settings access');
 await manager.page.locator('[data-settings-open="users"]').click();
 await manager.page.locator('#settingsPanelUsers').waitFor({state:'visible'});
 assert.equal(await manager.page.locator('#centralUsersAdminLink').count(),0,'legacy Central Data Bank shortcut is no longer embedded in the USERS panel');
 await manager.page.locator('#settingsPanelUsers [data-settings-back]').click();
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
 assert.equal(await manager.page.locator('#settingsPanelAreas').isVisible(),true,'MANAGER keeps the open Area Presets panel visible after edit permission is revoked');
 assert.equal(await manager.page.locator('#newAreaPreset').isDisabled(),true,'live central permission change revokes Settings edit controls without a new login');
 assert.equal(await manager.page.locator('#authGate').isVisible(),false,'live permission changes do not force a logout');
 await manager.page.locator('.nav[data-view="weekly"]').click();
 assert.equal(await manager.page.locator('#addEntry').isEnabled(),true,'MANAGER has the same tracker-edit control state as ADMIN');
 await manager.page.locator('#addEntry').click();
 await manager.page.locator('#entryModal').waitFor({state:'visible'});
 await manager.page.locator('#areaButtons [data-preset]').first().click();
 await manager.page.locator('#reasonButtons [data-preset]').first().click();
 await manager.page.locator('#durationMinutes').evaluate(input=>{input.value='5';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
 await manager.page.locator('#saveEntry').evaluate(button=>button.click());
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
 await clickOverview(owner.page);
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
 for(let alertAttempt=0;alertAttempt<6;alertAttempt++){
  const pendingAlert=owner.page.locator('#plantTransitionAlertHost button');
  if(!(await pendingAlert.count()))break;
  await pendingAlert.evaluate(button=>button.click());
  await owner.page.waitForTimeout(60);
 }
 await owner.page.waitForFunction(()=>!document.querySelector('#plantTransitionAlertHost'),{timeout:3000});
 await clickOverview(owner.page);
 assert.equal(await owner.page.locator('#overviewOverlay').isVisible(),true,'Overview can be reopened');
 assert.equal(await owner.page.locator('#overviewClose').count(),0,'Redundant top Overview header close control must be removed');
 assert.equal(await overview.locator('#overviewFullscreen').count(),0,'Plant Overview Full Screen control must be removed');
 await owner.page.keyboard.press('Escape');
 await owner.page.waitForFunction(()=>document.querySelector('#overviewOverlay')?.hidden===true,{timeout:3000});
 await clickOverview(owner.page);
 await owner.page.keyboard.press('Escape');
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
 await dismissPlantTransitionAlerts(owner.page);
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
 await owner.page.locator('#saveDailyTasks').click();
 for(let attempt=0;attempt<40&&!owner.getBank().appData.weeks[weekKey]?.days?.[0]?.dailyTasksLocked;attempt++)await owner.page.waitForTimeout(100);
 assert.equal(owner.getBank().appData.weeks[weekKey].days[0].dailyTasksLocked,true,'Save & Lock persists the locked flag centrally');
 assert.deepEqual(owner.getBank().appData.weeks[weekKey].days[0].dailyTasksSnapshot,['Check guards and safety covers','Inspect emergency stops'],'lock stores a snapshot of the checklist for that day');
 assert.equal(await owner.page.locator('#saveDailyTasks').isDisabled(),true,'locked checklist cannot be saved again');
 assert.equal(await owner.page.locator('[aria-label="Complete task: Inspect emergency stops"]').isDisabled(),true,'checkboxes are disabled after locking');
 await owner.page.locator('#closeDailyTasks').click();await owner.page.locator('#openDailyTasks').click();
 assert.equal(await owner.page.locator('#dailyTasksLockStatus').textContent(),'Saved and locked for today. This checklist cannot be changed.','lock persists after closing and reopening');
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
 assert.equal(owner.getVersion(),versionBeforeDailyTaskFlow+5,'daily task presets, two day-specific completions and the daily lock are versioned central writes');
 await owner.page.locator('#closeDailyTasks').click();

 // STAFF modal creation and locked station assignment immediately sync to the open Overview iframe.
 await openStaffSettings(owner.page);
 await owner.page.locator('#addStaffBtn').click();
 assert.equal(await owner.page.locator('#staffModalBackdrop').isVisible(),true,'Add New Member opens the modal');
  const mobileModalChecks=[];
  for(const viewport of [{width:320,height:800},{width:390,height:844}]){
    await owner.page.setViewportSize(viewport);
    mobileModalChecks.push(await owner.page.locator('.staff-modal').evaluate(el=>{const r=el.getBoundingClientRect(),footer=el.querySelector('.staff-modal-foot');return {left:r.left,right:r.right,viewport:innerWidth,footerWidth:footer.clientWidth,footerScroll:footer.scrollWidth}}));
  }
  for(const check of mobileModalChecks){assert.ok(check.left>=0&&check.right<=check.viewport,'STAFF modal fits '+check.viewport+'px viewport');assert.ok(check.footerScroll<=check.footerWidth+1,'STAFF modal action buttons wrap without horizontal overflow at '+check.viewport+'px')}
  await owner.page.setViewportSize({width:1280,height:900});
 assert.equal(await owner.page.locator('#smName').inputValue(),'','new STAFF profile template is blank');
 assert.equal(await owner.page.locator('#smOnPlant').isChecked(),true,'new profile defaults ON PLANT');
 await owner.page.locator('#smName').fill('Rita');
  const ritaGif=Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=','base64');
  await owner.page.locator('#smFile').setInputFiles({name:'rita.gif',mimeType:'image/gif',buffer:ritaGif});
  await owner.page.waitForFunction(()=>document.querySelector('#smPreview')?.src.startsWith('data:image/jpeg'),{timeout:5000});
  assert.equal(await owner.page.locator('#smPhotoSave').isHidden(),true,'new-member photo is committed with the new profile');
 await owner.page.locator('#smStation').selectOption('Station 6 · GENERAL');
 await owner.page.locator('#smOnPlant').uncheck();
 assert.equal(await owner.page.locator('#smStation').isEnabled(),true,'OFF PLANT does not disable station selection');
 await owner.page.locator('#smStation').selectOption('Station 5 · GENERAL');
 assert.equal(await owner.page.locator('#smStation').inputValue(),'Station 5 · GENERAL','OFF PLANT staff can choose a configured station');
 await owner.page.locator('#smOnPlant').check();
 await owner.page.locator('#smStation').selectOption('Station 6 · GENERAL');
 assert.equal(await owner.page.locator('#smStation').isEnabled(),true,'ON PLANT restores station selection when unlocked');
 await owner.page.locator('#smLock').check();
 assert.equal(await owner.page.locator('#smStation').isDisabled(),true,'locked station cannot be edited');
 await owner.page.locator('#smLock').uncheck();
 assert.equal(await owner.page.locator('#smStation').isEnabled(),true,'station can be changed after unlock');
 await owner.page.locator('#smStation').selectOption('Station 6 · GENERAL');
 await owner.page.locator('#smLock').check();
 await owner.page.locator('#smSave').click();
 await owner.page.waitForFunction(()=>document.querySelector('#staffModalBackdrop')?.hidden===true,{timeout:3000});
 for(let attempt=0;attempt<40&&(owner.getVersion()<versionBeforeDailyTaskFlow+6||!owner.getBank().staff.profiles.Rita?.stationLocked);attempt++)await owner.page.waitForTimeout(100);
 assert.equal(owner.getBank().staff.profiles.Rita.station,'Station 6 · GENERAL','new staff member and station save centrally');
 assert.equal(owner.getBank().staff.profiles.Rita.stationLocked,true,'station lock persists centrally');
  assert.equal(owner.getBank().staff.profiles.Rita.photo?.startsWith('data:image/jpeg'),true,'new-member thumbnail is saved centrally');
  assert.equal(typeof owner.getBank().staff.profiles.Rita.photoPath,'string','new-member original photo is stored centrally');
  assert.ok(owner.getBank().staff.profiles.Rita.photoPath.startsWith('rita/'),'photo object path is associated with the new profile');
  assert.equal(await owner.page.evaluate(()=>window.__staffPhotoUploads?.length||0),1,'new-member original image is uploaded to private staff storage');
  assert.equal(await owner.page.evaluate(()=>window.__staffPhotoUploads?.[0]?.bucket),'downtime-staff-photos','original photo is uploaded to the private staff photo bucket');
 assert.equal(owner.getVersion(),versionBeforeDailyTaskFlow+6,'daily tasks, completions, lock and one staff save advance central version');
 // STAFF profile administration lives in Settings; return to Home Page before exercising its Day to Day control.
 const homePageNav=owner.page.locator('.nav[data-view="weekly"]');
 if(!await homePageNav.isVisible()){
  await owner.page.locator('.nav-menu > summary').click();
  await homePageNav.waitFor({state:'visible',timeout:3000});
 }
 await dismissPlantTransitionAlerts(owner.page);
 await homePageNav.click();
 await owner.page.locator('#weekly.view.active').waitFor({state:'visible',timeout:3000});
 // Crew Switchboard exposes only locked, assigned STAFF and saves ON/OFF PLANT to the Central Data Bank.
const crewMenu=owner.page.locator('.nav-menu');
 if(!await crewMenu.evaluate(node=>node.open))await crewMenu.locator(':scope > summary').click();
 await owner.page.locator('.nav[data-view="weekly"]').click();
 await owner.page.waitForFunction(()=>document.querySelector('#weekly')?.classList.contains('active'),{timeout:3000});
 await owner.page.locator('#crewSwitchboardBtn').waitFor({state:'visible',timeout:3000});
 await owner.page.locator('#crewSwitchboardBtn').click();
 await owner.page.locator('#crewSwitchboardBackdrop').waitFor({state:'visible',timeout:3000});
 assert.equal(await owner.page.locator('.crew-switchboard-row').count(),1,'only STAFF with a locked station appear in Crew Switchboard');
 const ritaCrewRow=owner.page.locator('.crew-switchboard-row[data-crew-name="Rita"]');
 assert.equal(await ritaCrewRow.locator('img').getAttribute('alt'),'Rita photo','Crew Switchboard displays the STAFF photo');
 assert.equal(await ritaCrewRow.locator('.crew-switchboard-person strong').textContent(),'Rita','Crew Switchboard displays the STAFF name');
 assert.equal(await ritaCrewRow.locator('.crew-switchboard-person span').textContent(),'Station 6 · GENERAL','Crew Switchboard displays the locked station');
 assert.equal(await ritaCrewRow.locator('.crew-switch-toggle').getAttribute('aria-checked'),'true','new locked STAFF starts ON PLANT');
 const crewVersion=owner.getVersion();
 await ritaCrewRow.locator('.crew-switch-toggle').click();
 for(let attempt=0;attempt<40&&owner.getVersion()<crewVersion+1;attempt++)await owner.page.waitForTimeout(100);
 assert.equal(owner.getBank().staff.profiles.Rita.onSite,false,'OFF PLANT toggle is saved centrally');
 assert.equal(owner.getBank().staff.profiles.Rita.station,'Station 6 · GENERAL','OFF PLANT toggle preserves the assigned station');
 assert.equal(owner.getBank().staff.profiles.Rita.stationLocked,true,'OFF PLANT toggle preserves the permanent station lock');
 assert.equal(await owner.page.locator('#crewSwitchboardCount').textContent(),'0/1 STAFF ON PLANT','crew count updates after an OFF PLANT save');
 await ritaCrewRow.locator('.crew-switch-toggle').click();
 for(let attempt=0;attempt<40&&owner.getVersion()<crewVersion+2;attempt++)await owner.page.waitForTimeout(100);
 assert.equal(owner.getBank().staff.profiles.Rita.onSite,true,'ON PLANT toggle is saved centrally');
 assert.equal(owner.getBank().staff.profiles.Rita.stationLocked,true,'ON PLANT toggle preserves the permanent station lock');
 assert.equal(await owner.page.locator('#crewSwitchboardCount').textContent(),'1/1 STAFF ON PLANT','crew count updates after an ON PLANT save');
 await owner.page.locator('#crewSwitchboardClose').click();
 await owner.page.locator('#crewSwitchboardBackdrop').waitFor({state:'hidden',timeout:3000});
 assert.equal(owner.getVersion(),crewVersion+2,'Crew Switchboard ON/OFF changes each advance Central Data Bank version');
 await clickOverview(owner.page);
 const ritaCard=owner.page.frameLocator('#overviewFrame').locator('[data-opprofile="RITA"]');
 await ritaCard.waitFor({state:'visible',timeout:3000});
 assert.equal(await ritaCard.locator('.name').textContent(),'RITA','new STAFF card is created dynamically');
 assert.equal(await ritaCard.locator('.station').textContent(),'Station 6 · GENERAL','Overview immediately shows the assigned station');
 assert.equal(await owner.page.frameLocator('#overviewFrame').locator('[data-stationassigned="6"]').textContent(),'RITA','station blueprint updates immediately');

 
  await owner.page.frameLocator('#overviewFrame').locator('#exitOverview').click();
  await owner.page.waitForFunction(()=>document.querySelector('#overviewOverlay')?.hidden===true,{timeout:3000});
  await openStaffSettings(owner.page);
  await owner.page.locator('.staff-settings-icon[aria-label="Staff settings for Rita"]').click();
  assert.equal(await owner.page.locator('#smStation').isDisabled(),true,'locked station is disabled when profile reopens');
  await owner.page.locator('#smLock').uncheck();
  assert.equal(await owner.page.locator('#smStation').isEnabled(),true,'manual unlock in Staff Settings enables reassignment');
  await owner.page.locator('#smOnPlant').uncheck();
  assert.equal(await owner.page.locator('#smStation').isEnabled(),true,'OFF PLANT profile keeps the station picker available after unlock');
  await owner.page.locator('#smStation').selectOption('Station 5 · GENERAL');
  await owner.page.locator('#smSave').click();
  await owner.page.waitForFunction(()=>document.querySelector('#staffModalBackdrop')?.hidden===true,{timeout:3000});
  for(let attempt=0;attempt<40&&(owner.getBank().staff.profiles.Rita?.station!=='Station 5 · GENERAL'||owner.getBank().staff.profiles.Rita?.onSite!==false);attempt++)await owner.page.waitForTimeout(100);
  assert.equal(owner.getBank().staff.profiles.Rita.station,'Station 5 · GENERAL','OFF PLANT retains assigned station');
  assert.equal(owner.getBank().staff.profiles.Rita.onSite,false,'OFF PLANT status persists centrally');
  assert.equal(owner.getBank().staff.profiles.Rita.stationLocked,false,'manual unlock persists');
    await owner.page.locator('.staff-settings-icon[aria-label="Staff settings for Rita"]').click();
  await owner.page.locator('#smOnPlant').check();
  await owner.page.locator('#smSave').click();
  await owner.page.waitForFunction(()=>document.querySelector('#staffModalBackdrop')?.hidden===true,{timeout:3000});
  for(let attempt=0;attempt<40&&owner.getBank().staff.profiles.Rita?.onSite!==true;attempt++)await owner.page.waitForTimeout(100);
  assert.equal(owner.getBank().staff.profiles.Rita.onSite,true,'ON PLANT status can be restored');
// Once explicitly unlocked, another device can reassign Rita; Realtime refreshes the Overview.
  await clickOverview(owner.page);
  const unlockedRita=owner.page.frameLocator('#overviewFrame').locator('[data-opprofile="RITA"]');
  await unlockedRita.waitFor({state:'visible',timeout:3000});
  assert.equal(await unlockedRita.locator('.station').textContent(),'Station 5 · GENERAL','unlocked station assignment appears in Overview');
  owner.getBank().staff.profiles.Rita.station='Station 6 · GENERAL';
  owner.getBank().appData.operatorProfiles.Rita.station='Station 6 · GENERAL';
  const externalVersion=owner.getVersion()+1;
  owner.setVersion(externalVersion);
  await owner.page.evaluate(version=>window.__downtimeEmitBroadcast({payload:{version,updated_at:new Date().toISOString()}}),externalVersion);
  await owner.page.waitForFunction(()=>document.querySelector('#overviewFrame')?.contentWindow?.document?.querySelector('[data-opprofile="RITA"] .station')?.textContent==='Station 6 · GENERAL',{timeout:3000});
  assert.equal(await owner.page.frameLocator('#overviewFrame').locator('[data-stationassigned="6"]').textContent(),'RITA','remote assignment to an unlocked member propagates live');
  assert.equal(await owner.page.frameLocator('#overviewFrame').locator('[data-stationassigned="5"]').textContent(),'SHAYNE','previous station is cleared after unlocked reassignment');
  await owner.page.frameLocator('#overviewFrame').locator('#exitOverview').click();
  await owner.page.waitForFunction(()=>document.querySelector('#overviewOverlay')?.hidden===true,{timeout:3000});
  await owner.page.locator('.staff-settings-icon[aria-label="Staff settings for Rita"]').click();
  owner.page.once('dialog',dialog=>dialog.accept());
  await owner.page.locator('#smPhotoRemove').click();
  for(let attempt=0;attempt<40&&!owner.getPhotoRemovals().some(x=>x.path?.startsWith('rita/'));attempt++)await owner.page.waitForTimeout(100);
  assert.ok(owner.getPhotoRemovals().some(x=>x.path?.startsWith('rita/')),'REMOVE PHOTO requests secure deletion of the original storage object');
  for(let attempt=0;attempt<40&&owner.getBank().staff.profiles.Rita?.photoPath;attempt++)await owner.page.waitForTimeout(100);
  assert.equal(owner.getBank().staff.profiles.Rita.photo,undefined,'REMOVE PHOTO clears thumbnail metadata');
  assert.equal(owner.getBank().staff.profiles.Rita.photoPath,undefined,'REMOVE PHOTO clears original photo path');
  const localOriginalAfterRemove=await owner.page.evaluate(async name=>{const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('downtime-operator-originals',1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});return await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readonly'),req=tx.objectStore('photos').get(name);req.onsuccess=()=>{db.close();resolve(!!req.result)};req.onerror=()=>{db.close();reject(req.error)}})},'Rita');
  assert.equal(localOriginalAfterRemove,false,'REMOVE PHOTO deletes the local IndexedDB original as well as the private storage object');
  await owner.page.waitForFunction(()=>document.querySelector('#smMsg')?.textContent.includes('Photo removed.'),{timeout:5000});
  assert.equal(await owner.page.locator('#staffModalBackdrop').isVisible(),true,'photo removal finishes and refreshes the open profile');
  assert.equal(await owner.page.locator('#smPhotoRemove').isHidden(),true,'removed photo cannot be removed again');
  // Existing-profile SAVE PHOTO must upload and persist a replacement original and thumbnail.
  const replacementGif=Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=','base64');
  await owner.page.locator('#smFile').setInputFiles({name:'rita-replacement.gif',mimeType:'image/gif',buffer:replacementGif});
  await owner.page.waitForFunction(()=>document.querySelector('#smPreview')?.src.startsWith('data:image/jpeg'),{timeout:5000});
  await owner.page.locator('#smPhotoSave').click();
  await owner.page.waitForFunction(()=>['Photo saved.','Original photo uploaded to GitHub and profile saved.'].includes(document.querySelector('#smMsg')?.textContent),{timeout:5000});
  assert.ok(owner.getBank().staff.profiles.Rita.photo?.startsWith('data:image/jpeg'),'existing profile SAVE PHOTO stores replacement thumbnail');
  assert.ok(owner.getBank().staff.profiles.Rita.photoPath?.startsWith('rita/'),'existing profile SAVE PHOTO stores original photo path');
  assert.equal(await owner.page.evaluate(()=>window.__staffPhotoUploads?.length||0),2,'existing profile replacement uploads a second original photo');
  owner.page.once('dialog',dialog=>dialog.accept());
  await owner.page.locator('#smPhotoRemove').click();
  for(let attempt=0;attempt<40&&owner.getBank().staff.profiles.Rita?.photoPath;attempt++)await owner.page.waitForTimeout(100);
  assert.equal(owner.getBank().staff.profiles.Rita.photoPath,undefined,'replacement original can also be removed');
  await owner.page.locator('#smCancel').click();
  await owner.page.waitForFunction(()=>document.querySelector('#staffModalBackdrop')?.hidden===true,{timeout:3000});
 await owner.page.locator('#backToYardHub').click();
 assert.equal(await owner.page.locator('#yardHub').isVisible(),true,'YARD HUB is available before sign-out');
 await owner.page.locator('#yardHubLogoutBtn').click();
 await owner.page.waitForFunction(()=>document.querySelector('#authGate').style.display!=='none');
 await owner.page.waitForFunction(()=>document.querySelector('#centralUsername')?.options.length>1,{timeout:5000});
 assert.equal(await owner.page.locator('#centralAdminNav').evaluate(el=>getComputedStyle(el).display==='none'),true,'Central Data Bank entry is hidden immediately after logout');
 assert.equal(await owner.page.locator('#authGate h2').textContent(),'DOWNTIME · CENTRAL LOGIN','Log Out returns OWNER to the central USER login screen');
 assert.ok(owner.actions.some(x=>x.action==='logout'),'Log Out calls the central logout endpoint');
 await owner.context.close();

 // USER is fully informed but cannot edit or submit anything.
 const user=await openFor('USER','2468');
 await signIn(user.page);
 assert.equal(await user.page.locator('#centralAdminNav').evaluate(el=>getComputedStyle(el).display!=='none'),false,'USER cannot see the Central Data Bank menu entry');

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

 // SUPERVISOR can manage STAFF and assignments but not USERS or general Settings presets.
  const supervisor=await openFor('SUPERVISOR','2468');
  await signIn(supervisor.page);
  assert.equal(await supervisor.page.locator('#centralAdminNav').evaluate(el=>getComputedStyle(el).display!=='none'),false,'SUPERVISOR staff-management permission does not grant Central Data Bank access');
  await supervisor.page.locator('.nav-menu > summary').click();
  assert.equal(await supervisor.page.locator('#addEntry').isDisabled(),false,'SUPERVISOR can edit tracker');
  assert.equal(await supervisor.page.locator('#newStaffName').count(),0,'legacy inline add field is removed');
  await openStaffSettings(supervisor.page);
 assert.equal(await supervisor.page.locator('[data-settings-open="stations"]').isVisible().catch(()=>false),false,'SUPERVISOR assignment permission does not expose Station Manager');

  assert.equal(await supervisor.page.locator('#addStaffBtn').isEnabled(),true,'SUPERVISOR can manage STAFF');
  assert.equal(await supervisor.page.locator('[data-settings-open="dailyTasks"]').isVisible(),false,'SUPERVISOR cannot manage general Settings presets');
  await supervisor.page.locator('#addStaffBtn').click();
  assert.equal(await supervisor.page.locator('#smName').inputValue(),'','SUPERVISOR gets the blank Add New Member template');
  await supervisor.page.locator('#smName').fill('Supervisor QA');
  await supervisor.page.locator('#smStation').selectOption('Station 4 · SCRAP');
  await supervisor.page.locator('#smLock').check();
  await supervisor.page.locator('#smSave').click();
  await supervisor.page.waitForFunction(()=>document.querySelector('#staffModalBackdrop')?.hidden===true,{timeout:3000});
  assert.ok(supervisor.getBank().staff.roster.includes('Supervisor QA'),'SUPERVISOR changes sync to central roster');
  assert.equal(supervisor.getBank().staff.profiles['Supervisor QA'].station,'Station 4 · SCRAP','SUPERVISOR can assign station in profile modal');
  assert.equal(supervisor.getBank().staff.profiles['Supervisor QA'].stationLocked,true,'SUPERVISOR can lock station in Staff Settings');
  const userCountBeforeStaffRemoval=supervisor.getBank().users.length;
  await supervisor.page.locator('.staff-settings-icon[aria-label="Staff settings for Supervisor QA"]').click();
  supervisor.page.once('dialog',dialog=>dialog.accept());
  await supervisor.page.locator('#smRemove').click();
  await supervisor.page.waitForFunction(()=>document.querySelector('#staffModalBackdrop')?.hidden===true,{timeout:3000});
  assert.equal(supervisor.getBank().staff.roster.includes('Supervisor QA'),false,'REMOVE STAFF removes the member from the central roster');
  assert.equal(supervisor.getBank().staff.profiles['Supervisor QA'],undefined,'REMOVE STAFF removes the central staff profile');
  assert.equal(supervisor.getBank().users.length,userCountBeforeStaffRemoval,'REMOVE STAFF does not delete or alter USER accounts');
  await supervisor.context.close();
 // Separate permission tiers: STAFF-only manages identity/presence/photos, not station/lock.
 const staffOnly=await openFor('STAFF_ONLY','2468','MICK');
 await signIn(staffOnly.page,'2468','MICK');
 await openStaffSettings(staffOnly.page);
 assert.equal(await staffOnly.page.locator('#addStaffBtn').isEnabled(),true,'STAFF-only tier can add members');
 await staffOnly.page.locator('.staff-settings-icon[aria-label="Staff settings for Jan"]').click();
 assert.equal(await staffOnly.page.locator('#smStation').isDisabled(),true,'STAFF-only tier cannot assign stations');
 assert.equal(await staffOnly.page.locator('#smLock').isDisabled(),true,'STAFF-only tier cannot change station lock');
 assert.equal(await staffOnly.page.locator('#smOnPlant').isEnabled(),true,'STAFF-only tier can change plant availability');
 assert.equal(await staffOnly.page.locator('#smFile').isEnabled(),true,'STAFF-only tier can manage profile photo');
 await staffOnly.page.locator('#smOnPlant').uncheck();
 await staffOnly.page.locator('#smSave').click();
 await staffOnly.page.waitForFunction(()=>document.querySelector('#staffModalBackdrop')?.hidden===true,{timeout:3000});
 for(let attempt=0;attempt<40&&staffOnly.getBank().staff.profiles.Jan?.onSite!==false;attempt++)await staffOnly.page.waitForTimeout(100);
 assert.equal(staffOnly.getBank().staff.profiles.Jan.station,'Station 1 · WOOD','STAFF-only save preserves station assignment');
 assert.equal(staffOnly.getBank().staff.profiles.Jan.onSite,false,'STAFF-only save updates ON/OFF PLANT');
 assert.equal(staffOnly.getBank().staff.profiles.Jan.stationLocked,undefined,'STAFF-only save cannot create station lock metadata');
 await staffOnly.context.close();

 // ASSIGNMENT-only can change a station and lock it, but cannot edit photo or plant availability.
 const assignmentOnly=await openFor('ASSIGNMENT_ONLY','2468','MICK');
 await signIn(assignmentOnly.page,'2468','MICK');
 await openStaffSettings(assignmentOnly.page);
 assert.equal(await assignmentOnly.page.locator('#addStaffBtn').isDisabled(),true,'ASSIGNMENT-only tier cannot create STAFF members');
 await assignmentOnly.page.locator('.staff-settings-icon[aria-label="Staff settings for Jan"]').click();
 assert.equal(await assignmentOnly.page.locator('#smName').isDisabled(),true,'ASSIGNMENT-only tier cannot edit staff identity');
 assert.equal(await assignmentOnly.page.locator('#smStation').isEnabled(),true,'ASSIGNMENT-only tier can assign station');
 assert.equal(await assignmentOnly.page.locator('#smLock').isEnabled(),true,'ASSIGNMENT-only tier can lock station');
 assert.equal(await assignmentOnly.page.locator('#smOnPlant').isDisabled(),true,'ASSIGNMENT-only tier cannot change plant availability');
 assert.equal(await assignmentOnly.page.locator('#smFile').isDisabled(),true,'ASSIGNMENT-only tier cannot upload profile photo');
 await assignmentOnly.page.locator('#smStation').selectOption('Station 6 · GENERAL');
 await assignmentOnly.page.locator('#smLock').check();
 await assignmentOnly.page.locator('#smSave').click();
 await assignmentOnly.page.waitForFunction(()=>document.querySelector('#staffModalBackdrop')?.hidden===true,{timeout:3000});
 for(let attempt=0;attempt<40&&assignmentOnly.getBank().staff.profiles.Jan?.stationLocked!==true;attempt++)await assignmentOnly.page.waitForTimeout(100);
 assert.equal(assignmentOnly.getBank().staff.profiles.Jan.station,'Station 6 · GENERAL','ASSIGNMENT-only tier saves station');
 assert.equal(assignmentOnly.getBank().staff.profiles.Jan.stationLocked,true,'ASSIGNMENT-only tier saves station lock');
 assert.equal(assignmentOnly.getBank().staff.profiles.Jan.onSite,true,'ASSIGNMENT-only tier preserves plant presence');
 await assignmentOnly.context.close();



 // Failed central STAFF saves must leave the existing assignment unchanged and keep the modal open.
 const failedSave=await openFor('ASSIGNMENT_ONLY','2468','MICK');
 await signIn(failedSave.page,'2468','MICK');
 await openStaffSettings(failedSave.page);
 await failedSave.page.locator('.staff-settings-icon[aria-label="Staff settings for Jan"]').click();
 await failedSave.page.locator('#smStation').selectOption('Station 6 · GENERAL');
 failedSave.failNextSettingsSave();
 await failedSave.page.locator('#smSave').click();
 await failedSave.page.waitForFunction(()=>document.querySelector('#smMsg')?.textContent.includes('Save failed'),{timeout:5000});
 assert.equal(await failedSave.page.locator('#staffModalBackdrop').isVisible(),true,'STAFF profile modal remains open after a rejected central save');
 assert.equal(failedSave.getBank().staff.profiles.Jan.station,'Station 1 · WOOD','failed central save does not change the server assignment');
 assert.equal(await failedSave.page.locator('#smStation').inputValue(),'Station 1 · WOOD','failed central save rolls back the local selection');
 await failedSave.context.close();

// SPECTATOR receives no staff/assignment/dashboard/report surfaces.
 const spectator=await openFor('SPECTATOR','2468','WATCHER');
 await signIn(spectator.page,'2468','WATCHER');
 assert.equal(await spectator.page.locator('#centralAdminNav').evaluate(el=>getComputedStyle(el).display!=='none'),false,'SPECTATOR cannot see the Central Data Bank menu entry');
 assert.equal(await spectator.page.locator('#plantOperatorToggle').isVisible(),true,'SPECTATOR sees Plant Power when its tier checkbox is enabled');
 await spectator.page.locator('#plantOperatorToggle').click();
 await spectator.page.waitForFunction(()=>document.querySelector('#plantOperatorToggle')?.textContent==='PLANT OFF · RED',{timeout:5000});
 assert.equal(spectator.getBank().appData.plantOn,false,'SPECTATOR can operate Plant Power independently of dashboard and tracker-edit permissions');
 await dismissPlantTransitionAlerts(spectator.page);
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
 console.log('PASS: Station Manager add, rename, deactivate, central persistence, alias migration and STAFF assignment workflow');
 console.log('PASS: failed STAFF save rollback and Station Manager permission separation');
 console.log('PASS: central username/PIN authentication and invalid PIN rejection');
 console.log('PASS: central save-state writes use versioned compare-and-swap');
 console.log('PASS: OWNER and SUPERVISOR edit restrictions');
 console.log('PASS: USER sees all operational data in read-only mode');
 console.log('PASS: SPECTATOR restrictions hide staff, assignments, reports and dashboards');
}finally{
 await browser.close();
 await new Promise(ok=>server.close(ok));
}
