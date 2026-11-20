import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const html = await readFile(resolve('index.html'), 'utf8');
const overview = await readFile(resolve('plant-overview-preview.html'), 'utf8');
const server = createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end(req.url?.startsWith('/plant-overview-preview.html')?overview:html)});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(4174,'127.0.0.1',ok)});
const browser=await chromium.launch({headless:true});
const errors=[];
try {
 const page=await browser.newPage(); page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',r=>r.abort());
 await page.goto('http://127.0.0.1:4174/',{waitUntil:'domcontentloaded'});
 assert.equal(await page.locator('#authGate').isVisible(),true,'team gate appears on startup');
 for(const digit of '0123') await page.locator('[data-pinpad="teamPin"] [data-key="'+digit+'"]').click();
 await page.locator('#unlockBtn').click();
 await page.waitForFunction(()=>document.querySelector('#operatorGate').style.display==='grid');
 assert.equal(await page.locator('.operator-choice[data-operator="Jan"]').count(),1,'JAN remains the only app user');
 for(const name of ['Mick','Gigi','Daz','Shayne','Dowie','Lee','Spectator']) assert.equal(await page.locator('.operator-choice[data-operator="'+name+'"]').count(),0,name+' is removed from app USERS');
 assert.equal(await page.locator('.operator-choice[data-operator="Dowie"]').count(),0,'legacy Dowie removed');
 assert.equal(await page.locator('.operator-choice[data-operator="Lee"]').count(),0,'legacy Lee removed');
 assert.equal(await page.locator('.operator-choice').count(),1,'only JAN login choice is rendered');
 assert.equal(await page.locator('#refreshAppBtn').count(),1,'refresh/cache recovery control is present');
 // Spectator mode remains outside the app-users assignment list.
 // Jan retains admin access in offline/local mode.
 await page.locator('.operator-choice[data-operator="Jan"]').click();
 for(const digit of '2666') await page.locator('[data-pinpad="operatorGatePin"] [data-key="'+digit+'"]').click();
 await page.locator('#operatorContinue').click();
 await page.waitForFunction(()=>document.querySelector('#operatorGate').style.display==='none');
 assert.match(await page.locator('#dayHeading').textContent(),/OPERATOR: Jan/,'Jan offline login succeeds');
 await page.locator('.nav[data-view=settings]').click();
 assert.equal(await page.locator('#operatorAdminPanel').isVisible(),true,'Jan admin panel remains accessible');
 assert.equal(await page.locator('#settingsAdminControls').isVisible(),true,'Jan user administration remains accessible');
 assert.deepEqual(errors,[],'no uncaught JS errors');
 console.log('PASS JAN-only app-users gate; Jan admin; offline login; no JS errors');
} finally { await browser.close(); await new Promise(ok=>server.close(ok)); }
