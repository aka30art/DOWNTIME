import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const source = await readFile('index.html', 'utf8');
assert.match(source, /UI migration · Stage 4: unified weekly analytics hierarchy/);
const html = source.replace(/<script\b[\s\S]*?<\/script>/gi, '');
const outputDir = 'artifacts/stage-4';
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
    if (setup) {
      setup.open = true;
      document.getElementById('dayHeading').textContent = 'MONDAY';
      document.getElementById('dayTabs').innerHTML = ['MON','TUE','WED','THU','FRI','SAT'].map((day, i) =>
        '<button class="day'+(i===0?' selected':'')+'" type="button">'+day+'<small>'+(i===0?'Selected':'Demo')+'</small></button>'
      ).join('');
      for (const [id, value] of Object.entries({dayDate:'2026-11-16',plantStart:'06:30',plantStop:'17:00',breakExcluded:'01:15'})) {
        const input = document.getElementById(id);
        if (input) input.value = value;
      }
    }

    const weekly = document.querySelector('details.weekly-collapse');
    if (!weekly) throw new Error('Unified weekly summary disclosure missing');
    weekly.open = true;

    const values = {
      topCause:'Conveyor blockage',
      topCauseShare:'31.4%',
      weekChange:'−12.4%',
      prevWeekDown:'05h 22m',
      weeklyInsight:'Downtime is down compared with the previous week. Conveyor blockage is the largest recorded cause.',
      weekDown:'04h 42m',
      weekPct:'10.8%',
      weekNet:'43h 10m',
      weekRunPct:'89.2%',
      weekLabel:'16 Nov 2026 – 21 Nov 2026'
    };
    for (const [id, value] of Object.entries(values)) {
      const node = document.getElementById(id);
      if (node) node.textContent = value;
    }
    document.getElementById('weekBody').innerHTML = [
      ['Monday','Jan','16 Nov 2026','06:30','16:00','00h 31m','6.7%','93.3%'],
      ['Tuesday','Mick','17 Nov 2026','06:30','16:00','00h 11m','2.4%','97.6%'],
      ['Wednesday','Gigi','18 Nov 2026','06:30','16:00','01h 51m','23.9%','76.1%'],
      ['Thursday','Daz','19 Nov 2026','06:30','16:00','00h 49m','10.5%','89.5%'],
      ['Friday','Shayne','20 Nov 2026','06:30','16:00','01h 13m','15.7%','84.3%'],
      ['Saturday','Jan','21 Nov 2026','08:00','12:45','00h 07m','2.6%','97.4%']
    ].map(row => '<tr>'+row.map(value=>'<td>'+value+'</td>').join('')+'</tr>').join('');
  });

  for (const width of [320,390,600,601,768,1280]) {
    await page.setViewportSize({ width, height: 900 });
    const result = await page.evaluate(() => {
      const disclosure = document.querySelector('details.weekly-collapse');
      const tableWrap = document.querySelector('.weekly-table-wrap');
      const table = tableWrap.querySelector('table');
      const intelligence = document.querySelectorAll('.weekly-analytics-subsection');
      const ids = ['prevWeek','weekLabel','nextWeek','exportBtn','weeklyInsight','weekDown','weekPct','weekNet','weekRunPct'];
      const topCause = document.getElementById('topCause');
      const topCauseStyle = getComputedStyle(topCause);
      const topCauseText = topCause.textContent.trim();
      const textNode = [...topCause.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      const wordFragments = [];
      if (textNode) {
        for (const word of textNode.textContent.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(textNode, word.index);
          range.setEnd(textNode, word.index + word[0].length);
          wordFragments.push({word:word[0],rectCount:range.getClientRects().length});
        }
      }
      const topCauseMetric = {whiteSpace:topCauseStyle.whiteSpace,scrollWidth:topCause.scrollWidth,clientWidth:topCause.clientWidth,topCauseText,wordFragments,fontSize:topCauseStyle.fontSize};
      const controls = ids.map(id => {
        const el=document.getElementById(id);
        const r=el.getBoundingClientRect();
        return {id,left:r.left,right:r.right,width:r.width,visible:!!el.getClientRects().length,inside:!!el.closest('.weekly-collapse')};
      });
      const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height};};
      return {
        viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
        expanded:disclosure.open,summary:rect(disclosure.querySelector('summary')),
        content:rect(disclosure.querySelector('.weekly-collapse-content')),
        tableWrap:rect(tableWrap),tableClientWidth:tableWrap.clientWidth,tableScrollWidth:tableWrap.scrollWidth,tableRect:rect(table),
        overflowX:getComputedStyle(tableWrap).overflowX,rows:table.querySelectorAll('tbody tr').length,
        intelligenceCount:intelligence.length,intelligenceVisible:[...intelligence].every(el=>el.getClientRects().length>0),
        topCauseMetric,
        controls
      };
    });

    assert.equal(result.expanded,true,'Weekly summary must be expanded at '+width+'px');
    assert.ok(result.documentWidth<=width+1,'Page horizontal overflow at '+width+'px: '+JSON.stringify(result));
    assert.ok(result.summary.width>0&&result.content.height>0,'Weekly summary content missing at '+width+'px');
    assert.equal(result.rows,6,'Expected six weekly fixture rows at '+width+'px');
    assert.equal(result.intelligenceCount,2,'Weekly intelligence and total must remain consolidated at '+width+'px');
    assert.equal(result.intelligenceVisible,true,'Weekly analytics subsections should be visible at '+width+'px');
    assert.equal(result.topCauseMetric.whiteSpace,'normal','Top downtime cause must wrap instead of clipping at '+width+'px');
    assert.ok(result.topCauseMetric.scrollWidth<=result.topCauseMetric.clientWidth+1,'Top downtime cause text overflows its card at '+width+'px: '+JSON.stringify(result.topCauseMetric));
    assert.ok(result.topCauseMetric.wordFragments.every(fragment=>fragment.rectCount===1),'Top downtime cause word split across lines at '+width+'px: '+JSON.stringify(result.topCauseMetric));
    assert.equal(result.overflowX,'auto','Weekly table wrapper should scroll internally at '+width+'px');
    assert.ok(result.tableWrap.left>=-1&&result.tableWrap.right<=width+1,'Weekly table wrapper exceeds viewport at '+width+'px: '+JSON.stringify(result.tableWrap));
    if (width <= 800) assert.ok(result.tableScrollWidth > result.tableClientWidth + 1,'Narrow weekly report should scroll internally at '+width+'px');
    assert.ok(result.tableScrollWidth>=result.tableClientWidth,'Weekly table scroll metrics invalid at '+width+'px');
    for (const control of result.controls) {
      assert.ok(control.visible&&control.inside&&control.width>0,'Weekly control missing/outside disclosure at '+width+'px: '+JSON.stringify(control));
      assert.ok(control.left>=-1&&control.right<=width+1,'Weekly control exceeds viewport at '+width+'px: '+JSON.stringify(control));
    }
    await page.screenshot({path:outputDir+'/weekly-summary-expanded-'+width+'px.png',fullPage:true,animations:'disabled'});
    console.log('PASS: expanded weekly analytics consolidation at '+width+'px');
  }
  console.log('Stage 4 expanded weekly summary screenshots saved to '+outputDir);
} finally {
  await browser.close();
}
