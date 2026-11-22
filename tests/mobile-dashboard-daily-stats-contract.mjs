import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const source = await readFile('index.html', 'utf8');

// Contract checks: preserve the identity source and existing privilege boundaries.
assert.match(source, /function renderActiveAccountIndicator\(\)[\s\S]*?name\.textContent=username/);
assert.match(source, /function render\(\)\{renderActiveAccountIndicator\(\);/);
assert.match(source, /const allowed=!!centralUser&&centralReady&&permission\('canControlPlantPower'\)/);
assert.match(source, /if\(!centralReady\|\|!permission\('canControlPlantPower'\)\|\|plantPowerBusy\)return/);
assert.doesNotMatch(source, /activeOperator==='Jan'\|\|activeOperator==='Mick'/);
assert.doesNotMatch(source, /activeOperator!=='Jan'&&activeOperator!=='Mick'/);
assert.match(source, /id="menuAccountName"/);
assert.match(source, /id="dailyStatsHeading"[^>]*>DAILY STATS</);
assert.match(source, /\$\('topWeekDown'\)\.textContent=fmt\(c\.down\)/);
assert.match(source, /\$\('topWeekPct'\)\.textContent=pct\(c\.downPct\)/);
assert.match(source, /\$\('topWeekRunPct'\)\.textContent=pct\(c\.runPct\)/);
assert.match(source, /\$\('dayDate'\)\.disabled=!!d\.startLocked/);
assert.match(source, /\$\('plantStart'\)\.disabled=!!d\.startLocked/);
assert.match(source, /\$\('plantStop'\)\.disabled=!!d\.startLocked/);
assert.match(source, /if\(operatorReadOnly\|\|day\(\)\.startLocked\)\{e\.target\.value=day\(\)\.date;return\}/);
assert.match(source, /if\(operatorReadOnly\|\|day\(\)\.startLocked\)\{e\.target\.value=day\(\)\.stop;return\}/);
assert.match(source, /if\(!isAdmin\(\)\|\|!day\(\)\.startLocked\)return/);
assert.match(source, /permission\('canManageSettings'\)&&!!day\(\)\.startLocked/);
assert.match(source, /document\.querySelectorAll\('main input,main select,main textarea'\)[\s\S]*?\['dayDate','plantStart','plantStop'\]\.forEach\(id=>\{const el=\$\(id\);if\(el\)el\.disabled=operatorReadOnly\|\|!!day\(\)\.startLocked\}\);if\(\$\('breakExcluded'\)\)\$\('breakExcluded'\)\.disabled=true;/);
assert.match(source, /LOCK DAILY SETUP/);
assert.doesNotMatch(source, />\s*🔒 LOCK START\s*</);
assert.doesNotMatch(source, /class="menu-utilities"[\s\S]{0,500}id="plantOperatorToggle"/);

const html = source.replace(/<script\b[\s\S]*?<\/script>/gi, '');
const outputDir = 'artifacts/mobile-dashboard';
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    for (const id of ['authGate', 'operatorGate', 'spectatorView']) {
      const node = document.getElementById(id);
      if (node) node.style.setProperty('display', 'none', 'important');
    }
    const nav = document.querySelector('.nav-menu');
    if (nav) nav.open = true;
    const account = document.getElementById('menuAccount');
    const accountName = document.getElementById('menuAccountName');
    account.hidden = false;
    accountName.textContent = 'DEV';
    const plantWrap = document.getElementById('plantStatusControls');
    plantWrap.style.setProperty('display', 'flex', 'important');
    const plantButton = document.getElementById('plantOperatorToggle');
    plantButton.style.setProperty('display', 'inline-flex', 'important');
    const daily = document.querySelector('details.day-setup');
    daily.open = true;
  });

  for (const width of [280, 320, 360, 375, 390, 414, 430, 600, 601, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const result = await page.evaluate(() => {
      const rect = element => {
        const r = element.getBoundingClientRect();
        return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height };
      };
      const stats = document.querySelector('.daily-stats');
      const kpis = document.querySelector('.daily-stats .weeklyKpis');
      const plant = document.getElementById('plantStatusControls');
      const plantButton = document.getElementById('plantOperatorToggle');
      const layout = document.querySelector('#weekly > .layout');
      const account = document.getElementById('menuAccount');
      const lock = document.getElementById('lockStartBtn');
      const lockAction = lock.closest('.lock-action');
      return {
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        stats:rect(stats), kpis:rect(kpis), plant:rect(plant),
        plantButton:rect(plantButton), layout:rect(layout),
        account:rect(account), accountVisible:account.getClientRects().length>0,
        accountName:document.getElementById('menuAccountName').textContent,
        lock:rect(lock), lockAction:rect(lockAction)
      };
    });
    assert.ok(result.documentWidth <= width + 1,
      'Dashboard has horizontal overflow at '+width+'px: '+JSON.stringify(result));
    assert.ok(result.accountVisible && result.account.width > 0,
      'Logged-in account marker is not laid out in the menu at '+width+'px');
    assert.equal(result.accountName, 'DEV');
    assert.ok(result.stats.bottom <= result.plant.top + 1,
      'Plant status row must follow Daily Stats at '+width+'px: '+JSON.stringify(result));
    assert.ok(result.plant.bottom <= result.layout.top + 1,
      'Plant status row must precede Day to Day layout at '+width+'px: '+JSON.stringify(result));
    assert.ok(result.plantButton.width > 0 && result.plantButton.left >= -1 &&
      result.plantButton.right <= width + 1,
      'Plant status button crosses the viewport at '+width+'px: '+JSON.stringify(result));
    const plantCenter = (result.plantButton.left + result.plantButton.right) / 2;
    const rowCenter = (result.plant.left + result.plant.right) / 2;
    assert.ok(Math.abs(plantCenter-rowCenter) < 2,
      'Plant status button must be centered at '+width+'px: '+JSON.stringify(result));
    assert.ok(result.lock.width > 0 && result.lock.left >= -1 && result.lock.right <= width + 1,
      'Daily setup lock button crosses the viewport at '+width+'px: '+JSON.stringify(result));
    const lockCenter = (result.lock.left + result.lock.right) / 2;
    const actionCenter = (result.lockAction.left + result.lockAction.right) / 2;
    assert.ok(Math.abs(lockCenter-actionCenter) < 2,
      'Daily setup lock action must be centered at '+width+'px: '+JSON.stringify(result));
    if ([320,390,600,768,1280].includes(width)) {
      await page.screenshot({ path:outputDir+'/dashboard-'+width+'px.png', fullPage:false, animations:'disabled' });
    }
    console.log('PASS: Daily Stats, relocated plant control, account identity and centered daily lock at '+width+'px');
  }
  console.log('PASS: identity, plant-control privilege, daily-stat calculation, and daily-lock contracts.');
  console.log('Mobile dashboard screenshots saved to '+outputDir);
} finally {
  await browser.close();
}
