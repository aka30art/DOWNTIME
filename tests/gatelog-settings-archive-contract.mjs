import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const [ui,api,settings,css,migration,archiveMigration,day,app]=await Promise.all([
 readFile('index.html','utf8'),readFile('supabase/functions/gatelog-api/index.ts','utf8'),
 readFile('gatelog-settings.js','utf8'),readFile('gatelog-app.css','utf8'),
 readFile('supabase/migrations/20261126151000_gatelog_waste_type_activation.sql','utf8'),
 readFile('supabase/migrations/20261126150000_gatelog_report_archive.sql','utf8'),
 readFile('gatelog-day-management.js','utf8'),readFile('gatelog-app.js','utf8')
]);
assert.match(ui,/gatelog-settings\.js/);
assert.match(app,/id="gatelogMainMenu"/);
assert.match(app,/GATELOG Main Menu/);
assert.match(app,/id="gatelogOpenCustomers"/);
assert.match(app,/id="gatelogOpenSettings"/);
assert.match(app,/id="gatelogOpenReports"/);
assert.match(app,/id="gatelogBack"/);
assert.match(css,/gatelog-main-menu-panel/);
assert.match(css,/single DOWNTIME-style main navigation dropdown/);
assert.match(settings,/WASTE TYPES/);
assert.doesNotMatch(settings,/data-admin-tab/);
assert.match(app,/data-catalogue-edit=/);
assert.match(app,/data-catalogue-remove=/);
assert.match(app,/gatelogCatalogueAdd/);
assert.ok(app.includes('window.GATELOGSettings?.addCustomer()'));
assert.match(settings,/REPORT ARCHIVE/);
assert.match(settings,/customer-update/);
assert.match(settings,/customer-archive/);
assert.match(app,/data-catalogue-remove=/);
assert.match(app,/>REMOVE<\/button>/);
assert.match(settings,/removeCustomer/);
assert.match(settings,/Past visit records, reports and audit history will remain intact/);
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
