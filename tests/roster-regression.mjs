import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const html = await readFile(resolve('index.html'),'utf8');
const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end(html)});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(4174,'127.0.0.1',ok)});
const browser=await chromium.launch({headless:true});
const errors=[];
try {
 const page=await browser.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
   if(localStorage.getItem('downtimeRegression.fixtureSeeded.v1'))return;
   const photo='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
   localStorage.setItem('plantDowntime.operatorRoster.v1',JSON.stringify(['Jan','Mick','Gigi','Daz','Shayne','Legacy User']));
   localStorage.setItem('plantDowntime.operatorPins.v1',JSON.stringify({Jan:'8642',Mick:'1234','Legacy User':'7777'}));
   localStorage.setItem('plantDowntime.operatorPrivileges.v1',JSON.stringify({Mick:'Read Only','Legacy User':'Operator'}));
   localStorage.setItem('plantDowntime.staffRoster.v1',JSON.stringify(['Jan','Mick','Gigi','Daz','Shayne']));
   localStorage.setItem('plantDowntime.v1',JSON.stringify({weeks:{},areas:[],reasons:[],archive:[],operatorProfiles:{
     Jan:{station:'Station 1 · WOOD',photo,onSite:true},
     Mick:{station:'Station 2 · WOOD',photo,onSite:true},
     Gigi:{station:'Station 3 · SCRAP',photo,onSite:true},
     Daz:{station:'Station 4 · SCRAP',photo,onSite:true},
     Shayne:{station:'Station 5 · SCRAP',photo,onSite:true}
   }}));
   localStorage.setItem('downtimeRegression.fixtureSeeded.v1','1');
 });
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',r=>r.abort());
 await page.goto('http://127.0.0.1:4174/',{waitUntil:'domcontentloaded'});
 assert.equal(await page.locator('#authGate').isVisible(),true,'team gate appears');
 for(const digit of '0123') await page.locator('[data-pinpad="teamPin"] [data-key="'+digit+'"]').click();
 await page.locator('#unlockBtn').click();
 await page.waitForFunction(()=>document.querySelector('#operatorGate').style.display==='grid');
 assert.equal(await page.locator('.operator-choice').count(),1,'only one app user is shown');
 assert.equal(await page.locator('.operator-choice[data-operator="Jan"]').count(),1,'JAN remains available');
 for(const name of ['Mick','Gigi','Daz','Shayne','Legacy User','Dowie','Lee','Spectator'])
   assert.equal(await page.locator('.operator-choice[data-operator="'+name+'"]').count(),0,name+' is not a login choice');
 const migrated=await page.evaluate(()=>({
   users:JSON.parse(localStorage.getItem('plantDowntime.operatorRoster.v1')||'[]'),
   pins:JSON.parse(localStorage.getItem('plantDowntime.operatorPins.v1')||'{}'),
   privileges:JSON.parse(localStorage.getItem('plantDowntime.operatorPrivileges.v1')||'{}'),
   staff:JSON.parse(localStorage.getItem('plantDowntime.staffRoster.v1')||'[]'),
   profiles:JSON.parse(localStorage.getItem('plantDowntime.v1')||'{}').operatorProfiles
 }));
 assert.deepEqual(migrated.users,['Jan'],'legacy USERS are migrated to JAN only');
 assert.deepEqual(migrated.pins,{Jan:'8642'},'only JAN PIN override is preserved');
 assert.deepEqual(migrated.privileges,{},'legacy app-user privileges are removed');
 assert.deepEqual(migrated.staff,['Jan','Mick','Gigi','Daz','Shayne'],'STAFF roster remains unchanged');
 assert.equal(migrated.profiles.Gigi.station,'Station 3 · SCRAP','Gigi station profile remains unchanged');
 assert.equal(migrated.profiles.Gigi.photo,'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=','Gigi photo remains unchanged');
 await page.locator('.operator-choice[data-operator="Jan"]').click();
 for(const digit of '8642') await page.locator('[data-pinpad="operatorGatePin"] [data-key="'+digit+'"]').click();
 await page.locator('#operatorContinue').click();
 await page.waitForFunction(()=>document.querySelector('#operatorGate').style.display==='none');
 await page.locator('.nav[data-view=settings]').click();
 await page.locator('#newOperatorName').fill('Regression User');
 await page.locator('#newOperatorInitialPin').fill('7777');
 await page.locator('#addOperatorBtn').click();
 assert.match(await page.locator('#operatorAdminMsg').textContent(),/User added/,'JAN can add a new user after migration');
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('plantDowntime.operatorRoster.v1')||'[]')),['Jan','Regression User'],'new USERS entry persists rather than being overwritten by roster reads');
 await page.reload();
 for(const digit of '0123') await page.locator('[data-pinpad="teamPin"] [data-key="'+digit+'"]').click();
 await page.locator('#unlockBtn').click();
 await page.waitForFunction(()=>document.querySelector('#operatorGate').style.display==='grid');
 assert.deepEqual(await page.locator('.operator-choice').evaluateAll(bs=>bs.map(b=>b.dataset.operator)),['Jan','Regression User'],'new user survives a reload');
 assert.deepEqual(errors,[],'no uncaught browser errors');
 console.log('PASS: JAN-only USERS migration; JAN PIN and STAFF profiles preserved; future user additions persist');
} finally {
 await browser.close();
 await new Promise(ok=>server.close(ok));
}
