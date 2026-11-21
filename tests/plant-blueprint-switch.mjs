import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const html=await readFile(resolve('plant-overview-preview.html'),'utf8');
const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html)});
await new Promise((resolveListen,reject)=>{server.once('error',reject);server.listen(4175,'127.0.0.1',resolveListen)});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.goto('http://127.0.0.1:4175/?test=1',{waitUntil:'domcontentloaded'});
 const station=page.locator('#stationClassificationView'), plant=page.locator('#overallPlantBlueprintView');
 const stationButton=page.locator('#stationViewBtn'), plantButton=page.locator('#plantViewBtn');
 assert.equal(await station.isVisible(),true,'station classification should be default view');
 assert.equal(await plant.isVisible(),false,'overall plant blueprint should start hidden');
 await plantButton.click();
 assert.equal(await station.isVisible(),false,'station classification hides when plant blueprint selected');
 assert.equal(await plant.isVisible(),true,'overall plant blueprint shows when selected');
 assert.equal(await plantButton.getAttribute('aria-pressed'),'true');
 assert.equal(await stationButton.getAttribute('aria-pressed'),'false');
 assert.equal(await page.locator('.plant-layout-svg circle').count(),9,'blueprint marks nine E-stops');
 await stationButton.click();
 assert.equal(await station.isVisible(),true,'station view returns on toggle');
 assert.equal(await plant.isVisible(),false,'plant blueprint hides on return');
 await page.close();
 console.log('PASS: Station View / Plant Blueprint switch, hidden-state, accessibility state, and nine E-stop markers.');
}finally{await browser.close();await new Promise(resolveClose=>server.close(resolveClose));}
