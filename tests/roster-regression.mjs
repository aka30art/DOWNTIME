import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const html=await readFile(resolve('index.html'),'utf8'),overview=await readFile(resolve('plant-overview-preview.html'),'utf8');
const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end(req.url?.startsWith('/plant-overview-preview.html')?overview:html)});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(4174,'127.0.0.1',ok)});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',r=>r.abort());
 await page.addInitScript(()=>{localStorage.setItem('plantDowntime.staffRoster.v1',JSON.stringify(['Jan','Mick','Gigi','Daz','Shayne','Preserved Staff']));localStorage.setItem('plantDowntime.operatorRoster.v1',JSON.stringify(['Jan','Mick','Legacy User']));localStorage.setItem('plantDowntime.operatorPins.v1',JSON.stringify({LegacyUser:'7777'}));});
 await page.goto('http://127.0.0.1:4174/',{waitUntil:'domcontentloaded'});
 for(const d of '0123')await page.locator('[data-pinpad="teamPin"] [data-key="'+d+'"]').click();await page.locator('#unlockBtn').click();await page.waitForFunction(()=>document.querySelector('#operatorGate').style.display==='grid');
 assert.equal(await page.locator('.operator-choice').count(),1);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('plantDowntime.operatorRoster.v1'))),['Jan']);
 for(const d of '2666')await page.locator('[data-pinpad="operatorGatePin"] [data-key="'+d+'"]').click();await page.locator('#operatorContinue').click();await page.waitForFunction(()=>document.querySelector('#operatorGate').style.display==='none');
 await page.locator('.nav[data-view=staff]').click();assert.equal(await page.locator('#staffRosterList > div').count(),6);
 assert.equal(await page.locator('#staffRosterList > div').filter({hasText:'Preserved Staff'}).count(),1);
 assert.equal(await page.locator('#operatorChoices .operator-choice').count(),1);
 console.log('PASS: JAN-only USERS cleanup leaves STAFF roster intact');
}finally{await browser.close();await new Promise(ok=>server.close(ok))}
