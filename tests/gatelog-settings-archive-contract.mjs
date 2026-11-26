import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const [ui,api,settings,css,migration,archiveMigration,day]=await Promise.all([
 readFile('index.html','utf8'),readFile('supabase/functions/gatelog-api/index.ts','utf8'),
 readFile('gatelog-settings.js','utf8'),readFile('gatelog-app.css','utf8'),
 readFile('supabase/migrations/20261126151000_gatelog_waste_type_activation.sql','utf8'),
 readFile('supabase/migrations/20261126150000_gatelog_report_archive.sql','utf8'),
 readFile('gatelog-day-management.js','utf8')
]);
assert.match(ui,/gatelog-settings\.js/);
assert.match(settings,/CUSTOMER CATALOGUE/);
assert.match(settings,/WASTE TYPES/);
assert.match(settings,/REPORT ARCHIVE/);
assert.match(settings,/customer-update/);
assert.match(settings,/customer-archive/);
assert.match(settings,/waste-type-create/);
assert.match(settings,/waste-type-update/);
assert.match(settings,/report-archive/);
assert.match(api,/action==="report-save"/);
assert.match(api,/action==="report-archive"/);
assert.match(api,/action==="customer-update"/);
assert.match(api,/action==="customer-archive"/);
assert.match(api,/action==="waste-type-create"/);
assert.match(api,/action==="waste-type-update"/);
assert.match(api,/canManageAssignments===true/);
assert.match(api,/canExportReports===true/);
assert.match(day,/api\('report-save'/);
assert.match(archiveMigration,/gatelog_report_archive/);
assert.match(archiveMigration,/enable row level security/);
assert.match(migration,/add column if not exists active boolean not null default true/);
assert.match(css,/gatelog-admin-tabs/);
assert.match(css,/gatelog-admin-toolbar/);
console.log('GATELOG settings and report archive contract passed.');
