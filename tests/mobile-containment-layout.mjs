import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const source = await readFile('index.html', 'utf8');
// This is a static visual fixture: strip application scripts so no login,
// cloud request, local storage write, or live-data action can occur in QA.
const html = source.replace(/<script\b[\s\S]*?<\/script>/gi, '');
const outputDir = 'artifacts/stage-1';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    for (const id of ['authGate', 'operatorGate', 'spectatorView']) {
      const element = document.getElementById(id);
      if (element) {
        element.hidden = true;
        element.style.setProperty('display', 'none', 'important');
      }
    }
  });

  const widths = [280, 320, 360, 375, 390, 414, 430, 600, 601, 768, 800, 1024, 1280];
  const screenshotWidths = new Set([320, 390, 600, 601, 768, 1280]);

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const result = await page.evaluate(() => {
      const visible = element => {
        const style = getComputedStyle(element);
        return element.getClientRects().length > 0 &&
          style.display !== 'none' && style.visibility !== 'hidden';
      };
      const rectData = element => {
        const rect = element.getBoundingClientRect();
        return {
          selector: element.tagName.toLowerCase() +
            (element.id ? '#' + element.id : '') +
            (element.classList.length ? '.' + [...element.classList].join('.') : ''),
          left: Math.round(rect.left * 100) / 100,
          right: Math.round(rect.right * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
          minWidth: getComputedStyle(element).minWidth,
          maxWidth: getComputedStyle(element).maxWidth,
          boxSizing: getComputedStyle(element).boxSizing
        };
      };
      const selectors = ['.shell', 'main', '.panel', '.fields', '.field', '.tablewrap'];
      const containers = selectors.flatMap(selector =>
        [...document.querySelectorAll(selector)].filter(visible).map(rectData)
      );
      const controls = [...document.querySelectorAll('input,select,textarea')]
        .filter(visible).map(element => {
          const data = rectData(element);
          const parent = element.closest('.field') || element.parentElement;
          const parentRect = parent.getBoundingClientRect();
          data.parentWidth = Math.round(parentRect.width * 100) / 100;
          return data;
        });
      const tables = [...document.querySelectorAll('.tablewrap')]
        .filter(visible).map(wrapper => ({
          width: wrapper.clientWidth,
          scrollWidth: wrapper.scrollWidth,
          overflowX: getComputedStyle(wrapper).overflowX,
          maxWidth: getComputedStyle(wrapper).maxWidth,
          hasTable: !!wrapper.querySelector('table')
        }));
      return {
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        stage1MediaActive: window.matchMedia('(max-width: 600px)').matches,
        containers,
        controls,
        tables
      };
    });

    assert.ok(result.documentWidth <= width + 1,
      'Document has horizontal overflow at ' + width + 'px: ' + JSON.stringify(result));
    assert.ok(result.bodyWidth <= width + 1,
      'Body has horizontal overflow at ' + width + 'px: ' + JSON.stringify(result));

    for (const element of result.containers) {
      assert.ok(element.width > 0, 'Container has no layout width at ' + width + 'px: ' + JSON.stringify(element));
      assert.ok(element.left >= -1 && element.right <= width + 1,
        'Container crosses viewport at ' + width + 'px: ' + JSON.stringify(element));
    }
    for (const control of result.controls) {
      assert.ok(control.width > 0, 'Form control has no layout width at ' + width + 'px: ' + JSON.stringify(control));
      assert.ok(control.left >= -1 && control.right <= width + 1,
        'Form control crosses viewport at ' + width + 'px: ' + JSON.stringify(control));
      assert.ok(control.width <= control.parentWidth + 1,
        'Form control exceeds its field at ' + width + 'px: ' + JSON.stringify(control));
    }

    if (width <= 600) {
      assert.equal(result.stage1MediaActive, true, 'Stage 1 breakpoint should be active at ' + width + 'px');
      for (const element of result.containers) {
        if (/^main$|^div\.shell|^div\.panel|^div\.fields|^div\.field/.test(element.selector)) {
          assert.equal(element.minWidth, '0px',
            'Stage 1 min-width containment missing at ' + width + 'px: ' + JSON.stringify(element));
          assert.equal(element.boxSizing, 'border-box',
            'Stage 1 box-sizing containment missing at ' + width + 'px: ' + JSON.stringify(element));
        }
      }
      for (const control of result.controls) {
        assert.equal(control.maxWidth, '100%',
          'Stage 1 control max-width missing at ' + width + 'px: ' + JSON.stringify(control));
        assert.equal(control.boxSizing, 'border-box',
          'Stage 1 control box-sizing missing at ' + width + 'px: ' + JSON.stringify(control));
      }
      for (const table of result.tables) {
        assert.equal(table.overflowX, 'auto',
          'Table wrapper must scroll internally at ' + width + 'px: ' + JSON.stringify(table));
        assert.equal(table.maxWidth, '100%',
          'Table wrapper must be constrained at ' + width + 'px: ' + JSON.stringify(table));
      }
    } else {
      assert.equal(result.stage1MediaActive, false, 'Stage 1 mobile breakpoint must be inactive at ' + width + 'px');
    }

    if (screenshotWidths.has(width)) {
      await page.screenshot({
        path: outputDir + '/viewport-' + width + 'px.png',
        fullPage: false,
        animations: 'disabled'
      });
    }
    console.log('PASS: Stage 1 viewport containment at ' + width + 'px');
  }

  // Exercise both real application modal structures at mobile widths.
  for (const width of [280, 320, 390, 600]) {
    await page.setViewportSize({ width, height: 900 });
    for (const id of ['detailsModal', 'entryModal']) {
      const backdrop = page.locator('#' + id);
      await backdrop.evaluate(element => element.classList.add('show'));
      const modal = page.locator('#' + id + ' .modal');
      const geometry = await modal.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          cssWidth: getComputedStyle(element).width,
          maxWidth: getComputedStyle(element).maxWidth,
          boxSizing: getComputedStyle(element).boxSizing
        };
      });
      assert.ok(geometry.width > 0, id + ' modal did not render at ' + width + 'px');
      assert.ok(geometry.left >= -1 && geometry.right <= width + 1,
        id + ' modal crosses viewport at ' + width + 'px: ' + JSON.stringify(geometry));
      if (width <= 600) {
        assert.equal(geometry.maxWidth, '100%', id + ' modal max-width rule missing at ' + width + 'px');
        assert.equal(geometry.boxSizing, 'border-box', id + ' modal box-sizing missing at ' + width + 'px');
      }
      if (id === 'entryModal' && width === 390) {
        await page.screenshot({
          path: outputDir + '/entry-modal-390px.png',
          fullPage: false,
          animations: 'disabled'
        });
      }
      await backdrop.evaluate(element => element.classList.remove('show'));
    }
  }

  console.log('PASS: details and entry modals remain within the viewport at 280, 320, 390 and 600px.');
  console.log('Stage 1 screenshots saved to ' + outputDir);
} finally {
  await browser.close();
}
