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
    await page.goto('http://127.0.0.1:4174/plant-overview-preview.html?operator=' + encodeURIComponent(operator) + '&test=1', { waitUntil: 'domcontentloaded' });
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
  // Exit navigation and fullscreen controls are present and functional.
  {
    const page=await open('JAN');
    assert.equal(await page.locator('#exitOverview').getAttribute('href'),'index.html','Exit Overview returns to homepage');
    const fs=page.locator('#overviewFullscreen');
    await fs.click();
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('overview-fullscreen')),true,'fullscreen turns on');
    assert.equal(await fs.textContent(),'⛶ EXIT FULL SCREEN','button label reflects fullscreen state');
    await fs.click();
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('overview-fullscreen')),false,'fullscreen turns off');
    await page.close();
  }
  // Overview plant alerts: OFF persists until ON, then ON alert auto-dismisses after ten seconds.
  {
    const page=await open('JAN');
    const plantButton=page.locator('#plantToggle');
    await plantButton.click(); // test mode changes ON -> OFF locally
    const offDialog=page.locator('#overviewPlantAlertHost [role="alertdialog"]');
    await offDialog.waitFor({state:'visible'});
    assert.equal(await offDialog.locator('h2').textContent(),'PLANT OFF','Overview should show OFF popup');
    assert.equal(await page.locator('#overviewPlantAlertHost').evaluate(el=>getComputedStyle(el).pointerEvents),'none','alert overlay must not block underlying plant controls');
    await plantButton.click(); // OFF -> ON clears OFF popup and displays ON popup
    const onDialog=page.locator('#overviewPlantAlertHost [role="alertdialog"]');
    await onDialog.waitFor({state:'visible'});
    assert.equal(await onDialog.locator('h2').textContent(),'PLANT ON','Overview should show ON popup after transition');
    await onDialog.waitFor({state:'detached',timeout:12000});
    assert.equal(await page.locator('#overviewPlantAlertHost').count(),0,'ON popup automatically closes after ten seconds');
    await page.close();
  }
  console.log('PASS: JAN/MICK plant toggle, restricted roles, exit Overview, fullscreen, and status popup auto-dismiss.');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
