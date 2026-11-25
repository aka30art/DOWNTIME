import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('central-bank-admin.html','utf8');
const fn=fs.readFileSync('supabase/functions/central-config-admin/index.ts','utf8');

for(const id of ['department-menu-settings','departmentCategories','departmentEntries','newDepartmentCategory','addDepartmentCategoryBtn','restoreDepartmentMenuBtn','departmentLauncher'])
  assert.ok(page.includes('id="'+id+'"'),'Phase 02 UI control '+id);
for(const field of ['data-menu-entry-title','data-menu-entry-description','data-menu-entry-category','data-menu-entry-enabled','data-menu-entry-move-up','data-menu-entry-move-down','data-menu-submenu-label','data-menu-submenu-target','data-add-submenu','data-remove-submenu'])
  assert.ok(page.includes(field),'Phase 02 editable field/action '+field);
assert.ok(page.includes('configEndpoint()')&&page.includes('/functions/v1/central-config-admin'),
  'CDB configuration uses the dedicated endpoint and not operational central-bank API writes');
assert.ok(page.includes('callConfig("central-config-state")')&&page.includes('callConfig("central-config-save-draft")')&&page.includes('callConfig("central-config-publish")')&&page.includes('callConfig("central-config-restore-draft")'),
  'state, draft, publish and restore actions use the isolated endpoint');
assert.ok(page.includes('departmentMenu: collectDepartmentMenu()'),'department menu is part of the versioned configuration payload');
assert.ok(page.includes('defaultDepartmentMenu()')&&page.includes('restoreDepartmentMenuBtn'),'original menu settings can be restored');
assert.ok(page.includes('departmentMenu.entries.filter(entry=>entry.enabled)'),'disabled department entries are hidden from the launcher');
assert.ok(page.includes('submenu.filter(item=>item.enabled)'),'disabled submenu entries are hidden');
assert.ok(page.includes('showSection(item.target)'),'submenu destinations use the existing internal CDB section router');
assert.ok(page.includes('SUPPORTED_MENU_TARGETS'),'frontend uses the same allow-list concept as the API');
assert.ok(fn.includes('supportedTargets.has(target)'),'server validates every submenu destination');
assert.ok(page.includes('Department menu settings are isolated from the YARD HUB launcher and every operational application'),
  'the admin UI states the operational isolation boundary');
assert.match(page,/data-section="dept-downtime"/,'the existing DOWNTIME workspace route remains intact');
assert.match(page,/data-section="dept-floor"/,'the existing FLOOR workspace route remains intact');
assert.match(page,/data-section="dept-checksheets"/,'the existing CHECK SHEETS workspace route remains intact');
assert.match(page,/data-section="dept-rm"/,'the existing R&M workspace route remains intact');
assert.match(page,/data-section="dept-yardhub"/,'the existing HUB SETTINGS workspace route remains intact');

console.log('PASS: Central Data Bank Phase 02 department menu controls and operational isolation contract.');
