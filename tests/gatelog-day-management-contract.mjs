import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [api, ui, styles, migration, atomic, index] = await Promise.all([
  readFile(new URL('../supabase/functions/gatelog-api/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../gatelog-day-management.js', import.meta.url), 'utf8'),
  readFile(new URL('../gatelog-app.css', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20261126110000_gatelog_daily_gateman_assignments.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20261126120000_gatelog_gateman_atomic_actions.sql', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8')
]);

assert.match(migration, /gatelog_daily_gateman_assignments/);
assert.match(migration, /is_locked boolean not null default false/);
assert.match(migration, /locked_by text/);
assert.match(migration, /locked_at timestamptz/);
assert.match(migration, /revoke all .* from public, anon, authenticated/i);
assert.doesNotMatch(migration, /downtime_daily_operator_assignments/);

assert.match(api, /bank\.payload\.staff\?\.roster/);
assert.match(api, /staffProfiles\[name\]\?\.status/);
assert.match(api, /item\.status!=="ARCHIVED"&&item\.onSite/);
assert.match(api, /staffName=clean\(body\.staffName,80\)/);
assert.doesNotMatch(api, /const gatemen=.*bank\.payload\.users/);
assert.match(ui, /Choose an active staff member from the STAFF directory/);
assert.match(ui, /staffName:\$\('gatelogGatemanSelect'\)\.value/);
assert.doesNotMatch(ui, /staff\/user directory/);
assert.match(api, /canManageAssignments===true/);
assert.match(api, /action==="gateman-save"/);
assert.match(api, /action==="gateman-lock"/);
assert.match(api, /action==="day-register"/);
assert.match(api, /action==="report"/);
assert.match(api, /gatelog_assign_gateman/);
assert.match(api, /gatelog_lock_gateman/);
assert.match(atomic, /on conflict \(duty_date\) do update/);
assert.match(atomic, /where not public\.gatelog_daily_gateman_assignments\.is_locked/);
assert.match(atomic, /grant execute .* to service_role/i);
assert.match(api, /canExportReports/);
assert.match(api, /\["daily","weekly","monthly"\]/);
assert.doesNotMatch(api, /downtime_daily_operator_assignments/);

assert.match(ui, /gatelog-day-card/);
assert.match(ui, /gatelogAssignGateman/);
assert.match(ui, /gatelogLockGateman/);
assert.match(ui, /gatelogReportPeriod/);
assert.match(ui, /window\.print\(\)/);
assert.match(ui, /MOST COMMON WASTE TYPE/);
assert.doesNotMatch(ui, /ALL TIME/);
assert.doesNotMatch(ui, /AVERAGE TIME ON SITE/);

assert.match(styles, /\.gatelog-day-picker/);
assert.match(styles, /\.gatelog-day-card\.is-selected/);
assert.match(styles, /\.gatelog-icon-action/);
assert.match(styles, /\.gatelog-visit-card/);
assert.match(styles, /\.gatelog-visit-actions/);
assert.match(index, /gatelog-day-management\.js/);

console.log('GATELOG day management contract passed.');
