import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const api = await readFile(new URL('../supabase/functions/central-bank/index.ts', import.meta.url), 'utf8');

assert.match(html, /<span class="day-setup-label">DAY TO DAY<\/span>/,
  'the disclosure heading must be renamed Day to Day');
assert.match(html, /id="openDailyTasks"[^>]*aria-label="Open Daily Tasks"/,
  'Day to Day must expose an accessible clipboard button');
assert.match(html, /id="dailyTasksModal"[^>]*aria-hidden="true"/,
  'Daily Tasks must open in a closed dialog by default');
assert.match(html, /id="dailyTasksTitle">DAILY TASKS<\/h2>/,
  'the popup title must be DAILY TASKS');
assert.match(html, /id="dailyTasksList"/, 'the daily checklist has a stable render target');

assert.match(html, /data-settings-open="dailyTasks"[^>]*aria-controls="settingsPanelDailyTasks"/,
  'Daily Tasks must have a dedicated Settings destination');
assert.match(html, /id="settingsPanelDailyTasks" class="settings-panel" hidden/,
  'Daily Tasks must have its own Settings panel');
assert.match(html, /id="dailyTaskPresetInput"/, 'the Settings panel must allow a task to be entered');
assert.match(html, /id="addDailyTaskPresetBtn"/, 'the Settings panel must expose an Add Task action');
assert.match(html, /function addDailyTaskPreset\(\)/, 'daily task presets must be addable');
assert.match(html, /function renderDailyTaskSettings\(\)/, 'daily task presets must be rendered in Settings');
assert.match(html, /function renderDailyTasksPopup\(\)/, 'the popup checklist must be rendered from the preset list');

assert.match(html, /dailyTasksDone:\[\]/,
  'new operating days must start with no completed tasks');
assert.match(html, /function day\(\)\{const current=week\(\)\.days\[selected\];if\(!Array\.isArray\(current\.dailyTasksDone\)\)current\.dailyTasksDone=\[\];return current\}/,
  'existing day records must safely migrate to an empty completion list');
assert.match(html, /day\(\)\.dailyTasksDone=\[\.\.\.done\]/,
  'checklist completion must be stored against the selected day');
assert.match(html, /if\(locked\|\|!permission\('canEditTracker'\)\)return/,
  'only roles allowed to edit tracker data may change task completion, and locked days reject edits');
assert.match(html, /state\.dailyTaskPresets=\[\.\.\.state\.dailyTaskPresets,task\]/,
  'new task presets must be stored in the central tracker state');
assert.match(html, /function canManageSettingsSection\(section\)[\s\S]*dailyTasks:\['canManageDailyTasks'\]/,
  'Daily Tasks preset management has its own configurable permission');
assert.match(html, /function renderDailyTaskSettings\(\)[\s\S]*canManageSettingsSection\('dailyTasks'\)/,
  'Daily Tasks editor controls use the section-specific edit right');
assert.match(api, /if\(Array\.isArray\(bank\.appData\?\.dailyTaskPresets\)\)nextAppData\.dailyTaskPresets=bank\.appData\.dailyTaskPresets;else delete nextAppData\.dailyTaskPresets/,
  'the central API must preserve task presets when a non-settings role saves task completion');
assert.doesNotMatch(html, /id="quickReasonButtons"|id="quickReasonAdminList"|id="addQuickReasonBtn"|id="newQuickReason"/,
  'quick-reason shortcut UI must be fully removed');
assert.doesNotMatch(html, /renderQuickReasons|data-quickreason|Quick reasons ·/,
  'quick-reason shortcut rendering and labels must be removed');
assert.match(html, /id="reasonButtons"/, 'standard downtime reason presets remain in the entry form');
assert.match(html, /id="downtimeReasonAdminList"/, 'standard downtime reason presets remain configurable in Settings');

console.log('PASS: Day to Day title, clipboard popup, daily task preset permissions, per-day completion and quick-reason removal');
