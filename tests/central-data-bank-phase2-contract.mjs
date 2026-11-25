import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('central-bank-admin.html','utf8');
const fn=fs.readFileSync('supabase/functions/central-config-admin/index.ts','utf8');

for(const id of ['department-menu-settings','departmentCategories','departmentEntries','newDepartmentCategory','addDepartmentCategoryBtn','restoreDepartmentMenuBtn','departmentLauncher'])
  assert.ok(page.includes('id="'+id+'"'),'Phase 02 UI control '+id);
for(const field of ['menuEntryTitle','menuEntryDescription','menuEntryCategory','menuEntryEnabled','menuEntryMoveUp','menuEntryMoveDown','menuSubmenuLabel','menuSubmenuTarget','ADD SUBMENU ITEM','removeSubmenu'])
  assert.ok(page.includes(field),'Phase 02 editable field/action '+field);
assert.ok(page.includes('configEndpoint()')&&page.includes('/functions/v1/central-config-admin'),
  'CDB configuration uses the dedicated endpoint and not operational central-bank API writes');
assert.ok(page.includes('callConfig("central-config-state")')&&page.includes('callConfig("central-config-save-draft")')&&page.includes('callConfig("central-config-publish")')&&page.includes('callConfig("central-config-restore-draft")'),
  'state, draft, publish and restore actions use the isolated endpoint');
assert.ok(page.includes('departmentMenu: collectDepartmentMenu()'),'department menu is part of the versioned configuration payload');
assert.ok(page.includes('defaultDepartmentMenu()')&&page.includes('restoreDepartmentMenuBtn'),'original menu settings can be restored');
assert.ok(page.includes('entry.enabled!==false')&&page.includes('entry.categoryId===category.id'),'disabled department entries are hidden from the launcher');
assert.ok(page.includes('item.enabled!==false'),'disabled submenu entries are hidden');
assert.ok(page.includes('link.dataset.section=item.target'),'submenu destinations use the existing internal CDB section router');
assert.ok(page.includes('SUPPORTED_MENU_TARGETS'),'frontend uses the same allow-list concept as the API');
assert.ok(fn.includes('supportedTargets.has(target)'),'server validates every submenu destination');
assert.ok(/Department Menu settings are isolated from the YARD HUB launcher and every operational application/i.test(page),
  'the admin UI states the operational isolation boundary');
assert.match(page,/data-section="dept-downtime"/,'the existing DOWNTIME workspace route remains intact');
assert.match(page,/data-section="dept-floor"/,'the existing FLOOR workspace route remains intact');
assert.match(page,/data-section="dept-checksheets"/,'the existing CHECK SHEETS workspace route remains intact');
assert.match(page,/data-section="dept-rm"/,'the existing R&M workspace route remains intact');
assert.match(page,/data-section="dept-yardhub"/,'the existing HUB SETTINGS workspace route remains intact');

console.log('PASS: Central Data Bank Phase 02 department menu controls and operational isolation contract.');
