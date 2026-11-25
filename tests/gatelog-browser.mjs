import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const client=await readFile('gatelog-app.js','utf8');
const css=await readFile('gatelog-app.css','utf8');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>
 <main id="yardHub"><div class="yard-hub-inner"><header class="yard-hero">YARD HUB</header><div class="yard-modules-heading">APPLICATIONS</div><div class="yard-grid"><button id="launchGatelogBtn">GATELOG</button></div><footer class="yard-hub-footer">FOOTER</footer></div></main>
 <script>
 window.DowntimeCentral={session:{token:'test-session'}};window.DOWNTIME_CENTRAL_API_KEY='test-key';window.GATELOG_API='/gatelog-api';window.__calls=[];window.__active=[];
 window.fetch=async(_url,options)=>{const b=JSON.parse(options.body);window.__calls.push(b.action);
 if(b.action==='bootstrap')return {ok:true,json:async()=>({customers:[{id:'c1',customer_name:'Example Ltd'}],vehicles:[{id:'v1',customer_id:'c1',registration:'AB12 CDE'}],activeVisits:window.__active,register:window.__active.map(v=>({...v,customer_name:'Example Ltd',waste_types:['General Waste']})),wasteTypes:[{id:'w1',label:'General Waste'}],arrivalsToday:window.__active.length,customerStats:{c1:{totalVisits:4,todayVisits:1}},statistics:{overallVisits:12,mostCommonWasteType:'General Waste',averageMinutes:42,completedVisits:9}})};
 if(b.action==='customer-arrival'){window.__active=[{id:'visit-new',customer_id:'c2',customer_name:b.customerName,vehicle_registration_snapshot:b.registration,time_in:'2026-11-25T17:00:00Z',visit_date:'2026-11-25',waste_types:b.wasteTypes,status:'ON_SITE'}];return {ok:true,json:async()=>({customer:{id:'c2',customer_name:b.customerName},visit:{id:'visit-new'}})}}
 if(b.action==='arrival'){window.__active=[{id:'visit-1',customer_id:'c1',customer_name:'Example Ltd',vehicle_registration_snapshot:b.registration,time_in:'2026-11-25T17:00:00Z',visit_date:'2026-11-25',waste_types:b.wasteTypes,status:'ON_SITE'}];return {ok:true,json:async()=>({visit:{id:'visit-1'}})}}
 if(b.action==='departure'){window.__active=[];return {ok:true,json:async()=>({visit:{id:'visit-1',status:'DEPARTED'}})}}
 return {ok:false,json:async()=>({error:'Unexpected action'})};};
 </script><script>${client}</script></body></html>`);
 await page.locator('#launchGatelogBtn').click();
 await page.locator('.gatelog-toolbar').waitFor();
 assert.equal(await page.locator('.gatelog-kpi').count(),2);
 assert.equal(await page.locator('#gatelogNewVisit').isVisible(),true);
 assert.equal(await page.locator('#gatelogOpenCustomers').isVisible(),true);
 assert.equal(await page.locator('#gatelogBack').isVisible(),true);
 assert.equal(await page.locator('.gatelog-hero').count(),1);
 assert.match((await page.locator('.gatelog-hero-title').innerText()).replace(/\\s+/g,' '),/GATE\\s*LOG.*CUSTOMER AND SITE ENTRY MANAGEMENT/);
 const mobileHeader=await page.locator('.gatelog-hero').boundingBox();
 const listIcon=await page.locator('#gatelogOpenCustomers').boundingBox();
 const homeIcon=await page.locator('#gatelogBack').boundingBox();
 assert.ok(mobileHeader && mobileHeader.width<=390,'GATELOG hero must fit the 390px mobile viewport');
 assert.ok(listIcon.x>=mobileHeader.x && listIcon.x+listIcon.width<=mobileHeader.x+mobileHeader.width,'Customer Catalogue icon must remain inside the header');
 assert.ok(homeIcon.x>=mobileHeader.x && homeIcon.x+homeIcon.width<=mobileHeader.x+mobileHeader.width,'Home icon must remain inside the header');
 assert.ok(listIcon.x+listIcon.width<=homeIcon.x,'Header action buttons must not overlap');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'GATELOG must not create horizontal page overflow on mobile');
 assert.equal(await page.locator('.gatelog-toolbar-spacer').evaluate(el=>getComputedStyle(el).display),'none');
 assert.match(await page.locator('#gatelogRegister').innerText(),/TIME IN|No visits/);
 assert.match(await page.locator('.gatelog-statistics').innerText(),/MOST COMMON WASTE TYPE[\s\S]*OVERALL VISITS[\s\S]*AVERAGE TIME ON SITE/);
 await page.locator('#gatelogNewVisit').click();
 assert.equal(await page.locator('#gatelogModal').isVisible(),true);
 await page.getByRole('button',{name:/NEW CUSTOMER/}).click();
 await page.locator('#gatelogFormName').fill('New Haulage Ltd');
 await page.locator('#gatelogFormReg').fill('XY12 ZZZ');
 await page.locator('#gatelogVisitForm input[name="wasteTypes"]').check();
 await page.getByRole('button',{name:/SAVE & RECORD TIME IN/}).click();
 await page.locator('[data-depart="visit-new"]').waitFor();
 assert.ok((await page.evaluate(()=>window.__calls)).includes('customer-arrival'),'New customer save must create customer and visit atomically');
 await page.locator('#gatelogOpenCustomers').click();
 assert.match(await page.locator('#gatelogCatalogueList').innerText(),/Example Ltd/);
 await page.locator('[data-use-customer="c1"]').click();
 assert.equal(await page.locator('#gatelogFormName').inputValue(),'Example Ltd');
 assert.equal(await page.locator('#gatelogFormReg').inputValue(),'AB12 CDE');
 await page.setViewportSize({width:1280,height:900});
 const stats=await page.locator('.gatelog-kpis').boundingBox(),actions=await page.locator('.gatelog-toolbar-actions').boundingBox();
 assert.ok(stats.x+stats.width<actions.x);
 await page.getByRole('button',{name:'Close'}).click();
}finally{await browser.close()}
console.log('GATELOG browser workflow: PASS');
