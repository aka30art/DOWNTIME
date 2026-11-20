import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { chromium } from 'playwright';

const html = await readFile(resolve('index.html'), 'utf8');
const overviewHtml = await readFile(resolve('plant-overview-preview.html'), 'utf8');
const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]).filter(source => source.trim());
inlineScripts.forEach((source, index) => new vm.Script(source, { filename: `inline-script-${index + 1}.js` }));
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(req.url?.startsWith('/plant-overview-preview.html') ? overviewHtml : html);
});
await new Promise((resolveListen, reject) => {
  server.once('error', reject);
  server.listen(4173, '127.0.0.1', resolveListen);
});

const browser = await chromium.launch({ headless: true });
const pageErrors = [];
const browserMessages = [];
async function newPage() {
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserMessages.push(message.text()); });
  return page;
}
async function enterTeamPin(page) {
  for (const digit of '0123') await page.locator('[data-pinpad="teamPin"] [data-key="'+digit+'"]').click();
  await page.locator('#unlockBtn').click();
  await page.waitForFunction(() => document.querySelector('#authGate').style.display === 'none');
  await page.waitForFunction(() => document.querySelector('#operatorGate').style.display === 'grid');
}
async function assignOperator(page, pin = '2666', operator = (pin === '1234' ? 'Mick' : 'Jan')) {
  await page.locator(`.operator-choice[data-operator="${operator}"]`).click();
  for (const digit of pin) await page.locator('[data-pinpad="operatorGatePin"] [data-key="'+digit+'"]').click();
  await page.locator('#operatorContinue').click();
  await page.waitForFunction(() => document.querySelector('#operatorGate').style.display === 'none');
  await page.waitForFunction(() => /LOCAL MODE|LIVE · synced/.test(document.querySelector('#cloudStatus').textContent), { timeout: 15000 });
}
async function seedExistingUsers(page, { names=['Jan','Mick','Gigi','Daz','Shayne'], pins={Jan:'2666',Mick:'1234'}, privileges={} }={}) {
  // Test fixture only: these cases exercise existing account/permission workflows after migration.
  await page.addInitScript(({names,pins,privileges}) => {
    const migration='plantDowntime.usersJanOnly.v2';
    // These fixtures represent browsers that have already completed both migrations.
    localStorage.setItem('plantDowntime.pinsJanOnly.v1','1');
    if(!localStorage.getItem(migration)) {
      localStorage.setItem('plantDowntime.operatorRoster.v1',JSON.stringify(names));
      localStorage.setItem('plantDowntime.operatorPins.v1',JSON.stringify(pins));
      localStorage.setItem('plantDowntime.operatorPrivileges.v1',JSON.stringify(privileges));
      localStorage.setItem(migration,'1');
    }
  }, {names,pins,privileges});
}

try {
  // 1. The app must render and accept the team PIN without making any vendor request at startup.
  const offline = await newPage();
  await offline.addInitScript(() => {
    localStorage.setItem('plantDowntime.operatorRoster.v1',JSON.stringify(['Jan','Mick','Gigi','Daz','Shayne','Legacy User']));
    localStorage.setItem('plantDowntime.operatorPins.v1',JSON.stringify({Jan:'8642',Mick:'1234','Legacy User':'7777'}));
    localStorage.setItem('plantDowntime.operatorPrivileges.v1',JSON.stringify({Mick:'Read Only','Legacy User':'Operator'}));
    localStorage.setItem('plantDowntime.staffRoster.v1',JSON.stringify(['Jan','Mick','Gigi','Daz','Shayne']));
    localStorage.setItem('plantDowntime.v1',JSON.stringify({weeks:{},areas:[],reasons:[],archive:[],operatorProfiles:{
      Jan:{station:'Station 1 · WOOD',photo:'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',onSite:true},
      Mick:{station:'Station 2 · WOOD',photo:'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',onSite:true},
      Gigi:{station:'Station 3 · SCRAP',photo:'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',onSite:true},
      Daz:{station:'Station 4 · SCRAP',photo:'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',onSite:true},
      Shayne:{station:'Station 5 · SCRAP',photo:'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',onSite:true}
    }}));
  });
  const vendorRequests = [];
  offline.on('request', request => {
    if (/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/.test(request.url())) vendorRequests.push(request.url());
  });
  await offline.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 5000 });
  assert.equal(await offline.locator('#authGate').isVisible(), true, 'team PIN gate should be visible at startup');
  assert.equal(vendorRequests.length, 0, 'third-party libraries must not block application startup');
  for (const digit of '9999') await offline.locator('[data-pinpad="teamPin"] [data-key="'+digit+'"]').click();
  await offline.locator('#unlockBtn').click();
  console.log('DEBUG wrong PIN message:', JSON.stringify(await offline.locator('#authMsg').textContent()), 'pageErrors:', JSON.stringify(pageErrors), 'consoleErrors:', JSON.stringify(browserMessages));
  assert.match(await offline.locator('#authMsg').textContent(), /Incorrect PIN/, 'wrong team PIN should be rejected');
  assert.equal(await offline.locator('#authGate').isVisible(), true, 'wrong PIN must not unlock the app');

  // Simulate a blocked Supabase CDN. The app must still open immediately in local mode.
  await offline.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.abort());
  await enterTeamPin(offline);
  assert.equal(await offline.locator('.operator-choice').count(), 1, 'JAN must be the only login choice after legacy USERS migration');
  assert.equal(await offline.locator('.operator-choice[data-operator="Spectator"]').count(), 0, 'Spectator must not appear in app USERS');
  const migratedStorage = await offline.evaluate(() => ({
    users: JSON.parse(localStorage.getItem('plantDowntime.operatorRoster.v1') || '[]'),
    pins: JSON.parse(localStorage.getItem('plantDowntime.operatorPins.v1') || '{}'),
    privileges: JSON.parse(localStorage.getItem('plantDowntime.operatorPrivileges.v1') || '{}'),
    staff: JSON.parse(localStorage.getItem('plantDowntime.staffRoster.v1') || '[]'),
    profiles: JSON.parse(localStorage.getItem('plantDowntime.v1') || '{}').operatorProfiles
  }));
  assert.deepEqual(migratedStorage.users,['Jan'],'migration leaves JAN as the only app USER');
  assert.deepEqual(migratedStorage.pins,{Jan:'8642'},'migration preserves JAN PIN and removes legacy user PIN overrides');
  assert.deepEqual(migratedStorage.privileges,{},'legacy app-user privileges are removed');
  assert.deepEqual(migratedStorage.staff,['Jan','Mick','Gigi','Daz','Shayne'],'STAFF roster is not changed by USERS migration');
  assert.equal(migratedStorage.profiles.Gigi.station,'Station 3 · SCRAP','Gigi STAFF profile remains intact');
  assert.ok(migratedStorage.profiles.Gigi.photo.startsWith('data:image/'),'Gigi STAFF photo remains intact');
  assert.equal(await offline.locator('#spectatorBtn').count(), 0, 'main gate should not contain spectator shortcut');
  await assignOperator(offline, '8642');
  const overviewLink = offline.locator('.overview-link');
  assert.equal(await overviewLink.count(), 1, 'Overview navigation should be present for operators');
  assert.equal(await overviewLink.getAttribute('href'), 'plant-overview-preview.html', 'Overview button should link to Plant Overview');
  assert.equal(await overviewLink.getAttribute('target'), '_blank', 'Overview should open in a separate tab');
  assert.equal(await offline.locator('#operatorGate').isVisible(), false, 'operator gate should close after a valid operator PIN');
  assert.match(await offline.locator('#dayHeading').textContent(), /OPERATOR: Jan/, 'assigned operator should appear in the tracker');
  // Full-screen toggle must be present and switch into/out of fullscreen mode.
  const fullscreenButton = offline.locator('#fullscreenBtn');
  assert.equal(await fullscreenButton.count(), 1, 'operator interface should provide a Full Screen button');
  await fullscreenButton.click();
  await offline.waitForFunction(() => !!document.fullscreenElement || document.body.classList.contains('app-fullscreen'));
  assert.equal(await fullscreenButton.getAttribute('aria-pressed'), 'true', 'Full Screen should report active state');
  await fullscreenButton.click();
  await offline.waitForFunction(() => !document.fullscreenElement && !document.body.classList.contains('app-fullscreen'));
  assert.equal(await fullscreenButton.getAttribute('aria-pressed'), 'false', 'Full Screen should return to normal mode');

  const saved = await offline.evaluate(() => localStorage.getItem('plantDowntime.v1'));
  assert.ok(saved && saved.includes('Jan'), 'operator assignment should be persisted locally');

  // Mick remains a standard operator; Jan is the sole permanent administrator.
  const mick = await newPage();
  await seedExistingUsers(mick,{names:['Jan','Mick']});
  await mick.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.abort());
  await mick.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await enterTeamPin(mick);
  assert.equal(await mick.locator('.operator-choice[data-operator="Mick"]').count(), 1, 'Mick should be present in canonical roster');
  await assignOperator(mick, '1234', 'Mick');
  assert.match(await mick.locator('#dayHeading').textContent(), /OPERATOR: Mick/, 'Mick should authenticate with PIN 1234');
  assert.equal(await mick.locator('#settingsAdminControls').isVisible(), false, 'Mick cannot access app-user administration');
  await mick.close();

  const jan = await newPage();
  await seedExistingUsers(jan);
  await jan.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.abort());
  await jan.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  jan.on('dialog', dialog => dialog.accept());
  await enterTeamPin(jan);
  await assignOperator(jan, '2666', 'Jan');
  await jan.locator('#lockStartBtn').click();
  assert.equal(await jan.locator('#plantStart').isDisabled(), true, 'plant start should be locked before Jan admin unlock');
  assert.equal(await jan.locator('#unlockStartBtn').isVisible(), true, 'JAN must see the admin start-unlock action');
  await jan.locator('#unlockStartBtn').click();
  assert.equal(await jan.locator('#plantStart').isDisabled(), false, 'JAN must be able to unlock a permanently locked start time');
  await jan.locator('.nav[data-view=settings]').click();
  assert.equal(await jan.locator('#operatorAdminPanel').isVisible(), true, 'JAN must have operator administration controls');
  assert.equal(await jan.locator('#settingsAdminControls').isVisible(), true, 'JAN must have app-user administration');
  await jan.locator('#newOperatorName').fill('Test Operator');
  await jan.locator('#newOperatorInitialPin').fill('7777');
  await jan.locator('#addOperatorBtn').click();
  assert.match(await jan.locator('#operatorAdminMsg').textContent(), /User added/, 'JAN should be able to add an app user');
  assert.ok((await jan.evaluate(() => localStorage.getItem('plantDowntime.operatorRoster.v1') || '')).includes('Test Operator'), 'operator roster should persist locally');
  await jan.reload();
  await enterTeamPin(jan);
  assert.equal(await jan.locator('.operator-choice[data-operator="Test Operator"]').count(), 1, 'new operator should appear in the login list');
  await assignOperator(jan, '7777', 'Test Operator');
  assert.match(await jan.locator('#dayHeading').textContent(), /OPERATOR: Test Operator/, 'new operator PIN should authenticate');
  await jan.reload();
  await enterTeamPin(jan);
  await assignOperator(jan, '2666', 'Jan');
  await jan.locator('.nav[data-view=settings]').click();
  const testOperatorRow = jan.locator('#operatorRosterList > div').filter({ hasText: 'Test Operator' });
  assert.equal(await testOperatorRow.count(), 1, 'JAN admin roster should contain the added operator');
  await testOperatorRow.locator('button.danger').click();
  assert.ok(!(await jan.evaluate(() => localStorage.getItem('plantDowntime.operatorRoster.v1') || '')).includes('Test Operator'), 'JAN should be able to remove an operator');

  // STAFF: presence, station and photo management moved from Settings. Off-site affects plant assignment only, never login access.
  await jan.locator('.nav[data-view=staff]').click();
  assert.equal(await jan.locator('#staffRosterList > div').count(), 5, 'STAFF should contain the five canonical operators');
  for (const staffName of ['Gigi','Daz','Shayne']) assert.equal(await jan.locator('#staffRosterList > div').filter({hasText:staffName}).count(), 1, `${staffName} should be present in STAFF`);
  await jan.locator('#newStaffName').fill('Test Staff Only');
  await jan.locator('#addStaffBtn').click();
  assert.equal(await jan.locator('#staffRosterList > div').count(), 6, 'STAFF-only add should increase staff roster');
  assert.equal(await jan.locator('#operatorRosterList > div').count(), 5, 'STAFF-only member must not appear in app-user Settings');
  assert.equal(await jan.locator('.operator-choice[data-operator="Test Staff Only"]').count(), 0, 'STAFF-only member must not be an app login');
  const staffOnlyRow=jan.locator('#staffRosterList > div').filter({hasText:'Test Staff Only'});
  await staffOnlyRow.locator('button.danger').click();
  assert.equal(await jan.locator('#staffRosterList > div').count(), 5, 'STAFF-only remove should reduce staff roster');
  // Re-create the test app account before testing the separation between Settings and STAFF.
  await jan.locator('.nav[data-view=settings]').click();
  await jan.locator('#newOperatorName').fill('Test Operator');
  await jan.locator('#newOperatorInitialPin').fill('8888');
  await jan.locator('#addOperatorBtn').click();
  assert.match(await jan.locator('#operatorAdminMsg').textContent(), /User added/, 'test app user should be re-added');
  await jan.locator('.nav[data-view=staff]').click();
  await jan.locator('#newStaffName').fill('Test Operator');
  await jan.locator('#addStaffBtn').click();
  assert.equal(await jan.locator('#staffRosterList > div').count(), 6, 'app-user name can be added independently to STAFF');
  await jan.locator('.nav[data-view=settings]').click();
  const appUserRow=jan.locator('#operatorRosterList > div').filter({hasText:'Test Operator'});
  assert.equal(await appUserRow.count(), 1, 'test app user should still be present before removal');
  const appUserCountBeforeRemoval = await jan.locator('#operatorRosterList > div').count();
  await appUserRow.locator('button.danger').click();
  assert.equal(await jan.locator('#operatorRosterList > div').count(), appUserCountBeforeRemoval - 1, 'app-user removal should reduce user list only');
  await jan.locator('.nav[data-view=staff]').click();
  assert.equal(await jan.locator('#staffRosterList > div').filter({hasText:'Test Operator'}).count(), 1, 'removing app user must preserve independent STAFF membership');
  const gigiStaffRow=jan.locator('#staffRosterList > div').filter({hasText:'Gigi'});
  assert.equal(await gigiStaffRow.locator('input[type=checkbox]').count(), 1, 'STAFF should provide an on-site/off-site switch for Gigi');
  const stationSelect=gigiStaffRow.locator('select[aria-label^="Station assignment for"]');
  assert.equal(await stationSelect.count(), 1, 'station assignment control belongs in STAFF as a preset dropdown');
  assert.equal(await stationSelect.locator('option').count(), 7, 'station dropdown contains only unassigned plus six fixed presets');
  assert.equal(await stationSelect.isEnabled(), true, 'JAN can edit station assignments');
  assert.equal(await gigiStaffRow.locator('input[type=file]').count(), 1, 'operator photo upload belongs in STAFF');
  const janStaffRow=jan.locator('#staffRosterList > div').filter({hasText:'Jan'});
  assert.equal(await janStaffRow.locator('input[type=checkbox]').count(), 1, 'JAN also has an on-site/off-site switch');
  assert.equal(await janStaffRow.locator('input[type=file]').count(), 1, 'JAN photo control belongs in STAFF');

  await gigiStaffRow.locator('input[type=checkbox]').uncheck();
  assert.match(await jan.locator('#operatorAdminMsg').textContent(), /OFF SITE/, 'presence switch should update operator on-site state');
  assert.equal(await jan.locator('.operator-choice[data-operator="Gigi"]').isDisabled(), false, 'off-site status must not disable login');
  assert.equal(await gigiStaffRow.locator('select[aria-label^="Station assignment for"]').isDisabled(), true, 'off-site operator station control must be disabled');
  assert.equal(await gigiStaffRow.locator('select[aria-label^="Station assignment for"]').inputValue(), '', 'off-site toggle must clear station assignment');
  await jan.reload();
  await enterTeamPin(jan);
  await assignOperator(jan, '2666', 'Jan');
  assert.equal(await jan.locator('#operatorGate').isVisible(), false, 'Jan login should pass operator gate');
  await jan.locator('.nav[data-view=staff]').click();
  const reloadedGigiRow=jan.locator('#staffRosterList > div').filter({hasText:'Gigi'});
  await reloadedGigiRow.locator('input[type=checkbox]').check();
  assert.equal(await jan.locator('.operator-choice[data-operator="Gigi"]').isDisabled(), false, 'on-site status does not alter login eligibility');
  await jan.locator('.nav[data-view=settings]').click();
  assert.equal(await jan.locator('#operatorRosterList > div').count(), 5, 'Settings should list the five canonical app users and role privileges');
  assert.equal(await jan.locator('#operatorRosterList select[aria-label*="Gigi"]').count(), 1, 'Gigi role privilege should be editable in Settings');
  assert.equal(await jan.locator('#operatorRosterList select[aria-label*="Daz"]').count(), 1, 'Daz role privilege should be editable in Settings');
  assert.equal(await jan.locator('#operatorRosterList select[aria-label*="Jan"]').count(), 0, 'Jan remains the permanent Admin role');
  assert.equal(await jan.locator('#areasInput').count(), 0, 'plant preset management is removed from Settings');
  assert.equal(await jan.locator('#reasonsInput').count(), 0, 'reason preset management is removed from Settings');
  await jan.close();

// 2. Simulate a functioning Supabase SDK/client and verify cloud sync can initialize.
  const cloud = await newPage();
  await seedExistingUsers(cloud,{names:['Jan','Mick']});
  await cloud.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `window.__cloudPayload = { weeks: {}, areas: [], reasons: [], archive: [] }; window.__cloudRefreshReads = 0; window.supabase = { createClient: () => ({
      auth: { signInAnonymously: async () => ({ error: null }) },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => { window.__cloudRefreshReads++; return { data: { payload: window.__cloudPayload, updated_at: '2026-11-19T12:00:00.000Z' }, error: null }; } }) }),
        upsert: async () => ({ error: null })
      }),
      channel: () => ({ on: () => ({ subscribe: callback => { if (callback) callback('SUBSCRIBED'); return this; } }) })
    }) };`
  }));
  await cloud.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await enterTeamPin(cloud);
  await assignOperator(cloud, '1234');
  assert.match(await cloud.locator('#dayHeading').textContent(), /OPERATOR: Mick/, 'cloud-enabled session should still complete operator login');
  assert.equal(await cloud.locator('#manualRefreshBtn').count(), 1, 'cloud-connected standard roles should see manual Refresh');
  assert.match(await cloud.locator('#lastSync').textContent(), /Last successful refresh ·/, 'initial cloud load should record last successful refresh time');
  const cloudReadsBeforeManual = await cloud.evaluate(() => window.__cloudRefreshReads);
  await cloud.locator('#manualRefreshBtn').click();
  await cloud.waitForFunction(before => window.__cloudRefreshReads > before, cloudReadsBeforeManual, { timeout: 5000 });
  assert.equal(await cloud.locator('#manualRefreshBtn').isDisabled(), false, 'standard Refresh should re-enable after completion');
  assert.match(await cloud.locator('#manualRefreshBtn').textContent(), /REFRESH DATA/, 'standard Refresh should return to its idle label');


  // Overview cards and count reflect only on-site operators with assigned stations.
  const overview = await newPage();
  await overview.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: `(() => {
      const now=new Date(), monday=new Date(now.getFullYear(),now.getMonth(),now.getDate());
      monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
      const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
      const wk=iso(monday),dayIndex=Math.min((now.getDay()+6)%7,5);
      const days=Array.from({length:6},(_,i)=>{const d=new Date(monday);d.setDate(d.getDate()+i);return {date:iso(d),start:'06:30',stop:'17:00',entries:[]};});days[dayIndex].operator='Jan';
      window.__ovPayload={plantOn:true,operatorProfiles:{Jan:{station:'Station 1 · WOOD',onSite:true},Mick:{station:'Station 2 · WOOD',onSite:true},Daz:{station:'Station 3 · SCRAP',onSite:false},Gigi:{station:'',onSite:true},Shayne:{station:'Station 4 · SCRAP',onSite:true}},weeks:{[wk]:{days}},areas:[],reasons:[],archive:[]};
      window.supabase={createClient:()=>({auth:{signInAnonymously:async()=>({error:null})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{payload:window.__ovPayload},error:null})})})}),channel:()=>({on:()=>({subscribe:()=>({})})})})};
    })();` 
  }));
  await overview.goto('http://127.0.0.1:4173/plant-overview-preview.html',{waitUntil:'domcontentloaded'});
  await overview.waitForFunction(()=>document.querySelector('#liveDataBadge').textContent.includes('LIVE · MAIN TRACKER'),{timeout:5000});
  assert.equal(await overview.locator('.metrics .panel:nth-child(2) .label').textContent(),'OPERATORS','Overview metric label should change to Operators');
  assert.equal(await overview.locator('#operatorCount').textContent(),'3','count should reflect only assigned on-site operators');
  for (const name of ['JAN','MICK','SHAYNE']) assert.equal(await overview.locator(`[data-opprofile="${name}"]`).isVisible(),true,`${name} assigned and on-site should be visible`);
  for (const name of ['DAZ','GIGI']) assert.equal(await overview.locator(`[data-opprofile="${name}"]`).isVisible(),false,`${name} off-site or unassigned should be hidden`);
  assert.equal(await overview.locator('[data-stationassigned="3"]').textContent(),'UNASSIGNED','station grid must not list off-site operator');
  await overview.close();


  // 3. A cloud authentication rejection must never re-cover or re-lock the tracker.
  const cloudFailure = await newPage();
  await cloudFailure.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `window.supabase = { createClient: () => ({
      auth: { signInAnonymously: async () => ({ error: { message: 'simulated auth rejection' } }) }
    }) };`
  }));
  await cloudFailure.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await enterTeamPin(cloudFailure);
  assert.equal(await cloudFailure.locator('#operatorGate').isVisible(), true, 'cloud failure must leave operator gate usable');
  await assignOperator(cloudFailure, '2666');
  assert.equal(await cloudFailure.locator('#operatorGate').isVisible(), false, 'local access must survive cloud auth rejection');

  // Read Only – Management: new remote downtime records notify the manager, without write access.
  const management = await newPage();
  await seedExistingUsers(management,{names:['Jan','Mick'],privileges:{Mick:'Read Only - Management'}});
  await management.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.__managementPayload = { weeks: {}, areas: [], reasons: [], archive: [] }; window.__managementCallback = null; window.supabase = { createClient: () => ({ auth: { signInAnonymously: async () => ({ error: null }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { payload: window.__managementPayload }, error: null }) }) }), upsert: async () => ({ error: null }) }), channel: () => ({ on: (_event, _filter, callback) => { window.__managementCallback = callback; return { subscribe: cb => { if (cb) cb('SUBSCRIBED'); return this; } }; } }) }) };`
  }));
  await management.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await enterTeamPin(management);
  await assignOperator(management, '1234', 'Mick');
  await management.waitForTimeout(300); // Allow the login sync write to finish before the simulated realtime event.
  assert.equal(await management.locator('#addEntry').isDisabled(), true, 'management role must be read-only');
  await management.evaluate(() => {
    const now=new Date(), monday=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
    const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
    const weekKey=iso(monday),days=Array.from({length:6},(_,i)=>{const d=new Date(monday);d.setDate(d.getDate()+i);return {date:iso(d),start:'06:30',stop:'17:00',startLocked:false,entries:[]}});
    days[0].entries.push({area:'Feeder',reason:'New notification test',hours:1,minutes:5});
    const payload={weeks:{[weekKey]:{days}},areas:[],reasons:[],archive:[]};
    window.__managementCallback?.({new:{payload}});
  });
  await management.waitForFunction(() => document.body.textContent.includes('NEW DOWNTIME RECORDED'), { timeout: 5000 });
  assert.match(await management.locator('#managementNotificationHost').textContent(), /Feeder.*New notification test.*01:05/s, 'toast should show the new entry detail');
  // Spectator is no longer an app user and cannot be selected from the login gate.
  assert.equal(await management.locator('.operator-choice[data-operator="Spectator"]').count(),0,'Spectator is absent from app login choices');
  await management.close();
  assert.deepEqual(pageErrors, [], `unexpected browser JavaScript errors: ${pageErrors.join('; ')}`);
  console.log('PASS: JAN-only migration, retained JAN PIN, and STAFF profile preservation');
  console.log('PASS: independent app-user add/remove workflows after migration');
  console.log('PASS: seeded standard-user permissions and cloud sync regression cases');
  console.log('PASS: Spectator absent from login choices');
  console.log('PASS: no uncaught browser JavaScript errors');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
