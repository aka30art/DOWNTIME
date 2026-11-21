import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const source = await readFile('index.html', 'utf8');
assert.match(source, /UI migration · Stage 3: Day Setup visual refinement/);
const html = source.replace(/<script\b[\s\S]*?<\/script>/gi, '');
const outputDir = 'artifacts/stage-3';
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
    const setup = document.querySelector('details.day-setup');
    if (!setup) throw new Error('Day Setup details element missing');
    setup.open = true;
    document.getElementById('dayHeading').textContent = 'MONDAY';
    // Populate the otherwise script-generated day picker with a visual-only fixture.
    const dayTabs = document.getElementById('dayTabs');
    if (!dayTabs) throw new Error('Day picker fixture target missing');
    dayTabs.innerHTML = ['MON','TUE','WED','THU','FRI','SAT'].map((day, i) =>
      '<button class="day'+(i===0?' selected':'')+'" type="button" aria-label="'+day+'">'+day+'<small>'+(i===0?'Selected':'Demo')+'</small></button>'
    ).join('');
    for (const [id, value] of Object.entries({dayDate:'2026-11-16',plantStart:'06:30',plantStop:'17:00',breakExcluded:'01:15'})) {
      const input = document.getElementById(id);
      if (input) input.value = value;
    }
  });
  for (const width of [320,390,600,601,768,1280]) {
    await page.setViewportSize({ width, height: 900 });
    const m = await page.evaluate(() => {
      const panel=document.querySelector('.day-setup-panel'), details=document.querySelector('details.day-setup'), summary=details.querySelector('summary'), fields=document.querySelector('.day-setup-fields'), dayTabs=document.querySelectorAll('#dayTabs .day');
      const inputs=[...fields.querySelectorAll('input')].filter(e=>e.getClientRects().length);
      const lock=document.querySelector('#lockStartBtn');
      const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height};};
      return {viewport:innerWidth,docWidth:document.documentElement.scrollWidth,panel:rect(panel),summary:rect(summary),fields:rect(fields),inputs:inputs.map(rect),lock:rect(lock),expanded:details.open,columns:getComputedStyle(fields).gridTemplateColumns,dayTabCount:dayTabs.length,dayTabsVisible:[...dayTabs].every(e=>e.getClientRects().length)};
    });
    assert.equal(m.expanded,true,'Day Setup must be expanded in Stage 3 QA at '+width+'px');
    assert.ok(m.panel.width>0&&m.summary.height>0&&m.fields.height>0,'Day Setup not rendered '+width);
    assert.equal(m.dayTabCount,6,'Expected six day selector fixture buttons at '+width+'px');
    assert.equal(m.dayTabsVisible,true,'Day selector buttons must be visible at '+width+'px');
    assert.ok(m.docWidth<=width+1,'Horizontal overflow '+width+'px '+JSON.stringify(m));
    for(const box of [...m.inputs,m.lock]) assert.ok(box.width>0&&box.left>=-1&&box.right<=width+1,'Control crosses viewport '+width+'px '+JSON.stringify(box));
    if(width<=520) assert.ok(m.columns.split(' ').length>=2,'Mobile field grid expected two columns at '+width+'px');
    await page.screenshot({path:outputDir+'/day-setup-expanded-'+width+'px.png',fullPage:true,animations:'disabled'});
    console.log('PASS: Stage 3 expanded Day Setup at '+width+'px');
  }
  console.log('Stage 3 expanded Day Setup screenshots saved to '+outputDir);
} finally { await browser.close(); }
