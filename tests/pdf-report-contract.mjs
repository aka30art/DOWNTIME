import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('async function buildReportPDF(data){');
const end = html.indexOf('async function saveCloudReport()', start);
assert.notEqual(start, -1, 'PDF builder must exist');
assert.notEqual(end, -1, 'PDF builder must end before cloud archive save');
const builder = html.slice(start, end);

assert.match(builder, /new jsPDF\(\{orientation:'portrait',unit:'mm',format:'a4'\}\)/,
  'weekly export must generate portrait A4 pages');
assert.doesNotMatch(builder, /orientation:\s*['"]landscape['"]/i,
  'weekly export must not use landscape orientation');
for (const label of [
  'Plant Downtime Report',
  'NET AVAILABLE',
  'DOWNTIME',
  'RUNNING',
  'DOWNTIME RATE',
  'DAILY PERFORMANCE',
  'DOWNTIME REASONS',
  'WEEK-ON-WEEK COMPARISON',
  'Page '
]) {
  assert.ok(builder.includes(label), `report must include "${label}"`);
}
assert.match(builder, /columnStyles:/, 'daily table must use deliberate portrait column widths');
assert.match(builder, /pdf\.setProperties\(/, 'PDF metadata must be populated');
assert.match(builder, /pdf\.output\('blob'\)/, 'report must remain compatible with cloud PDF storage');

console.log('PASS: weekly PDF export is portrait A4 with a professional report structure');
