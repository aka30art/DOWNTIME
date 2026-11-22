import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { chromium } from 'playwright';

const pageSource=fs.readFileSync('index.html','utf8');
const overviewSource=fs.readFileSync('plant-overview-preview.html','utf8');
const apiSource=fs.readFileSync('supabase/functions/central-bank/index.ts','utf8');

const pagePermissionBlock=pageSource.slice(pageSource.indexOf('const tierDefaults={'),pageSource.indexOf('function permission(name)'));
const apiPermissionBlock=apiSource.slice(apiSource.indexOf('const tierDefault:'),apiSource.indexOf('const cryptoHex='));
assert.ok(pageSource.includes("{key:'canViewPlantOverview'"),'Access & Rights exposes the dedicated Plant Overview right');
assert.ok(pageSource.includes("if(overview)overview.style.display=spectator||!permission('canViewPlantOverview')?'none':''"),'main navigation uses the dedicated Plant Overview right');
assert.ok(pageSource.includes("if(!permission('canViewPlantOverview'))return;"),'opening Plant Overview uses the dedicated right only');
assert.ok(apiSource.includes('const permissionKeys=Object.keys(tierDefault.OWNER)'),'server tier-save whitelist is derived from mirrored permission defaults');
for(const tier of ['OWNER','ADMIN','MANAGER','SUPERVISOR','USER']){
  assert.match(pagePermissionBlock,new RegExp(tier+':\\{[^}]*canViewPlantOverview:true'),'frontend default grants view access to '+tier);
  assert.match(apiPermissionBlock,new RegExp(tier+':\\{[^}]*canViewPlantOverview:true'),'server default grants view access to '+tier);
}
assert.match(pagePermissionBlock,/SPECTATOR:\{[^}]*canViewPlantOverview:false/,'frontend SPECTATOR remains denied');
assert.match(apiPermissionBlock,/SPECTATOR:\{[^}]*canViewPlantOverview:false/,'server SPECTATOR remains denied');
assert.match(pageSource,/OWNER:\{[^}]*canViewPlantOverview:true/,'locked root OWNER permission includes Plant Overview');
assert.match(apiSource,/OWNER:\{[^}]*canViewPlantOverview:true/,'locked root OWNER permission includes Plant Overview');
assert.ok(overviewSource.includes('canViewPlantOverview=!!rights.canViewPlantOverview'),'Overview page enforces the right for direct URL access');
assert.ok(overviewSource.includes('DOWNTIME ENTRIES TODAY'),'count metric is explicitly named as downtime entries');

const server=http.createServer((req,res)=>{
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  res.end(overviewSource);
});
const browser=await chromium.launch({headless:true});
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const address=server.address();
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.goto('http://127.0.0.1:'+address.port+'/?test=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__DOWNTIME_OVERVIEW_TEST__);

  const denied=await page.evaluate(()=>{
    window.__DOWNTIME_OVERVIEW_TEST__.applyCentralVisibility(
      {tiers:{USER:{canEditTracker:false,canViewPlantOverview:false,canViewStaff:true,canViewAssignments:true,canViewDashboards:true}}},
      {tier:'USER'}
    );
    return document.querySelector('main').hidden;
  });
  assert.equal(denied,true,'Plant Overview content is hidden when its dedicated right is denied');

  const allowed=await page.evaluate(()=>{
    window.__DOWNTIME_OVERVIEW_TEST__.applyCentralVisibility(
      {tiers:{USER:{canEditTracker:false,canViewPlantOverview:true,canViewStaff:true,canViewAssignments:true,canViewDashboards:true}}},
      {tier:'USER'}
    );
    return document.querySelector('main').hidden;
  });
  assert.equal(allowed,false,'Plant Overview content is visible when its dedicated right is granted');

  const legacyPermissions=await page.evaluate(()=>{
    const payload={tiers:{USER:{canEditTracker:false,canViewStaff:true,canViewAssignments:true,canViewDashboards:true}}};
    window.__DOWNTIME_OVERVIEW_TEST__.applyCentralVisibility(payload,{tier:'USER'});
    const main=document.querySelector('main');
    return {hidden:main.hidden,display:getComputedStyle(main).display,staff:document.querySelector('.opgrid')?.closest('.section')?.style.display,stations:document.querySelector('.stationblueprint')?.closest('.section')?.style.display};
  });
  assert.equal(legacyPermissions.hidden,false,'legacy stored USER permissions without canViewPlantOverview inherit the USER default instead of blanking the Overview');
  assert.notEqual(legacyPermissions.display,'none','legacy permissions leave the Overview root rendered');
  assert.equal(legacyPermissions.staff,'','legacy permissions preserve the existing STAFF visibility right');
  assert.equal(legacyPermissions.stations,'','legacy permissions preserve the existing station visibility right');

  const legacySpectatorDenied=await page.evaluate(()=>{
    const payload={tiers:{SPECTATOR:{canEditTracker:false,canViewStaff:false,canViewAssignments:false,canViewDashboards:false}}};
    window.__DOWNTIME_OVERVIEW_TEST__.applyCentralVisibility(payload,{tier:'SPECTATOR'});
    return document.querySelector('main').hidden;
  });
  assert.equal(legacySpectatorDenied,true,'legacy SPECTATOR profile inherits the restrictive default when canViewPlantOverview is absent');

  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    const responsive=await page.evaluate(()=>{
      const legacyUserPayload={tiers:{USER:{canEditTracker:false,canViewStaff:true,canViewAssignments:true,canViewDashboards:true}}};
      window.__DOWNTIME_OVERVIEW_TEST__.applyCentralVisibility(legacyUserPayload,{tier:'USER'});
      const main=document.querySelector('main');
      return {
        hidden:main.hidden,
        display:getComputedStyle(main).display,
        metrics:!!document.querySelector('.metrics'),
        operators:!!document.querySelector('.opgrid'),
        stations:!!document.querySelector('.stationblueprint')
      };
    });
    assert.equal(responsive.hidden,false,'Overview remains unhidden at '+viewport.width+'px');
    assert.notEqual(responsive.display,'none','Overview is rendered at '+viewport.width+'px');
    assert.equal(responsive.metrics,true,'KPI container exists at '+viewport.width+'px');
    assert.equal(responsive.operators,true,'operator section exists at '+viewport.width+'px');
    assert.equal(responsive.stations,true,'station layout exists at '+viewport.width+'px');
  }

  const sunday=await page.evaluate(()=>{
    const stationConfig=[{id:'station-1',name:'Station 1',category:'WOOD',active:true,aliases:[]}];
    const payload={
      staff:{profiles:{
        JAN:{name:'JAN',station:'Station 1',onSite:true},
        MICK:{name:'MICK',station:'Station 1',onSite:false},
        GIGI:{name:'GIGI',station:'',onSite:true}
      }},
      appData:{stationConfig,weeks:{'2026-11-16':{days:[{},{},{},{},{},{}]}}}
    };
    window.__DOWNTIME_OVERVIEW_TEST__.renderLiveStats(payload,new Date('2026-11-22T12:00:00'));
    return {
      operators:document.getElementById('operatorCount').textContent,
      downtime:document.getElementById('totalDowntime').textContent,
      entries:document.getElementById('incidentCount').textContent,
      availability:document.getElementById('availability').textContent,
      badge:document.getElementById('liveDataBadge').textContent
    };
  });
  assert.equal(sunday.operators,'1','Sunday operator count uses live staff assignments without a weekday slot');
  assert.equal(sunday.downtime,'—','Sunday has no fabricated downtime value');
  assert.equal(sunday.entries,'—','Sunday has no fabricated entry count');
  assert.equal(sunday.availability,'—','Sunday availability is not calculated without a day record');
  assert.match(sunday.badge,/NO DAY RECORD/,'Sunday reports the missing weekday record clearly');

  const missingWeek=await page.evaluate(()=>{
    const payload={
      staff:{profiles:{JAN:{name:'JAN',station:'Station 1',onSite:true}}},
      appData:{stationConfig:[{id:'station-1',name:'Station 1',category:'WOOD',active:true,aliases:[]}],weeks:{}}
    };
    window.__DOWNTIME_OVERVIEW_TEST__.renderLiveStats(payload,new Date('2026-11-22T12:00:00'));
    return {
      operators:document.getElementById('operatorCount').textContent,
      downtime:document.getElementById('totalDowntime').textContent
    };
  });
  assert.equal(missingWeek.operators,'1','operator count remains available when the current week has no tracker record');
  assert.equal(missingWeek.downtime,'NO DATA','missing week remains distinct from a recorded zero-downtime day');

  const weekday=await page.evaluate(()=>{
    const payload={
      staff:{profiles:{JAN:{name:'JAN',station:'Station 1',onSite:true},MICK:{name:'MICK',station:'Station 1',onSite:false}}},
      appData:{
        stationConfig:[{id:'station-1',name:'Station 1',category:'WOOD',active:true,aliases:[]}],
        weeks:{'2026-11-16':{days:[{start:'06:30',stop:'17:00',entries:[
          {hours:1,minutes:0,reason:'Mechanical failure'},
          {hours:0,minutes:30,reason:'Blockage'}
        ]},{},{},{},{},{}]}}
      }
    };
    window.__DOWNTIME_OVERVIEW_TEST__.renderLiveStats(payload,new Date('2026-11-16T12:00:00'));
    return {
      operators:document.getElementById('operatorCount').textContent,
      downtime:document.getElementById('totalDowntime').textContent,
      entries:document.getElementById('incidentCount').textContent,
      availability:document.getElementById('availability').textContent
    };
  });
  assert.equal(weekday.operators,'1','weekday operator count retains the assigned/on-site definition');
  assert.equal(weekday.downtime,'01h 30m','weekday downtime is calculated from the day record');
  assert.equal(weekday.entries,'2','daily count reflects recorded downtime entries');
  assert.equal(weekday.availability,'83.8%','weekday availability uses scheduled time less the standard break and downtime');

  await page.close();
  console.log('PASS: Plant Overview permission gate, independent STAFF/assignment/dashboard visibility, Sunday operator metric, no-week state, and weekday KPI regression.');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
