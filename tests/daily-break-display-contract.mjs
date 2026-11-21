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
