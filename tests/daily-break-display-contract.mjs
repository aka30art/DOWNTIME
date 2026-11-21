import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

assert.match(
  html,
  /<label>Break excluded<\/label><input id="breakExcluded"[^>]*disabled>/,
  'daily Break excluded field must have a stable DOM id and remain read-only'
);
assert.doesNotMatch(
  html,
  /<label>Break excluded<\/label><input value="75 minutes" disabled>/,
  'daily Break excluded field must not retain the hardcoded 75-minute value'
);

const helperMatch = html.match(/function configuredBreakMinutes\(dayName\)\{[^}]*\}/);
assert.ok(helperMatch, 'configured break helper must exist');
const getBreakMinutes = new Function(
  'state',
  'STANDARD_SHIFT',
  `${helperMatch[0]}; return configuredBreakMinutes;`
);

const standard = {
  Monday: { break1: 30, break2: 45 },
  Saturday: { break1: 20, break2: 0 },
  Sunday: { break1: 0, break2: 0 }
};
const readBreak = getBreakMinutes({ shiftSchedule: standard }, standard);
assert.equal(readBreak('Monday'), 75, 'weekday preset should display the configured 75 minutes');
assert.equal(readBreak('Saturday'), 20, 'Saturday preset should display 20 minutes');
assert.equal(readBreak('Sunday'), 0, 'zero-break schedule should display zero minutes');

const custom = { ...standard, Saturday: { break1: 12, break2: 8 } };
assert.equal(
  getBreakMinutes({ shiftSchedule: custom }, standard)('Saturday'),
  20,
  'custom day settings must be summed from both configured break values'
);
const customDifferent = { ...standard, Saturday: { break1: 15, break2: 10 } };
assert.equal(
  getBreakMinutes({ shiftSchedule: customDifferent }, standard)('Saturday'),
  25,
  'the display must reflect updated custom presets'
);

const calcStart = html.indexOf('function calc(d){');
const calcEnd = html.indexOf('function configuredBreakMinutes', calcStart);
assert.notEqual(calcStart, -1, 'daily calculation function must exist');
assert.notEqual(calcEnd, -1, 'daily calculation function must be bounded before the break helper');
const calcSource = html.slice(calcStart, calcEnd);
assert.ok(calcSource.includes('configuredBreakMinutes(dayName)'),
  'daily calculations must resolve the break from the configured weekday schedule');

const calculateDay = new Function('mins', 'durationMinutes', 'configuredBreakMinutes',
  `${calcSource}; return calc;`
);
const configuredFor = name => readBreak({ shiftSchedule: standard }, standard)(name);
const calc = calculateDay(
  value => { if (!value || !/^\d{2}:\d{2}$/.test(value)) return null; const [h, m] = value.split(':').map(Number); return h * 60 + m; },
  entry => Math.max(0, (Number(entry.hours) || 0) * 60 + (Number(entry.minutes) || 0)),
  configuredFor
);
const saturday = calc({ date: '2026-11-21', start: '07:30', stop: '13:10', breakMinutes: 75, entries: [{ hours: 0, minutes: 7 }] });
assert.equal(saturday.scheduled, 340, 'Saturday scheduled duration must be calculated from its shift times');
assert.equal(saturday.breakDeduction, 20, 'Saturday must use its configured 20-minute break, not 75 minutes');
assert.equal(saturday.net, 320, 'Saturday net available time must deduct 20 minutes');
assert.equal(saturday.down, 7, 'recorded downtime must be retained');
assert.equal(saturday.run, 313, 'actual running time must use net available time less downtime');
assert.equal(saturday.downPct, 7 / 320 * 100, 'downtime percentage must use net available time');
assert.equal(saturday.runPct, 313 / 320 * 100, 'running percentage must use net available time');
assert.match(html, /\$\('breakExcludedStat'\)\.textContent=fmt\(c\.breakDeduction\)/,
  'Daily Summary must display the exact break deduction used by the calculation');

const renderStart = html.indexOf('function render(){');
const renderEnd = html.indexOf('let detailIndex=-1;', renderStart);
assert.notEqual(renderStart, -1, 'daily render function must exist');
assert.notEqual(renderEnd, -1, 'daily render function must have a bounded section');
const renderBody = html.slice(renderStart, renderEnd);
assert.match(
  renderBody,
  /configuredBreakMinutes\(DAYS\[selected\]\)/,
  'daily render must resolve break minutes from the selected day preset'
);
assert.match(
  renderBody,
  /breakExcluded\.value=breakMinutes\+['"] ['"]\+/,
  'daily render must update the visible field whenever the selected day is rendered'
);

console.log('PASS: daily Break excluded display follows selected-day shift presets');
