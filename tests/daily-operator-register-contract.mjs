import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const client=await readFile(new URL('../central-bank-client.js',import.meta.url),'utf8');
const api=await readFile(new URL('../supabase/functions/central-bank/index.ts',import.meta.url),'utf8');
const migration=await readFile(new URL('../supabase/migrations/20261125010000_daily_operator_register.sql',import.meta.url),'utf8');
const overview=await readFile(new URL('../plant-overview-preview.html',import.meta.url),'utf8');

assert.match(migration,/create table if not exists public\.downtime_daily_operator_assignments/i);
assert.match(migration,/duty_date date primary key/i,'one record is keyed to each calendar date');
assert.match(migration,/create table if not exists public\.downtime_daily_operator_audit/i,'assignment changes have a separate audit history');
assert.match(migration,/revoke all on public\.downtime_daily_operator_assignments from public, anon, authenticated/i,'browser roles cannot write the register directly');
assert.match(migration,/grant all on public\.downtime_daily_operator_assignments to service_role/i);

assert.match(api,/if\(action==="daily-operator-list"\)/);
assert.match(api,/if\(action==="daily-operator-assign"\)/);
assert.match(api,/if\(action==="daily-operator-unlock"\)/);
assert.match(api,/!\["OWNER","DEVACC","ADMIN","SUPERVISOR"\]\.includes\(tier\)/,'only authorised supervisor-level tiers can change assignments');
assert.match(api,/already has a locked operator/i,'locked records cannot be overwritten');
assert.match(api,/Enter a reason for unlocking this daily assignment/i,'unlock requires a reason');
assert.match(api,/downtime_daily_operator_audit/,'server records an immutable audit event');
assert.match(api,/publicBank\.dailyOperators=dailyOperators\|\|\[\]/,'live shared state carries date-specific operator assignments');

assert.match(client,/dailyOperators\(fromDate,toDate\)/);
assert.match(client,/assignDailyOperator\(dutyDate,operatorName,reason=""/);
assert.match(client,/unlockDailyOperator\(dutyDate,reason\)/);

assert.match(html,/id="dailyOperatorStatus"/);
assert.match(html,/id="openDailyOperator"/);
assert.match(html,/id="dailyOperatorModal"/);
assert.match(html,/CONFIRM &amp; LOCK/);
assert.match(html,/UNLOCK ASSIGNMENT/);
assert.match(html,/function canManageDailyOperator\(\)/);
assert.match(html,/dailyOperatorRecords\[d\.date\]\?\.operator_name/,'weekly PDF data resolves the operator from the date-keyed register');
assert.match(html,/dailyOperatorRecords\[x\.date\]\?\.operator_name/,'weekly on-screen report resolves the date-keyed operator');
assert.match(html,/dailyOperatorRecords\[iso\(today\)\]/,'main dashboard uses the official daily operator record');
assert.match(html,/CHANGE HISTORY/,'assignment audit history is visible in the record dialog');
assert.match(html,/async function exportDailyPDF\(\)/,'daily PDF export is available');
assert.match(html,/pdf\.text\('OFFICIAL OPERATOR ON DUTY'/,'daily PDF prints the official operator');
assert.match(html,/record=dailyOperatorRecords\[date\]/,'daily PDF resolves the operator from the calendar date');

assert.match(overview,/id="dailyOperatorName"/);
assert.match(overview,/dailyOperators\|\|\[\]/,'Plant Overview reads the shared daily operator register');
assert.match(overview,/OPERATOR ON DUTY/);

console.log('Daily Operator on Duty register, supervisor lock controls, audit history, dashboard, Plant Overview and weekly PDF contracts: PASS');
