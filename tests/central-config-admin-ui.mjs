import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const file=fileURLToPath(new URL('../central-bank-admin.html',import.meta.url));
let draft={
 schemaVersion:1,
 organization:{companyName:'',siteCode:'',timezone:'Europe/London',locale:'en-GB'},
 structure:{sites:[],plants:[],areas:[],stations:[]},
 libraries:{areaPresets:['Line 1'],downtimeReasons:['Mechanical failure'],dailyTaskPresets:['Check guards'],equipmentCategories:[],eventCategories:[],statusCategories:['Running','Stopped']},
 defaults:{shiftSchedule:{MONDAY:{start:'06:30',stop:'17:00'}},shiftPresets:[],weekStartsOn:'MONDAY',operatingDays:['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'],breakDeductionMinutes:75}
};
let draftVersion=1,publishedVersion=1,nextVersion=2,activeTestUser='ADMIN';
let versions=[{version:1,parent_version:null,action:'initial',actor:'SYSTEM',note:'Initial baseline',created_at:new Date().toISOString(),published_at:new Date().toISOString(),status:'PUBLISHED'}];
const calls=[];
function state(user={username:'ADMIN',displayName:'Admin',tier:'ADMIN'}){
 return {draft,published:draftVersion===publishedVersion?draft:publishedVersion===1?draft:{...draft,organization:{...draft.organization,companyName:'published'}},draftVersion,publishedVersion,nextVersion,updatedBy:'ADMIN',updatedAt:new Date().toISOString(),publishedBy:'ADMIN',publishedAt:new Date().toISOString(),versions,user};
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
 await page.route('https://ygwfipksbbprqynvbklk.supabase.co/functions/v1/central-bank',async route=>{
  const request=route.request();
  if(request.method()==='OPTIONS'){
   await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type, apikey, x-downtime-session'}});return;
  }
  const body=request.postDataJSON();calls.push(body.action);
  if(body.action==='login'){
   await route.fulfill({json:{token:'test-session-token',expiresAt:new Date(Date.now()+3600000).toISOString(),user:{username:body.username,displayName:body.username,tier:body.username.toUpperCase()==='MANAGER'?'MANAGER':'ADMIN'}}});return;
  }
  if(body.action==='logout'){await route.fulfill({json:{ok:true}});return;}
  if(body.action==='central-config-state'){
   const user=activeTestUser==='MANAGER'?{username:'MANAGER',displayName:'Manager',tier:'MANAGER'}:{username:'ADMIN',displayName:'Admin',tier:'ADMIN'};
   if(user.tier!=='ADMIN'){await route.fulfill({status:403,json:{error:'Central configuration access is restricted to ADMIN and JAN.'}});return;}
   await route.fulfill({json:state(user)});return;
  }
  if(body.action==='central-config-save-draft'){
   if(body.draftVersion!==draftVersion||body.nextVersion!==nextVersion){await route.fulfill({status:409,json:{error:'Draft changed in another session.'}});return;}
   draft=body.config;draftVersion=nextVersion;nextVersion++;
   versions.unshift({version:draftVersion,parent_version:draftVersion-1,action:'draft-save',actor:'ADMIN',note:body.note,created_at:new Date().toISOString(),published_at:null,status:'CURRENT DRAFT'});
   await route.fulfill({json:{ok:true,draftVersion,nextVersion}});return;
  }
  if(body.action==='central-config-publish'){
   if(body.draftVersion!==draftVersion||body.publishedVersion!==publishedVersion||draftVersion===publishedVersion){await route.fulfill({status:409,json:{error:'Publish conflict.'}});return;}
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
 await page.goto('http://127.0.0.1:'+address.port+'/central-bank-admin.html');
 assert.equal(await page.locator('#workspace').isVisible(),false,'workspace starts inaccessible before authentication');
 await page.locator('#username').fill('ADMIN');
 await page.locator('#pin').fill('1234');
 await page.locator('#loginBtn').click();
 await page.locator('#view-overview').waitFor({state:'visible'});
 assert.equal(await page.locator('#publishedKpi').textContent(),'v1');
 assert.equal(await page.locator('#draftKpi').textContent(),'v1');
 assert.ok(await page.locator('text=Access & Rights stays separate').count(),'separate responsibilities are explained');

 await page.locator('[data-section="organisation"]').click();
 await page.locator('#companyName').fill('QA Example Company');
 await page.locator('#saveDraftBtn').click();
 await page.getByText('Draft saved as version v2.',{exact:false}).waitFor();
 assert.equal(await page.locator('#draftKpi').textContent(),'v2','saved draft increments only the draft version');
 assert.equal(await page.locator('#publishedKpi').textContent(),'v1','saving a draft does not publish it');
 assert.equal(await page.locator('#publishBtn').isEnabled(),true,'saved draft can be explicitly published');

 page.on('dialog',dialog=>dialog.accept());
 await page.locator('#publishBtn').click();
 await page.getByText('Configuration version v2 published',{exact:false}).waitFor();
 assert.equal(await page.locator('#publishedKpi').textContent(),'v2','publish updates the published registry version');

 await page.locator('[data-section="history"]').click();
 await page.locator('[data-restore-version="1"]').click();
 await page.getByText('restored as new draft',{exact:false}).waitFor();
 assert.equal(await page.locator('#draftKpi').textContent(),'v3','restore creates a new draft version');
 assert.equal(await page.locator('#publishedKpi').textContent(),'v2','restore does not change the published version');

 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('[data-section="overview"]').isVisible(),true,'mobile navigation remains available');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
 assert.equal(overflow,false,'mobile control room has no horizontal page overflow');

 await page.locator('#logoutBtn').click();
 assert.equal(await page.locator('#workspace').isVisible(),false,'logout closes the admin workspace');
 await page.locator('#username').fill('MANAGER');
 await page.locator('#pin').fill('1234');
 await page.locator('#loginBtn').click();
 await page.getByText('Central configuration access is restricted',{exact:false}).waitFor();
 assert.equal(await page.locator('#workspace').isVisible(),false,'MANAGER is rejected when server returns HTTP 403');
 assert.ok(calls.includes('central-config-save-draft')&&calls.includes('central-config-publish')&&calls.includes('central-config-restore-draft'),'draft, publish and restore actions were exercised');
 assert.ok(!calls.includes('central-admin-state')&&!calls.includes('get-state'),'configuration UI never requests tracker or legacy admin state');
 console.log('PASS: Central Data Bank Admin browser QA — ADMIN login, draft save, separate publish, restore-as-draft, mobile layout, logout, and non-admin HTTP 403.');
} finally {
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
