import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const client=await readFile('gatelog-app.js','utf8');
const css=await readFile('gatelog-app.css','utf8');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>
 <main id="yardHub"><div class="yard-hub-inner">
  <header class="yard-hero">YARD HUB</header><div class="yard-modules-heading">APPLICATIONS</div>
  <div class="yard-grid"><button id="launchGatelogBtn" class="yard-tile">GATELOG</button></div>
  <footer class="yard-hub-footer">FOOTER</footer>
 </div></main>
 <script>
 window.DowntimeCentral={session:{token:'test-session'}};
 window.DOWNTIME_CENTRAL_API_KEY='test-key';window.GATELOG_API='/gatelog-api';
 window.__calls=[];window.__active=[];
 window.fetch=async(_url,options)=>{
  const body=JSON.parse(options.body);window.__calls.push(body.action);
  if(body.action==='bootstrap')return {ok:true,json:async()=>({customers:[{id:'c1',customer_name:'Example Ltd'}],vehicles:[{id:'v1',customer_id:'c1',registration:'AB12 CDE'}],activeVisits:window.__active,wasteTypes:[{id:'w1',label:'General Waste'}],arrivalsToday:window.__active.length,departuresToday:window.__departures||0})};
  if(body.action==='arrival'){window.__active=[{id:'visit-1',customer_id:'c1',customer_name:'Example Ltd',vehicle_registration_snapshot:body.registration,time_in:'2026-11-25T17:00:00Z',visit_date:'2026-11-25',waste_types:body.wasteTypes,status:'ON_SITE'}];return {ok:true,json:async()=>({visit:{id:'visit-1'}})}}
  if(body.action==='departure'){window.__active=[];window.__departures=1;return {ok:true,json:async()=>({visit:{id:'visit-1',status:'DEPARTED'}})}}
  if(body.action==='history')return {ok:true,json:async()=>({visits:[{id:'visit-1',customer_name:'Example Ltd',vehicle_registration_snapshot:'AB12 CDE',visit_date:'2026-11-25',time_in:'2026-11-25T17:00:00Z',time_out:'2026-11-25T17:30:00Z',status:'DEPARTED',waste_types:['General Waste']}]})};
  if(body.action==='customer-save')return {ok:true,json:async()=>({customer:{id:'c2',customer_name:body.customerName}})};
  return {ok:false,json:async()=>({error:'Unexpected action'})};
 };
 </script><script>${client.replace(/<\/script/gi,'<\\/script')}</script></body></html>`);
 await page.locator('#launchGatelogBtn').click();
 await page.locator('#gatelogCustomer').selectOption('c1');
 await page.locator('#gatelogRegistration').fill('AB12 CDE');
 await page.locator('#gatelogWaste input[value="General Waste"]').check();
 await page.locator('#gatelogArrival').click();
 await page.locator('[data-depart="visit-1"]').waitFor();
 assert.equal(await page.locator('#gatelogWorkspace').isVisible(),true);
 assert.match(await page.locator('#gatelogActive').innerText(),/Example Ltd/);
 await page.locator('[data-depart="visit-1"]').click();
 await page.locator('#gatelogActive').getByText('No vehicles currently on site.').waitFor();
 await page.locator('#gatelogSearchBtn').click();
 await page.locator('#gatelogHistory').getByText('DEPARTED').waitFor();
 const calls=await page.evaluate(()=>window.__calls);
 assert.deepEqual(calls,['bootstrap','arrival','bootstrap','departure','bootstrap','history']);
} finally { await browser.close(); }
console.log('GATELOG browser smoke: PASS');
