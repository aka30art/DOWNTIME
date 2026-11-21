import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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
 return {appData:{weeks:{},areas:['Feeder'],reasons:['Blockage'],archive:[],plantOn:true,dailyTaskPresets:[]},users:[],tiers,staff:{roster:Object.keys(profiles),profiles},statsSource:{weeks:{}}};
}
async function openFor(tier,pin='2468'){
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
   removeChannel:async()=>({status:'ok'})
  })};
 });
 let bank=makeBank(),version=1,token='central-session-'+tier;
 const actions=[];
 await context.route('https://ygwfipksbbprqynvbklk.supabase.co/functions/v1/central-bank',async route=>{
  const req=route.request().postDataJSON(),action=req.action;
  actions.push({action,body:req});
  const ok=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(action==='list-users')return ok({users:[{username:'JAN',displayName:'Jan',tier},{username:'MICK',displayName:'Mick',tier:'USER'}]});
  if(action==='login'){
   if(req.username!=='JAN'||req.pin!==pin)return ok({error:'Invalid username or PIN'},401);
   return ok({token,expiresAt:new Date(Date.now()+3600000).toISOString(),user:{username:'JAN',displayName:'Jan',tier}});
  }
  if(action==='get-state'){
   const copy=JSON.parse(JSON.stringify(bank));
   if(tier==='SPECTATOR'){
    copy.staff={roster:[],profiles:{}};
    delete copy.appData.operatorProfiles;
    delete copy.appData.archive;
   }
   return ok({payload:copy,user:{username:'JAN',displayName:'Jan',tier},version,updatedAt:new Date().toISOString()});
  }
  if(action==='save-state'){
   if(!tiers[tier].canEditTracker)return ok({error:'Permission denied'},403);
   if(Number(req.version)!==version)return ok({error:'Version conflict; refresh before saving'},409);
   bank.appData=req.appData;
   if(tiers[tier].canManageStaff){bank.staff.profiles=req.appData.operatorProfiles||bank.staff.profiles;bank.staff.roster=req.appData.staffRoster||bank.staff.roster}
   version++;
   return ok({version,updatedAt:new Date().toISOString()});
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
async function signIn(page,pin='2468'){
 await page.locator('#centralUsername').selectOption('JAN');
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
 assert.equal(await owner.page.locator('.nav[data-view="staff"]').count(),0,'STAFF is no longer a standalone navigation item');
 assert.equal(await owner.page.locator('.nav[data-view="settings"]').isVisible(),true,'OWNER can open Settings');
 await openStaffSettings(owner.page);
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
 for(let i=0;i<30&&!owner.actions.some(x=>x.action==='save-state');i++)await owner.page.waitForTimeout(100);
 assert.ok(owner.actions.some(x=>x.action==='save-state'),'tracker changes must write through central save-state API');
 assert.ok(owner.getBank().appData.areas.includes('Central Sync Test'),'central bank mock should retain the edited tracker setting');
 assert.equal(owner.getVersion(),3,'plant status and tracker edits must each advance the compare-and-swap version');

 // Daily Tasks are preset in Settings, then checked independently for each operating day.
 await owner.page.locator('[data-settings-back]').click();
 await owner.page.locator('[data-settings-open="dailyTasks"]').click();
 await owner.page.locator('#dailyTaskPresetInput').fill('Check guards and safety covers');
 await owner.page.locator('#addDailyTaskPresetBtn').click();
 await owner.page.locator('#dailyTaskPresetInput').fill('Inspect emergency stops');
 await owner.page.locator('#addDailyTaskPresetBtn').click();
 for(let attempt=0;attempt<40&&owner.getBank().appData.dailyTaskPresets?.length!==2;attempt++)await owner.page.waitForTimeout(100);
 assert.deepEqual(owner.getBank().appData.dailyTaskPresets,['Check guards and safety covers','Inspect emergency stops'],'daily task presets sync to the central bank');
 const ownerMenu=owner.page.locator('.nav-menu');
 if(!await ownerMenu.evaluate(node=>node.open))await ownerMenu.locator(':scope > summary').click();
 await owner.page.locator('.nav[data-view="weekly"]').click();
 const daySetup=owner.page.locator('.day-setup');
 if(!await daySetup.evaluate(node=>node.open))await daySetup.locator(':scope > summary').click();
 await owner.page.locator('#openDailyTasks').click();
 assert.equal(await owner.page.locator('#dailyTasksModal').isVisible(),true,'clipboard opens the Daily Tasks popup');
 assert.equal(await owner.page.locator('#dailyTasksList input[type="checkbox"]').count(),2,'popup displays all preset tasks');
 await owner.page.locator('[aria-label="Complete task: Check guards and safety covers"]').check();
 for(let attempt=0;attempt<40&&!owner.getBank().appData.weeks[Object.keys(owner.getBank().appData.weeks)[0]]?.days?.[0]?.dailyTasksDone?.includes('Check guards and safety covers');attempt++)await owner.page.waitForTimeout(100);
 const weekKey=Object.keys(owner.getBank().appData.weeks)[0];
 assert.ok(owner.getBank().appData.weeks[weekKey].days[0].dailyTasksDone.includes('Check guards and safety covers'),'Monday task completion is written centrally');
 assert.equal(owner.getBank().appData.weeks[weekKey].days[0].dailyTasksDone.includes('Inspect emergency stops'),false,'unchecked Monday tasks remain incomplete');
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
 assert.equal(owner.getVersion(),7,'daily task presets and two day-specific completions are versioned central writes');
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
 assert.equal(owner.getVersion(),9,'daily task presets, day completions and STAFF operations all advance central version');
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
