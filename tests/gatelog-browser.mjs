import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const client=await readFile('gatelog-app.js','utf8');
const dayManagement=await readFile('gatelog-day-management.js','utf8');
const css=await readFile('gatelog-app.css','utf8');
const sharedCss=await readFile('shared-ui-system.css','utf8');
const visualCss=await readFile('yard-hub-visual-system.css','utf8');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.setContent(`<!doctype html><html><head><style>*{box-sizing:border-box}html,body{margin:0}</style><style>${sharedCss}</style><style>${css}</style><style>${visualCss}</style></head><body>
 <main id="yardHub" class="yard-hub"><div class="yard-hub-inner"><header class="yard-hero">YARD HUB</header><div class="yard-modules-heading">APPLICATIONS</div><div class="yard-grid"><button id="launchGatelogBtn">GATELOG</button></div><footer class="yard-hub-footer">FOOTER</footer></div></main>
 <div class="rm-module-root" style="position:absolute;left:-9999px;width:390px;visibility:hidden"><header class="hero"><div class="hero-top"><div><div class="downtime-mark">DOWNTIME®</div><div class="mark-rule"></div></div><div class="hero-actions"><div class="session-label">HUB AUTHENTICATED AS<strong>USER</strong></div><button class="icon-button">▤</button><a class="icon-button" href="#">⌂</a></div></div><div class="hero-word">/R&amp;M</div><p class="hero-tag">REPAIRS &amp; MAINTENANCE</p></header></div>
 <script>
 window.DowntimeCentral={session:{token:'test-session'}};window.DOWNTIME_CENTRAL_API_KEY='test-key';window.GATELOG_API='/gatelog-api';window.__calls=[];window.__active=[];window.__period='daily';
 window.fetch=async(_url,options)=>{const b=JSON.parse(options.body);window.__calls.push(b.action);
 if(b.action==='bootstrap')return {ok:true,json:async()=>({customers:[{id:'c1',customer_name:'Example Ltd'}],vehicles:[{id:'v1',customer_id:'c1',registration:'AB12 CDE'}],activeVisits:window.__active,register:window.__active.map(v=>({...v,customer_name:'Example Ltd',waste_types:['General Waste']})),wasteTypes:[{id:'w1',label:'General Waste'}],arrivalsToday:window.__active.length,customerStats:{c1:{totalVisits:4,todayVisits:1}},statistics:{overallVisits:12,mostCommonWasteType:'General Waste'},periodStatistics:{daily:{totalVisits:2,mostCommonWasteType:'General Waste'},weekly:{totalVisits:8,mostCommonWasteType:'General Waste'},monthly:{totalVisits:21,mostCommonWasteType:'Mixed'}},dailyGatemen:[{duty_date:'2026-11-23',gateman_username:null,gateman_name:'Not assigned',is_locked:false},{duty_date:'2026-11-24',gateman_username:null,gateman_name:'Not assigned',is_locked:false},{duty_date:'2026-11-25',gateman_username:null,gateman_name:'Not assigned',is_locked:false},{duty_date:'2026-11-26',gateman_username:null,gateman_name:'Not assigned',is_locked:false},{duty_date:'2026-11-27',gateman_username:null,gateman_name:'Not assigned',is_locked:false},{duty_date:'2026-11-28',gateman_username:null,gateman_name:'Not assigned',is_locked:false}],dayVisitCounts:{'2026-11-23':1,'2026-11-24':2,'2026-11-25':3},gatemen:[{username:'Jan',displayName:'Jan',tier:'SUPERVISOR'},{username:'Mick',displayName:'Mick',tier:'USER'}],canManageGateman:true,canExportReports:true})};
 if(b.action==='customer-arrival'){window.__active=[{id:'visit-new',customer_id:'c2',customer_name:b.customerName,vehicle_registration_snapshot:b.registration,time_in:'2026-11-25T17:00:00Z',visit_date:'2026-11-25',waste_types:b.wasteTypes,status:'ON_SITE'}];return {ok:true,json:async()=>({customer:{id:'c2',customer_name:b.customerName},visit:{id:'visit-new'}})}}
 if(b.action==='arrival'){window.__active=[{id:'visit-1',customer_id:'c1',customer_name:'Example Ltd',vehicle_registration_snapshot:b.registration,time_in:'2026-11-25T17:00:00Z',visit_date:'2026-11-25',waste_types:b.wasteTypes,status:'ON_SITE'}];return {ok:true,json:async()=>({visit:{id:'visit-1'}})}}
 if(b.action==='departure'){window.__active=[];return {ok:true,json:async()=>({visit:{id:'visit-1',status:'DEPARTED'}})}}
 if(b.action==='day-register')return {ok:true,json:async()=>({visits:[{id:'day-'+b.dutyDate,visit_date:b.dutyDate,time_in:'2026-11-25T08:00:00Z',time_out:null,customer_name:'Example Ltd',vehicle_registration_snapshot:'AB12 CDE',waste_types:['General Waste'],status:'ON_SITE'}],assignment:{gateman_username:null,gateman_name:'Not assigned',is_locked:false}})};
 if(b.action==='gateman-save')return {ok:true,json:async()=>({assignment:{duty_date:b.dutyDate,gateman_username:b.username,gateman_name:b.username,is_locked:false}})};
 if(b.action==='gateman-lock')return {ok:true,json:async()=>({assignment:{duty_date:b.dutyDate,gateman_username:'Jan',gateman_name:'Jan',is_locked:true}})};
 if(b.action==='report')return {ok:true,json:async()=>({period:b.period,from:b.anchorDate,to:b.anchorDate,visits:[],assignments:[]})};
 return {ok:false,json:async()=>({error:'Unexpected action'})};};
 </script><script>${client}</script><script>${dayManagement}</script></body></html>`);
 await page.locator('#launchGatelogBtn').click();
 await page.locator('.gatelog-toolbar').waitFor();
 assert.equal(await page.locator('.gatelog-kpi').count(),2);
 assert.equal(await page.locator('#gatelogNewVisit').isVisible(),true);
 assert.equal(await page.locator('#gatelogOpenCustomers').isVisible(),true);
 assert.equal(await page.locator('#gatelogBack').isVisible(),true);
 assert.equal(await page.locator('.gatelog-hero').count(),1);
 assert.equal(await page.locator('.gatelog-title-main').innerText(),'GATE');
 assert.equal(await page.locator('.gatelog-title-light').innerText(),'LOG');
 assert.equal(await page.locator('.gatelog-hero-title p').innerText(),'CUSTOMER AND SITE ENTRY MANAGEMENT');
 const mobileHeaderComparison=await page.evaluate(()=>{
  const g=document.querySelector('.gatelog-hero'),r=document.querySelector('.rm-module-root .hero');
  const ga=document.querySelector('.gatelog-hero-icon'),ra=document.querySelector('.rm-module-root .icon-button');
  return {g:{height:getComputedStyle(g).minHeight,padding:getComputedStyle(g).padding,radius:getComputedStyle(g).borderRadius,border:getComputedStyle(g).borderTopWidth,stripe:getComputedStyle(document.querySelector('.gatelog-hero-stripe')).width,action:getComputedStyle(ga).width},r:{height:getComputedStyle(r).minHeight,padding:getComputedStyle(r).padding,radius:getComputedStyle(r).borderRadius,border:getComputedStyle(r).borderTopWidth,stripe:getComputedStyle(r,'::after').width,action:getComputedStyle(ra).width}};
 });
 assert.deepEqual(mobileHeaderComparison.g,mobileHeaderComparison.r,'GATELOG and R&M mobile headers must share identical geometry and icon sizing');
 const mobileHeader=await page.locator('.gatelog-hero').boundingBox();
 const listIcon=await page.locator('#gatelogOpenCustomers').boundingBox();
 const homeIcon=await page.locator('#gatelogBack').boundingBox();
 assert.ok(mobileHeader && mobileHeader.width<=390,'GATELOG hero must fit the 390px mobile viewport');
 assert.ok(listIcon.x>=mobileHeader.x && listIcon.x+listIcon.width<=mobileHeader.x+mobileHeader.width,'Customer Catalogue icon must remain inside the header');
 assert.ok(homeIcon.x>=mobileHeader.x && homeIcon.x+homeIcon.width<=mobileHeader.x+mobileHeader.width,'Home icon must remain inside the header');
 assert.ok(listIcon.x+listIcon.width<=homeIcon.x,'Header action buttons must not overlap');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'GATELOG must not create horizontal page overflow on mobile');
 await page.setViewportSize({width:320,height:780});
 const narrowHeader=await page.locator('.gatelog-hero').boundingBox();
 assert.ok(narrowHeader&&narrowHeader.width<=320,'GATELOG header must fit a 320px viewport');
 const narrowOverflow=await page.evaluate(()=>({width:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth,offenders:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:typeof e.className==='string'?e.className:'',id:e.id,left:Math.round(e.getBoundingClientRect().left),right:Math.round(e.getBoundingClientRect().right),width:Math.round(e.getBoundingClientRect().width)})).filter(x=>x.right>innerWidth+1||x.left< -1).slice(0,20)}));
 assert.ok(narrowOverflow.html<=narrowOverflow.width,'GATELOG must not overflow at 320px: '+JSON.stringify(narrowOverflow));
 assert.equal(await page.locator('.gatelog-toolbar-spacer').evaluate(el=>getComputedStyle(el).display),'none');
 assert.match(await page.locator('#gatelogRegister').innerText(),/TIME IN|No visits/);
 assert.equal(await page.locator('.gatelog-collapsible').count(),2);
 assert.equal(await page.locator('.gatelog-day-panel').evaluate(el=>el.open),false,'Day-to-Day panel must start collapsed');
 assert.equal(await page.locator('.gatelog-statistics-panel').evaluate(el=>el.open),false,'Visit Statistics panel must start collapsed');
 await page.locator('.gatelog-day-panel summary').click();
 assert.match(await page.locator('.gatelog-day-panel').innerText(),/MON[\s\S]*TUE[\s\S]*WED[\s\S]*THU[\s\S]*FRI[\s\S]*SAT[\s\S]*GATEMAN[\s\S]*NOT ASSIGNED/);
 await page.locator('.gatelog-statistics-panel summary').click();
 assert.match(await page.locator('#gatelogPeriodStatistics').innerText(),/DAILY[\s\S]*WEEKLY[\s\S]*MONTHLY[\s\S]*VISITS[\s\S]*MOST COMMON WASTE TYPE/);
 assert.doesNotMatch(await page.locator('#gatelogPeriodStatistics').innerText(),/ALL TIME|AVERAGE TIME ON SITE/);
 await page.locator('[data-gatelog-period="weekly"]').click();
 assert.match(await page.locator('#gatelogPeriodStatistics').innerText(),/VISITS[\s\S]*8/);
 await page.locator('[data-gatelog-day="2026-11-25"]').click();
 assert.match(await page.locator('#gatelogRegister').innerText(),/AB12 CDE/);
 await page.locator('#gatelogAssignGateman').click();
 await page.locator('#gatelogGatemanSelect').selectOption('Jan');
 await page.locator('#gatelogGatemanForm [type=submit]').click();
 await page.locator('#gatelogLockGateman').click();
 assert.ok((await page.evaluate(()=>window.__calls)).includes('gateman-save'));
 assert.ok((await page.evaluate(()=>window.__calls)).includes('gateman-lock'));
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
 const desktopHeaderComparison=await page.evaluate(()=>{
  const g=document.querySelector('.gatelog-hero'),r=document.querySelector('.rm-module-root .hero');
  const ga=document.querySelector('.gatelog-hero-icon'),ra=document.querySelector('.rm-module-root .icon-button');
  return {g:{height:getComputedStyle(g).minHeight,padding:getComputedStyle(g).padding,radius:getComputedStyle(g).borderRadius,border:getComputedStyle(g).borderTopWidth,stripe:getComputedStyle(document.querySelector('.gatelog-hero-stripe')).width,action:getComputedStyle(ga).width},r:{height:getComputedStyle(r).minHeight,padding:getComputedStyle(r).padding,radius:getComputedStyle(r).borderRadius,border:getComputedStyle(r).borderTopWidth,stripe:getComputedStyle(r,'::after').width,action:getComputedStyle(ra).width}};
 });
 assert.deepEqual(desktopHeaderComparison.g,desktopHeaderComparison.r,'GATELOG and R&M desktop headers must share identical geometry and icon sizing');
 const stats=await page.locator('.gatelog-kpis').boundingBox(),actions=await page.locator('.gatelog-toolbar-actions').boundingBox();
 assert.ok(actions.y>stats.y,'New Visit action must follow the Day-to-Day panel and sit below the live counters');
 await page.getByRole('button',{name:'Close'}).click();
}finally{await browser.close()}
console.log('GATELOG browser workflow: PASS');
