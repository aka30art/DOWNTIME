import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const html = await readFile(resolve('index.html'), 'utf8');
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(html);
});
await new Promise((listen, reject) => {
  server.once('error', reject);
  server.listen(4175, '127.0.0.1', listen);
});

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4175/', { waitUntil: 'domcontentloaded' });
  const widths = [280, 320, 360, 375, 390, 414, 430, 600, 601, 768, 800, 1024, 1280];

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.side').evaluate(side => {
      const admin = side.querySelector('#centralAdminNav');
      if (admin) admin.style.setProperty('display', 'flex', 'important');
    });
    const items = await page.locator('.side > .nav').evaluateAll(nodes =>
      nodes.map(node => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          label: node.textContent.trim().replace(/\s+/g, ' '),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          display: style.display
        };
      })
    );
    assert.equal(items.length, 7, 'All seven navigation items, including Log Out, must remain in the menu at ' + width + 'px');
    for (const item of items) {
      assert.notEqual(item.display, 'none', item.label + ' is hidden at ' + width + 'px');
      assert.ok(item.width > 0 && item.height > 0, item.label + ' has no layout box at ' + width + 'px');
      assert.ok(item.left >= -1 && item.right <= width + 1,
        item.label + ' extends outside the viewport at ' + width + 'px: ' + JSON.stringify(item));
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        assert.ok(!(overlapX > 1 && overlapY > 1),
          'Navigation items overlap at ' + width + 'px: "' + a.label + '" and "' + b.label + '"');
      }
    }
  }

  await page.setViewportSize({ width: 390, height: 900 });
  const mobileColumns = await page.locator('.side').evaluate(side => getComputedStyle(side).gridTemplateColumns);
  assert.ok(mobileColumns.split(' ').length >= 2, 'Mobile menu must expose at least two explicit grid columns');
  const logout = page.locator('.side #logoutBtn');
  assert.equal(await logout.count(), 1, 'Exactly one Log Out control must exist in the navigation');
  assert.equal(await logout.evaluate(el => getComputedStyle(el).gridColumn), '1 / -1', 'Mobile Log Out spans the full menu width');
  console.log('PASS: all seven navigation items, including full-width Log Out, remain visible, inside the viewport, and non-overlapping from 280px to 1280px.');
} finally {
  await browser.close();
  await new Promise(close => server.close(close));
}
