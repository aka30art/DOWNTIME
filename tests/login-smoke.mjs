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
