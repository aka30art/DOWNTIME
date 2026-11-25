import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium } from "playwright";

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
page.on("pageerror",error=>errors.push(error.message));
const menu={departments:[
 {id:"downtime",kind:"downtime",title:"DOWNTIME",description:"PLANT DOWNTIME & OPERATIONS",enabled:true,order:0,protected:true,submenus:[]},
 {id:"repairs-maintenance",kind:"repairs-maintenance",title:"R&M",description:"REPAIRS & MAINTENANCE",enabled:true,order:1,protected:false,submenus:[]},
 {id:"hub-settings",kind:"hub-settings",title:"HUB SETTINGS",description:"ADMINISTRATION",enabled:true,order:2,protected:true,submenus:[]},
 {id:"machinery",kind:"custom",title:"MACHINERY",description:"PLANT & EQUIPMENT",enabled:true,order:3,protected:false,submenus:[
  {id:"telehandler",label:"Telehandler",enabled:true,order:0},
  {id:"360-excavators",label:"360 Excavators",enabled:true,order:1}
 ]}
]};
await page.route("https://example.test/functions/v1/central-config-admin",async route=>{
 const origin="http://localhost";
 const headers={"access-control-allow-origin":origin,"access-control-allow-headers":"apikey, content-type, x-downtime-session","access-control-allow-methods":"POST, OPTIONS","vary":"Origin"};
 if(route.request().method()==="OPTIONS")return route.fulfill({status:204,headers});
 return route.fulfill({status:200,contentType:"application/json",headers,body:JSON.stringify({publishedVersion:9,yardHubMenu:menu})});
});
const testHtml=`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
 <main id="yardHub"><div class="yard-hub-inner">
  <header class="yard-hero">YARD HUB</header><div class="yard-modules-heading">MODULES</div>
  <section class="yard-grid">
   <button id="launchDowntimeBtn" class="yard-tile yard-tile-active" data-app="downtime"><span class="yard-tile-icon"></span><span class="yard-tile-divider"></span><span class="yard-tile-copy"><strong>DOWNTIME</strong><small>OLD</small><span class="yard-tile-status">LIVE</span></span></button>
   <button id="launchRepairMaintenanceBtn" class="yard-tile yard-tile-active" data-app="repair-maintenance"><span class="yard-tile-icon"></span><span class="yard-tile-divider"></span><span class="yard-tile-copy"><strong>R&M</strong><small>OLD</small><span class="yard-tile-status">LIVE</span></span></button>
   <button id="yardHubSettingsBtn" class="yard-tile yard-tile-active" data-app="settings" hidden><span class="yard-tile-icon"></span><span class="yard-tile-divider"></span><span class="yard-tile-copy"><strong>HUB SETTINGS</strong><small>ADMIN</small><span class="yard-tile-status">ADMIN</span></span></button>
  </section><footer class="yard-hub-footer">FOOTER</footer>
 </div></main></body></html>`;
await page.route("http://localhost/",route=>route.fulfill({status:200,contentType:"text/html",body:testHtml}));
await page.goto("http://localhost/");
await page.evaluate(()=>{
 window.CENTRAL_CONFIG_ADMIN_API="https://example.test/functions/v1/central-config-admin";
 window.DOWNTIME_CENTRAL_API_KEY="test-key";
 window.DowntimeCentral={session:{token:"test-session"}};
});
await page.addScriptTag({path:resolve("yard-hub-structure.js")});
await page.evaluate(()=>window.dispatchEvent(new Event("yard-hub:shown")));
const machinery=page.locator('.yard-grid .yard-tile[data-structure-id="machinery"]');
await machinery.waitFor({timeout:5000});
assert.equal(await machinery.locator(".yard-tile-copy strong").textContent(),"MACHINERY");
assert.equal(await machinery.locator(".yard-tile-copy small").textContent(),"PLANT & EQUIPMENT");
assert.equal(await machinery.evaluate(el=>el.classList.contains("yard-tile")),true,"generated department uses the shared tile component");
await machinery.click();
assert.equal(await page.locator(".yard-structure-screen").isVisible(),true,"custom department opens its generated workspace");
assert.equal(await page.locator(".yard-structure-title").textContent(),"MACHINERY");
assert.deepEqual(await page.locator(".yard-structure-link strong").allTextContents(),["Telehandler","360 Excavators"]);
await page.locator(".yard-structure-link").first().click();
assert.equal(await page.locator(".yard-structure-title").textContent(),"Telehandler","sub-menu opens its own generated workspace");
assert.match(await page.locator(".yard-structure-status").textContent(),/MACHINERY/);
await page.locator(".yard-structure-back").click();
assert.equal(await page.locator(".yard-grid").isVisible(),true,"back control returns to YARD HUB");
assert.deepEqual(errors,[],"generated menu and workspace have no browser errors");
await browser.close();
console.log("Phase 09 generated department and sub-menu browser contract passed.");
