import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { chromium } from 'playwright';

const html = await readFile(resolve('index.html'), 'utf8');
const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]).filter(source => source.trim());
inlineScripts.forEach((source, index) => new vm.Script(source, { filename: `inline-script-${index + 1}.js` }));
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(html);
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
  await page.locator('#teamPin').fill('0123');
  await page.locator('#unlockBtn').click();
  await page.waitForFunction(() => document.querySelector('#authGate').style.display === 'none');
  await page.waitForFunction(() => document.querySelector('#operatorGate').style.display === 'grid');
}
async function assignOperator(page, pin = '2666', operator = (pin === '1234' ? 'Mick' : 'Jan')) {
  await page.locator(`.operator-choice[data-operator="${operator}"]`).click();
  await page.locator('#operatorGatePin').fill(pin);
  await page.locator('#operatorContinue').click();
  await page.waitForFunction(() => document.querySelector('#operatorGate').style.display === 'none');
  await page.waitForFunction(() => /LOCAL MODE|LIVE · synced/.test(document.querySelector('#cloudStatus').textContent), { timeout: 15000 });
}

try {
  // 1. The app must render and accept the team PIN without making any vendor request at startup.
  const offline = await newPage();
  const vendorRequests = [];
  offline.on('request', request => {
    if (/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/.test(request.url())) vendorRequests.push(request.url());
  });
  await offline.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 5000 });
  assert.equal(await offline.locator('#authGate').isVisible(), true, 'team PIN gate should be visible at startup');
  assert.equal(vendorRequests.length, 0, 'third-party libraries must not block application startup');
  await offline.locator('#teamPin').fill('9999');
  await offline.locator('#unlockBtn').click();
  console.log('DEBUG wrong PIN message:', JSON.stringify(await offline.locator('#authMsg').textContent()), 'pageErrors:', JSON.stringify(pageErrors), 'consoleErrors:', JSON.stringify(browserMessages));
  assert.match(await offline.locator('#authMsg').textContent(), /Incorrect PIN/, 'wrong team PIN should be rejected');
  assert.equal(await offline.locator('#authGate').isVisible(), true, 'wrong PIN must not unlock the app');

  // Simulate a blocked Supabase CDN. The app must still open immediately in local mode.
  await offline.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.abort());
  await enterTeamPin(offline);
  assert.equal(await offline.locator('.operator-choice').count(), 4, 'operator account buttons should be present');
  assert.equal(await offline.locator('#spectatorBtn').count(), 0, 'main gate should not contain spectator shortcut');
  await assignOperator(offline, '2666');
  assert.equal(await offline.locator('#operatorGate').isVisible(), false, 'operator gate should close after a valid operator PIN');
  assert.match(await offline.locator('#dayHeading').textContent(), /OPERATOR: Jan/, 'assigned operator should appear in the tracker');
  const saved = await offline.evaluate(() => localStorage.getItem('plantDowntime.v1'));
  assert.ok(saved && saved.includes('Jan'), 'operator assignment should be persisted locally');

    // Dowie is a restricted read-only operator, while JAN has administrator-only controls.
  const dowie = await newPage();
  await dowie.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.abort());
  await dowie.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await enterTeamPin(dowie);
  await assignOperator(dowie, '999', 'Dowie');
  assert.match(await dowie.locator('#dayHeading').textContent(), /OPERATOR: Dowie/, 'Dowie should log in with PIN 999');
  assert.equal(await dowie.locator('.nav[data-view=settings]').isVisible(), true, 'Dowie must be able to reach personal PIN settings');
  assert.equal(await dowie.locator('#addEntry').isDisabled(), true, 'Dowie cannot add downtime entries');
  assert.equal(await dowie.locator('#plantStop').isDisabled(), true, 'Dowie cannot change plant stop time');
  assert.equal(await dowie.locator('#exportBtn').isDisabled(), true, 'Dowie cannot create shared PDF records');
  await dowie.locator('.nav[data-view=settings]').click();
  assert.equal(await dowie.locator('#settingsPlantAdminControls').isVisible(), false, 'Dowie cannot change plant presets');
  assert.equal(await dowie.locator('#settingsAdminControls').isVisible(), false, 'Dowie cannot access operator administration or tracker settings');
  await dowie.locator('#currentOperatorPin').fill('999');
  await dowie.locator('#newOperatorPin').fill('888');
  await dowie.locator('#confirmOperatorPin').fill('888');
  await dowie.locator('#changeOperatorPin').click();
  assert.match(await dowie.locator('#pinChangeMsg').textContent(), /PIN changed successfully/, 'Dowie may change only their own PIN');
  await dowie.reload();
  await enterTeamPin(dowie);
  await assignOperator(dowie, '888', 'Dowie');
  assert.match(await dowie.locator('#dayHeading').textContent(), /OPERATOR: Dowie/, 'Dowie PIN change must work on next login');
  assert.equal(await dowie.locator('#addEntry').isDisabled(), true, 'Dowie remains read-only after PIN change');
  await dowie.close();

  // Lee is a default roster operator with PIN 9991 and Dowie's read-only restrictions.
  const lee = await newPage();
  await lee.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.abort());
  await lee.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await enterTeamPin(lee);
  assert.equal(await lee.locator('.operator-choice[data-operator="Lee"]').count(), 1, 'Lee should be present in default operator list');
  await assignOperator(lee, '9991', 'Lee');
  assert.match(await lee.locator('#dayHeading').textContent(), /OPERATOR: Lee/, 'Lee should authenticate with default PIN 9991');
  assert.equal(await lee.locator('#addEntry').isDisabled(), true, 'Lee cannot add downtime entries');
  assert.equal(await lee.locator('#plantStop').isDisabled(), true, 'Lee cannot change plant stop time');
  assert.equal(await lee.locator('#exportBtn').isDisabled(), true, 'Lee cannot create shared PDF records');
  await lee.locator('.nav[data-view=settings]').click();
  assert.equal(await lee.locator('#settingsPlantAdminControls').isVisible(), false, 'Lee cannot change plant presets');
  assert.equal(await lee.locator('#settingsAdminControls').isVisible(), false, 'Lee cannot access admin settings');
  await lee.close();

  const jan = await newPage();
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
  assert.equal(await jan.locator('#settingsAdminControls').isVisible(), true, 'JAN must have editable plant settings');
  await jan.locator('#newOperatorName').fill('Test Operator');
  await jan.locator('#newOperatorInitialPin').fill('7777');
  await jan.locator('#addOperatorBtn').click();
  assert.match(await jan.locator('#operatorAdminMsg').textContent(), /Operator added/, 'JAN should be able to add an operator');
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
  await testOperatorRow.locator('button').click();
  assert.ok(!(await jan.evaluate(() => localStorage.getItem('plantDowntime.operatorRoster.v1') || '')).includes('Test Operator'), 'JAN should be able to remove an operator');
  await jan.close();

  // PIN change must validate the current PIN and work on the next login.
  const pinChange = await newPage();
  await pinChange.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.abort());
  await pinChange.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await enterTeamPin(pinChange);
  await assignOperator(pinChange, '1234', 'Mick');
  await pinChange.locator('.nav[data-view=settings]').click();
  await pinChange.locator('#currentOperatorPin').fill('1234');
  await pinChange.locator('#newOperatorPin').fill('2666');
  await pinChange.locator('#confirmOperatorPin').fill('2666');
  await pinChange.locator('#changeOperatorPin').click();
  assert.match(await pinChange.locator('#pinChangeMsg').textContent(), /Choose a PIN not used by another account/, 'operator PIN change must reject another account’s PIN');
  await pinChange.locator('#currentOperatorPin').fill('1234');
  await pinChange.locator('#newOperatorPin').fill('5678');
  await pinChange.locator('#confirmOperatorPin').fill('5678');
  await pinChange.locator('#changeOperatorPin').click();
  assert.match(await pinChange.locator('#pinChangeMsg').textContent(), /PIN changed successfully/, 'operator PIN should be changed');
  await pinChange.reload();
  await enterTeamPin(pinChange);
  await pinChange.locator('.operator-choice[data-operator="Mick"]').click();
  await pinChange.locator('#operatorGatePin').fill('5678');
  await pinChange.locator('#operatorContinue').click();
  await pinChange.waitForFunction(() => document.querySelector('#operatorGate').style.display === 'none');
  assert.match(await pinChange.locator('#dayHeading').textContent(), /OPERATOR: Mick/, 'changed PIN should work on the next login');
  await pinChange.close();

// 2. Simulate a functioning Supabase SDK/client and verify cloud sync can initialize.
  const cloud = await newPage();
  await cloud.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `window.supabase = { createClient: () => ({
      auth: { signInAnonymously: async () => ({ error: null }) },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        upsert: async () => ({ error: null })
      }),
      channel: () => ({ on: () => ({ subscribe: callback => { if (callback) callback('SUBSCRIBED'); return this; } }) })
    }) };`
  }));
  await cloud.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await enterTeamPin(cloud);
  await assignOperator(cloud, '1234');
  assert.match(await cloud.locator('#dayHeading').textContent(), /OPERATOR: Mick/, 'cloud-enabled session should still complete operator login');

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

  // Operator permission regression checks above run before the secure Spectator integration checks below.
  // 4. Spectator entry uses the secure Edge Function, a non-persistent anonymous session, and server-side refresh polling.
  const spectator = await newPage();
  await spectator.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `(() => {
      const now = new Date();
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const iso = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
      const weekKey = iso(monday);
      const dayIndex = Math.min((now.getDay() + 6) % 7, 5);
      const days = Array.from({length: 6}, (_, i) => {
        const date = new Date(monday); date.setDate(date.getDate() + i);
        return { date: iso(date), start: '06:30', stop: '17:00', entries: [] };
      });
      days[dayIndex].operator = 'Supervisor Test';
      days[dayIndex].entries = [{ area: 'Feeder', reason: 'Spectator test reason', hours: 1, minutes: 15 }];
      const payload = { weeks: { [weekKey]: { days } }, areas: [], reasons: [], archive: [] };
      window.__spectatorCalls = { auth: 0, secureAuth: 0, reads: 0, writes: 0, invocations: 0, options: null, payload };
      window.supabase = {
        createClient: (_url, _key, options = {}) => {
          const secure = options.auth?.persistSession === false;
          if (secure) window.__spectatorCalls.options = options;
          return {
            auth: { signInAnonymously: async () => {
              if (secure) window.__spectatorCalls.secureAuth++;
              else window.__spectatorCalls.auth++;
              return { error: null, data: { session: { access_token: secure ? 'spectator-jwt' : 'tracker-jwt' } } };
            } },
            from: () => ({
              select: () => ({ eq: () => ({ maybeSingle: async () => {
                window.__spectatorCalls.reads++;
                return { data: { payload: window.__spectatorCalls.payload, updated_at: '2026-11-19T03:00:00.000Z' }, error: null };
              }})}),
              upsert: async () => { window.__spectatorCalls.writes++; return { error: null }; },
              insert: async () => { window.__spectatorCalls.writes++; return { error: null }; },
              update: async () => { window.__spectatorCalls.writes++; return { error: null }; },
              delete: async () => { window.__spectatorCalls.writes++; return { error: null }; }
            }),
            functions: { invoke: async (name, options) => {
              window.__spectatorCalls.invocations++;
              if (name !== 'spectator-read' || options.body.access_code !== 'TEST-SUPERVISOR-ONLY')
                return { data: null, error: { message: 'Access denied' } };
              return { data: { payload: window.__spectatorCalls.payload, updated_at: new Date().toISOString() }, error: null };
            } },
            channel: () => ({ on: () => ({ subscribe: callback => { if (callback) callback('SUBSCRIBED'); return this; } }) })
          };
        }
      };
    })();`
  }));
  await spectator.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await enterTeamPin(spectator);
  assert.equal(await spectator.locator('#spectatorBtn').count(), 0, 'main gate must not contain a separate spectator shortcut');
  await spectator.locator('.operator-choice[data-operator="Spectator"]').click();
  await spectator.locator('#operatorGatePin').fill('WRONG');
  await spectator.locator('#operatorContinue').click();
  await spectator.waitForFunction(() => /Access denied|invalid/i.test(document.querySelector('#operatorMsg').textContent), { timeout: 5000 });
  const readsBeforeSpectator = await spectator.evaluate(() => window.__spectatorCalls.reads);
  const writesBeforeSpectator = await spectator.evaluate(() => window.__spectatorCalls.writes);
  const localBeforeSpectator = await spectator.evaluate(() => localStorage.getItem('plantDowntime.v1'));
  assert.equal(await spectator.locator('#operatorGate').isVisible(), true, 'wrong supervisor code must not open spectator mode');
  await spectator.locator('#operatorGatePin').fill('TEST-SUPERVISOR-ONLY');
  await spectator.locator('#operatorContinue').click();
  await spectator.waitForFunction(() => document.querySelector('#spectatorView').style.display === 'block' || (document.querySelector('#operatorMsg').textContent && !document.querySelector('#operatorMsg').textContent.includes('Verifying supervisor access')), { timeout: 10000 });
  const spectatorLoginState = await spectator.evaluate(() => ({display: document.querySelector('#spectatorView').style.display, message: document.querySelector('#operatorMsg').textContent}));
  assert.equal(spectatorLoginState.display, 'block', `secure Spectator login failed: ${spectatorLoginState.message}`);
  await spectator.waitForFunction(() => document.querySelector('#spectatorView').textContent.includes('LIVE · CONNECTED'));
  assert.equal(await spectator.locator('#operatorGate').isVisible(), false, 'Spectator login should bypass operator assignment');
  assert.equal(await spectator.locator('.shell').isVisible(), false, 'operator workspace must remain hidden in Spectator mode');
  assert.match(await spectator.locator('#spectatorView').textContent(), /Supervisor Test/, 'Spectator view should display operator records');
  assert.match(await spectator.locator('#spectatorView').textContent(), /Spectator test reason/, 'Spectator view should display downtime records');
  assert.equal(await spectator.locator('#spectatorView button, #spectatorView input, #spectatorView select').count(), 0, 'Spectator view must contain no editing controls');
  const spectatorSecurity = await spectator.evaluate(() => ({
    authCalls: window.__spectatorCalls.auth,
    secureAuthCalls: window.__spectatorCalls.secureAuth,
    reads: window.__spectatorCalls.reads,
    writes: window.__spectatorCalls.writes,
    invocations: window.__spectatorCalls.invocations,
    persistSession: window.__spectatorCalls.options?.auth?.persistSession,
    localState: localStorage.getItem('plantDowntime.v1')
  }));
  assert.equal(spectatorSecurity.secureAuthCalls, 2, 'Each rejected and accepted Spectator login attempt should use a fresh non-persistent anonymous JWT');
  assert.equal(spectatorSecurity.writes, writesBeforeSpectator, 'Spectator must not issue database writes');
  assert.equal(spectatorSecurity.reads, readsBeforeSpectator, 'Spectator must not read the shared table directly');
  assert.equal(spectatorSecurity.persistSession, false, 'Spectator session must not persist');
  assert.equal(spectatorSecurity.localState, localBeforeSpectator, 'Spectator must not change local tracker state');
  await spectator.evaluate(() => {
    const payload = JSON.parse(JSON.stringify(window.__spectatorCalls.payload));
    const week = Object.values(payload.weeks)[0];
    const day = week.days.find(d => d.operator === 'Supervisor Test');
    day.operator = 'Live Update Test';
    window.__spectatorCalls.payload = payload;
  });
  await spectator.waitForFunction(() => document.querySelector('#spectatorView').textContent.includes('Live Update Test'), { timeout: 7000 });
  const postRefreshCalls = await spectator.evaluate(() => window.__spectatorCalls.invocations);
  assert.ok(postRefreshCalls >= 3, 'Spectator should re-fetch shared state through the secure endpoint');
  assert.deepEqual(pageErrors, [], `unexpected browser JavaScript errors: ${pageErrors.join('; ')}`);
  console.log('PASS: team and operator account gates');
  console.log('PASS: local-only operator login');
  console.log('PASS: JAN-only admin panel and operator creation');
  console.log('PASS: operator PIN change and relogin');
  console.log('PASS: Dowie read-only restrictions');
  console.log('PASS: secure Spectator endpoint and five-second refresh');
  console.log('PASS: no uncaught browser JavaScript errors');
  assert.deepEqual(pageErrors, [], `unexpected browser JavaScript errors: ${pageErrors.join('; ')}`);
  console.log('PASS: startup is independent of external CDNs');
  console.log('PASS: wrong and correct team PIN handling');
  console.log('PASS: local-only login when Supabase is blocked');
  console.log('PASS: operator assignment and local persistence');
  console.log('PASS: successful Supabase sign-in and sync initialization');
  console.log('PASS: cloud auth failure does not block local access');
  console.log('PASS: no uncaught browser JavaScript errors');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
