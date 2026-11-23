import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const source = await readFile('index.html', 'utf8');
// Static visual QA only: remove the application script so no central request,
// authentication, browser storage write, or operational action can occur.
const html = source.replace(/<script\b[\s\S]*?<\/script>/gi, '');
const outputDir = 'artifacts/stage-1';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    for (const id of ['authGate', 'operatorGate', 'spectatorView']) {
      const node = document.getElementById(id);
      if (node) node.style.setProperty('display', 'none', 'important');
    }

    // Synthetic fixture values used only by this screenshot test. These are
    // not committed into the application's default state or central bank.
    const metrics = {
      topWeekDown: '04h 42m',
      topWeekPct: '10.8%',
      topWeekRunPct: '89.2%',
      scheduled: '09h 00m',
      net: '07h 45m',
      downtime: '00h 31m',
      running: '07h 14m',
      downPct: '6.7%',
      runPct: '93.3%',
      weekDown: '04h 42m',
      weekPct: '10.8%',
      weekNet: '43h 10m',
      weekRunPct: '89.2%',
      topCause: 'Other',
      topCauseShare: '19.1%',
      weekChange: '−12.4%',
      prevWeekDown: '05h 22m',
      weeklyInsight: 'Test fixture · visual layout only'
    };
    for (const [id, value] of Object.entries(metrics)) {
      const node = document.getElementById(id);
      if (node) node.textContent = value;
    }

    document.getElementById('dayHeading').textContent = 'MONDAY';
    document.getElementById('dayTabs').innerHTML = [
      ['MON', '16/11', '00h 31m'], ['TUE', '17/11', '00h 11m'],
      ['WED', '18/11', '01h 51m'], ['THU', '19/11', '00h 49m'],
      ['FRI', '20/11', '01h 13m'], ['SAT', '21/11', '00h 07m']
    ].map(([day, date, total], i) =>
      '<button class="day ' + (i === 0 ? 'selected' : '') + '" type="button">' +
      day + '<small>' + date + '</small><small>' + total + '</small></button>'
    ).join('');

    document.getElementById('entriesBody').innerHTML =
      '<tr class="entrycompact"><td colspan="5"><button class="entrytile" type="button">' +
      '<span class="entrymain"><b>Picking line</b><small>Clean up + operator late</small></span>' +
      '<span class="entryduration">00:18</span></button></td></tr>' +
      '<tr class="entrycompact"><td colspan="5"><button class="entrytile" type="button">' +
      '<span class="entrymain"><b>Sorting belt</b><small>Blockage · oversize material</small></span>' +
      '<span class="entryduration">00:13</span></button></td></tr>';

    document.getElementById('weekBody').innerHTML = [
      ['Monday', 'Jan', '16 Nov 2026', '06:30', '16:00', '00h 31m', '6.7%', '93.3%'],
      ['Tuesday', 'Mick', '17 Nov 2026', '06:30', '16:00', '00h 11m', '2.4%', '97.6%'],
      ['Wednesday', 'Gigi', '18 Nov 2026', '06:30', '16:00', '01h 51m', '23.9%', '76.1%'],
      ['Thursday', 'Daz', '19 Nov 2026', '06:30', '16:00', '00h 49m', '10.5%', '89.5%'],
      ['Friday', 'Shayne', '20 Nov 2026', '06:30', '16:00', '01h 13m', '15.7%', '84.3%'],
      ['Saturday', 'Jan', '21 Nov 2026', '08:00', '12:45', '00h 07m', '2.6%', '97.4%']
    ].map(row => '<tr>' + row.map(value => '<td>' + value + '</td>').join('') + '</tr>').join('');

    document.getElementById('weekLabel').textContent = '16 Nov 2026 – 21 Nov 2026';
    document.getElementById('onDuty').textContent = 'OPERATOR ON DUTY TODAY · JAN';
    document.getElementById('cloudStatus').textContent = 'CENTRAL · SYNCED';
  });

  const widths = [320, 390, 600, 601, 768, 1280];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      side: document.querySelector('.side').getBoundingClientRect().toJSON(),
      menu: document.querySelector('.nav-menu').getBoundingClientRect().toJSON(),
      kpis: document.querySelector('.weeklyKpis').getBoundingClientRect().toJSON(),
      dayPanel: document.querySelector('.day-setup-panel').getBoundingClientRect().toJSON(),
      entries: document.querySelector('.downtime-entry-panel').getBoundingClientRect().toJSON(),
      daily: document.querySelector('.daily-summary-panel').getBoundingClientRect().toJSON(),
      weekly: document.querySelector('.unified-weekly-panel').getBoundingClientRect().toJSON()
    }));
    assert.ok(metrics.document <= width + 1,
      'Stage 1 migrated screen overflows at ' + width + 'px: ' + JSON.stringify(metrics));
    assert.ok(metrics.body <= width + 1,
      'Stage 1 body overflows at ' + width + 'px: ' + JSON.stringify(metrics));
    for (const key of ['menu', 'kpis', 'dayPanel', 'entries', 'daily', 'weekly']) {
      assert.ok(metrics[key].width > 0, key + ' missing at ' + width + 'px');
      assert.ok(metrics[key].left >= -1 && metrics[key].right <= width + 1,
        key + ' outside viewport at ' + width + 'px');
    }
    if ([320, 390, 600, 601, 768, 1280].includes(width)) {
      await page.screenshot({
        path: outputDir + '/stage-1-migrated-ui-' + width + 'px.png',
        fullPage: width === 390,
        animations: 'disabled'
      });
    }
    console.log('PASS: migrated UI structure and viewport fit at ' + width + 'px');
  }

  // Menu defaults closed, then exposes all retained navigation and system actions.
  const menu = page.locator('.nav-menu');
  assert.equal(await menu.evaluate(node => node.open), false, 'Menu must start collapsed');
  await menu.locator(':scope > summary').click();
  assert.equal(await page.locator('.nav-items > .nav').count(), 6, 'All remaining navigation choices stay in the main menu after STAFF moves into Settings');
  assert.equal(await page.locator('[data-settings-open="staff"]').count(), 1, 'STAFF remains available as a Settings destination');
  for (const id of ['cloudStatus', 'lastSync', 'manualRefreshBtn', 'plantOperatorToggle', 'onDuty']) {
    assert.equal(await page.locator('#' + id).count(), 1, 'Retained utility control missing: ' + id);
  }
  assert.equal(await page.locator('#fullscreenBtn').count(), 0, 'App-wide Full Screen control must be removed');
  assert.equal(await page.locator('.overview-overlay-head').count(), 0, 'Redundant top Plant Overview header must be removed');
  assert.equal(await page.locator('#overviewFrame').getAttribute('allow'), null, 'Overview iframe must not permit fullscreen');
  assert.equal(source.includes('.overview-overlay-head{'), false, 'Removed Overview header styling must not remain');
  assert.equal(source.includes('app-fullscreen'), false, 'App-wide Full Screen mode styling must be removed');
  assert.equal(await page.locator('.nav-items #logoutBtn').evaluate(node => getComputedStyle(node).display !== 'none'), true);

  // Day tabs and fields are retained inside the Day to Day disclosure.
  const daySetup = page.locator('.day-setup');
  assert.equal(await daySetup.evaluate(node => node.open), false, 'Day to Day must start collapsed');
  await daySetup.locator(':scope > summary').click();
  assert.equal(await page.locator('#dayTabs .day').count(), 6, 'All six day selectors remain available when expanded');
  for (const id of ['dayDate', 'plantStart', 'plantStop', 'breakExcluded', 'lockStartBtn', 'unlockStartBtn', 'startLockStatus']) {
    assert.equal(await page.locator('#' + id).count(), 1, 'Day setup control missing: ' + id);
  }

  // Quick reason shortcut chips are removed; standard downtime reason presets remain in entry form.
  assert.equal(await page.locator('#quickReasonButtons').count(), 0);
  assert.equal(await page.locator('#addQuickReasonBtn').count(), 0);
  assert.equal(await page.locator('#reasonButtons').count(), 1);
  assert.equal(await page.locator('#openDailyTasks').count(), 1);
  assert.equal(await page.locator('.day-setup-label').textContent(), 'DAY TO DAY');
  assert.equal(await page.locator('text=Daily downtime records').count(), 0, 'Legacy Daily downtime records panel must be removed from the screen');

  // Weekly table, intelligence and total are consolidated into one disclosure.
  const weekly = page.locator('.weekly-collapse');
  assert.equal(await weekly.evaluate(node => node.open), false, 'Weekly summary must start collapsed');
  assert.equal(await weekly.locator('#weekBody').count(), 1);
  assert.equal(await weekly.locator('#weeklyInsight').count(), 1);
  assert.equal(await weekly.locator('#weekDown').count(), 1);
  for (const id of ['prevWeek', 'weekLabel', 'nextWeek', 'exportBtn']) {
    assert.equal(await page.locator('#' + id).count(), 1, 'Weekly control missing: ' + id);
    assert.equal(await page.locator('#' + id).evaluate(node => node.closest('.weekly-collapse') !== null), true,
      'Weekly control should be inside the weekly disclosure: ' + id);
  }
  await weekly.locator(':scope > summary').click();
  assert.equal(await weekly.evaluate(node => node.open), true);

  assert.equal(await page.locator('.top').count(), 0, 'Legacy top control/header block should be absent');
  assert.equal(await page.locator('#dayTabs').evaluate(node => node.closest('.day-setup') !== null), true);
  assert.equal(await page.locator('#entriesBody').evaluate(node => node.closest('.downtime-entry-panel') !== null), true);
  assert.equal(await page.locator('#scheduled').evaluate(node => node.closest('.daily-summary-panel') !== null), true);
  console.log('PASS: Stage 1 menu, Day to Day, downtime entries, daily summary and unified weekly disclosure contracts.');
} finally {
  await browser.close();
}
