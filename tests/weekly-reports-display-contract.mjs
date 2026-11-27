import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const nav = html.match(/<button class="nav" data-view="reports">([^<]+)<\/button>/)?.[1] || '';
assert.match(nav, /WEEKLY Reports/, 'navigation must use the WEEKLY Reports label');
assert.match(html, /<section id="reports" class="view"><div class="panel"><h2>WEEKLY REPORTS<\/h2>/,
  'reports archive heading must use WEEKLY REPORTS');
assert.match(html, /id="reportPreviewModal"[^>]*aria-hidden="true"/,
  'weekly report display must use an initially closed accessible popup');
assert.match(html, /id="reportPreviewFrame"[^>]*title="Selected weekly PDF report"/,
  'popup must contain a titled PDF preview frame');
assert.match(html, /data-report-display=/,
  'each cloud report row must render a Display action');

const start = html.indexOf('async function displayCloudReport(report,trigger){');
const end = html.indexOf('async function renderArchive(){', start);
assert.notEqual(start, -1, 'cloud report display function must exist');
assert.notEqual(end, -1, 'cloud report display function must end before archive rendering');
const display = html.slice(start, end);
assert.match(display, /permission\('canViewReports'\)/,
  'preview access must enforce the existing report-view permission');
assert.match(display, /downtimeReportsApi\('download',\{reportId:report\.id\}\)/,
  'preview must request a server-authorized signed URL for the selected stored PDF');
assert.match(display, /fetch\(url\)/,
  'preview downloads only the short-lived signed URL returned by the report API');
assert.doesNotMatch(display, /storage\.from\(/,
  'preview cannot access the PDF Storage bucket directly through Supabase Auth');
assert.match(display, /URL\.createObjectURL\(data\)/,
  'preview must present the downloaded PDF as a browser object URL');
assert.match(display, /frame\.src=reportPreviewObjectUrl/,
  'preview must load the selected PDF in the popup iframe');

const close = html.slice(html.indexOf('function closeReportPreview(){'), html.indexOf('async function displayCloudReport'));
assert.match(close, /URL\.revokeObjectURL/,
  'closing the popup must release its PDF object URL');
assert.match(close, /\+\+reportPreviewRequest/,
  'closing the popup must invalidate an in-flight report download');
assert.match(html, /event\.key==='Escape'.*reportPreviewModal/s,
  'Escape must close the report preview');
assert.match(html, /event\.target===\$\('reportPreviewModal'\).*closeReportPreview/s,
  'clicking the popup backdrop must close the preview');

const archiveStart = html.indexOf('async function renderArchive(){');
const archiveEnd = html.indexOf("$('cancelReset').onclick", archiveStart);
const renderer = html.slice(archiveStart, archiveEnd);
assert.match(renderer, /data-report-display=/,
  'every report row rendered by the cloud archive must include Display');
assert.match(renderer, /permission\('canExportReports'\).*data-report-download/s,
  'download remains separately restricted by export permission');

console.log('PASS: WEEKLY REPORTS label, per-report PDF preview, cleanup and permission contracts');
