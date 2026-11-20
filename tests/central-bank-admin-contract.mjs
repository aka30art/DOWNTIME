import assert from 'node:assert/strict';
import fs from 'node:fs';
const page=fs.readFileSync('central-bank-admin.html','utf8');
for(const id of ['projectUrl','pubKey','loginBtn','bootstrapBtn','userList','saveUser','staffList','saveStaff','saveTiers','dataSummary'])assert.ok(page.includes(id),'admin UI element '+id);
for(const endpoint of ['user-save','user-delete','staff-save','staff-photo-url','staff-photo-read','tiers-save','get-state','login','bootstrap'])assert.ok(page.includes(endpoint),'admin API action '+endpoint);
assert.ok(page.includes('uploadToSignedUrl'),'private photo upload path');
assert.ok(page.includes('version'),'version-aware requests');
assert.ok(page.includes('x-downtime-session')===false,'adapter keeps auth header in shared adapter not inline UI');
console.log('Central admin UI contract checks passed (static only).');
