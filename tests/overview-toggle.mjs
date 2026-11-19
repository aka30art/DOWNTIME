import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const indexHtml = await readFile(resolve('index.html'), 'utf8');
const overviewHtml = await readFile(resolve('plant-overview-preview.html'), 'utf8');
const server = createServer((req, res) => {
  const isOverview = req.url?.startsWith('/plant-overview-preview.html');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(isOverview ? overviewHtml : indexHtml);
});
await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(4174, '127.0.0.1', resolveListen); });
const browser = await chromium.launch({ headless: true });
try {
  async function open(operator) {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:4174/plant-overview-preview.html?operator=' + encodeURIComponent(operator), { waitUntil: 'domcontentloaded' });
    return page;
  }
  for (const operator of ['JAN', 'MICK']) {
    const page = await open(operator);
    const button = page.locator('#plantToggle');
    assert.equal(await button.isVisible(), true, operator + ' must have toggle access');
    assert.equal(await page.locator('#plantLabel').textContent(), 'PLANT ON');
    await button.click();
    assert.equal(await page.locator('#plantLabel').textContent(), 'PLANT OFF', operator + ' should switch plant OFF');
    assert.equal(await button.textContent(), 'TURN PLANT ON');
    await button.click();
    assert.equal(await page.locator('#plantLabel').textContent(), 'PLANT ON', operator + ' should switch plant ON');
    assert.equal(await button.textContent(), 'TURN PLANT OFF');
    await page.close();
  }
  for (const operator of ['GIGI', 'DAZ', 'SHAYNE', 'SPECTATOR', '']) {
    const page = await open(operator);
    assert.equal(await page.locator('#plantToggle').isVisible(), false, operator + ' should be read-only');
    assert.equal(await page.locator('#plantLabel').textContent(), 'PLANT ON', 'read-only view should show initial sample status');
    await page.close();
  }
  console.log('PASS: JAN and MICK can toggle Plant Overview ON/OFF; all other roles remain read-only.');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
