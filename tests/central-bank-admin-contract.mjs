import assert from 'node:assert/strict';
import fs from 'node:fs';
const page=fs.readFileSync('central-bank-admin.html','utf8');
for(const id of ['projectUrl','pubKey','loginBtn','bootstrapBtn','userList','saveUser','staffList','saveStaff','saveTiers','dataSummary'])assert.ok(page.includes(id),'admin UI element '+id);
for(const endpoint of ['user-save','user-delete','staff-save','staff-photo-url','staff-photo-read','tiers-save','central-admin-state','login','bootstrap'])assert.ok(page.includes(endpoint),'admin API action '+endpoint);
assert.ok(page.includes('uploadToSignedUrl'),'private photo upload path');
assert.ok(page.includes('version'),'version-aware requests');
// The standalone admin page owns its fetch helper and must send the same opaque session header as the tracker adapter.
assert.ok(page.includes('x-downtime-session'),'central API requests carry the authenticated session header');
assert.ok(page.includes('"apikey":$("pubKey").value.trim()'),'admin requests send the project publishable key');
assert.ok(page.includes('if(auth&&token)h["x-downtime-session"]=token'),'session token is attached only to authenticated admin API calls');
assert.ok(page.includes('if(token){try{await call("logout")}catch{}}token=null;me=null;bank=null;'),'a login that fails the strict admin-state gate revokes its just-created session');
assert.ok(page.includes('value="JAN" readonly'), 'bootstrap only exposes the fixed JAN root username');
assert.ok(page.includes('ROOT OWNER · PROTECTED'), 'standalone admin UI protects the JAN root OWNER');
assert.ok(page.includes('centralUsersPanel')&&page.includes('canViewUsers')&&page.includes('canManageUsers'), 'standalone USERS panel follows view and management rights');
assert.ok(page.includes('centralStaffPanel')&&page.includes('canViewStaff')&&page.includes('canManageStaff')&&page.includes('canManageAssignments'), 'standalone STAFF panel separates view, profile and assignment rights');
assert.ok(page.includes('$("staffStation").disabled=!(canManageStaff&&canManageAssignments)'), 'standalone staff station editing requires both profile and assignment permissions');
assert.ok(page.includes('Access and Rights (JAN only)')&&page.includes('the permanent root OWNER'),
  'standalone tier editor describes JAN-only authority and fixed OWNER rights');
console.log('Central admin UI contract checks passed (static only).');
