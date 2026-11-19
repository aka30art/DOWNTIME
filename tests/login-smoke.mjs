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
async function assignOperator(page, pin = '2666') {
  await page.locator('#operatorGatePin').fill(pin);
  await page.locator('#operatorContinue').click();
  await page.waitForFunction(() => document.querySelector('#operatorGate').style.display === 'none');
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
  await offline.waitForFunction(() => document.querySelector('#cloudStatus').textContent.includes('LOCAL MODE'));
  await assignOperator(offline, '2666');
  assert.equal(await offline.locator('#operatorGate').isVisible(), false, 'operator gate should close after a valid operator PIN');
  assert.match(await offline.locator('#dayHeading').textContent(), /OPERATOR: Jan/, 'assigned operator should appear in the tracker');
  const saved = await offline.evaluate(() => localStorage.getItem('plantDowntime.v1'));
  assert.ok(saved && saved.includes('Jan'), 'operator assignment should be persisted locally');

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
  await cloud.waitForFunction(() => document.querySelector('#cloudStatus').textContent.includes('LIVE'));
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
  await cloudFailure.waitForFunction(() => document.querySelector('#cloudStatus').textContent.includes('LOCAL MODE'));
  assert.equal(await cloudFailure.locator('#operatorGate').isVisible(), true, 'cloud failure must leave operator gate usable');
  await assignOperator(cloudFailure, '2666');
  assert.equal(await cloudFailure.locator('#operatorGate').isVisible(), false, 'local access must survive cloud auth rejection');

  // 4. Secure spectator mode: no direct DB reads, no writes, auth session not persisted; backend function validates supervisor code.
  const spectator = await newPage();
  const testSupervisorCode = 'TEST-SUPERVISOR-ONLY';
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
      window.__spectatorCalls = { auth: 0, writes: 0, reads: 0, invocations: 0, options: null, payload };
      window.supabase = {
        createClient: (_url, _key, options = {}) => {
          const spectatorClient = options.auth?.persistSession === false;
          if (spectatorClient) window.__spectatorCalls.options = options;
          return {
            auth: { signInAnonymously: async () => {
              if (spectatorClient) window.__spectatorCalls.auth++;
              return { error: null, data: { session: { access_token: 'test-jwt' } } };
            } },
            from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
              if (spectatorClient) window.__spectatorCalls.reads++;
              return { data: { payload, updated_at: '2026-11-19T03:00:00.000Z' }, error: null };
            }})})}),
            functions: { invoke: async (name, options) => {
              window.__spectatorCalls.invocations++;
              if (name !== 'spectator-read' || options.body.access_code !== testSupervisorCode)
                return { data: null, error: { message: 'Access denied' } };
              return { data: { payload, updated_at: '2026-11-19T03:00:00.000Z' }, error: null };
            }},
            upsert: async () => { if (spectatorClient) window.__spectatorCalls.writes++; return { error: null }; },
            insert: async () => { if (spectatorClient) window.__spectatorCalls.writes++; return { error: null }; },
            update: async () => { if (spectatorClient) window.__spectatorCalls.writes++; return { error: null }; },
            delete: async () => { if (spectatorClient) window.__spectatorCalls.writes++; return { error: null }; },
            channel: () => ({ on: () => ({ subscribe: () => ({}) }) })
          };
        }
      };
    })(); `
  }));
  await spectator.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await spectator.locator('#spectatorBtn').click();
  assert.equal(await spectator.locator('#spectatorAccessCode').isVisible(), true, 'spectator access code field should appear');
  await spectator.locator('#spectatorAccessCode').fill('WRONG');
  await spectator.locator('#spectatorBtn').click();
  await spectator.waitForFunction(() => /Access code rejected|unable to open/i.test(document.querySelector('#authMsg').textContent), { timeout: 5000 });
  assert.match(await spectator.locator('#authMsg').textContent(), /Access code rejected|unable to open/i, 'wrong supervisor code must be rejected');
  assert.equal(await spectator.locator('#authGate').isVisible(), true, 'wrong supervisor code must not open spectator mode');
  await spectator.locator('#spectatorAccessCode').fill(testSupervisorCode);
  await spectator.locator('#spectatorBtn').click();
  await spectator.waitForFunction(() => document.querySelector('#spectatorView').style.display === 'block');
  await spectator.waitForFunction(() => document.querySelector('#spectatorView').textContent.includes('LIVE · CONNECTED'));
  assert.equal(await spectator.locator('#operatorGate').isVisible(), false, 'spectator must bypass operator assignment/login');
  assert.equal(await spectator.locator('.shell').isVisible(), false, 'operator workspace must remain hidden in spectator mode');
  assert.match(await spectator.locator('#spectatorView').textContent(), /Supervisor Test/, 'spectator view should display assigned operator');
  assert.match(await spectator.locator('#spectatorView').textContent(), /Spectator test reason/, 'spectator view should display downtime records');
  assert.equal(await spectator.locator('#spectatorView button, #spectatorView input, #spectatorView select').count(), 0, 'spectator view must contain no editing controls');
  const spectatorSecurity = await spectator.evaluate(() => ({
    authCalls: window.__spectatorCalls.auth,
    writes: window.__spectatorCalls.writes,
    directReads: window.__spectatorCalls.reads,
    functionCalls: window.__spectatorCalls.invocations,
    persistSession: window.__spectatorCalls.options?.auth?.persistSession,
    localState: localStorage.getItem('plantDowntime.v1')
  }));
  assert.equal(spectatorSecurity.authCalls, 2, 'spectator attempts should use anonymous JWT for Edge Function invocation');
  assert.equal(spectatorSecurity.writes, 0, 'spectator must not issue database writes');
  assert.equal(spectatorSecurity.directReads, 0, 'spectator must not query the table directly');
  assert.ok(spectatorSecurity.functionCalls >= 2, 'spectator should call the secure endpoint for rejected and accepted code attempts');
  assert.equal(spectatorSecurity.persistSession, false, 'spectator client must not persist auth session');
  assert.equal(spectatorSecurity.localState, null, 'spectator must not create or overwrite local tracker state');
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
