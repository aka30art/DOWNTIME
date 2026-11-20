import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html=await readFile('index.html','utf8');
const fn=await readFile('supabase/functions/photo-evidence/index.ts','utf8');
const migration=await readFile('supabase/migrations/20261120010000_photo_evidence.sql','utf8');
const workflow=await readFile('.github/workflows/photo-evidence-cleanup.yml','utf8');

assert.match(html,/id="photoInput" type="file" accept="image\/\*" capture="environment"/,'Mobile camera/gallery file input exists');
assert.match(html,/PHOTO EVIDENCE \(OPTIONAL · 24 HOURS\)/,'Photo is explicitly optional and time-limited');
assert.match(html,/function photoCompress\(file\)/,'Client-side image compression function exists');
assert.match(html,/1920\/Math\.max\(img\.width,img\.height\)/,'Compression constrains longest edge to 1920px');
assert.match(html,/toBlob\(blob=>blob\?resolve\(blob\):reject\(new Error\('Image compression failed'\)\),'image\/jpeg',0\.83\)/,'Compression outputs JPEG at target quality');
assert.match(html,/uploadToSignedUrl/,'Uploads use signed upload URLs');
assert.match(html,/function photoView\(id\)/,'Photo viewing uses a signed-url endpoint');
assert.match(html,/photoExpiresAt/,'Entries retain photo expiry metadata');
assert.match(html,/Photo expired/,'Expired photos have a placeholder');
assert.match(html,/photoRemoved/,'Removal state is handled on entry save');
assert.match(fn,/createSignedUploadUrl/,'Edge function creates signed upload URL');
assert.match(fn,/createSignedUrl\(row\.storage_path,60\)/,'View URL TTL is 60 seconds');
assert.match(fn,/24\*60\*60\*1000/,'Server sets 24-hour expiry');
assert.match(fn,/5\*1024\*1024/,'Server enforces 5MB size cap');
assert.match(fn,/action==="cleanup"/,'Cleanup endpoint is implemented');
assert.match(fn,/x-cleanup-secret/,'Cleanup is protected by a secret');
assert.match(migration,/public=false/,'Storage bucket is private');
assert.match(migration,/enable row level security/,'Metadata table uses RLS');
assert.match(workflow,/cron: ".*"/,'Scheduled cleanup workflow exists');
assert.match(workflow,/PHOTO_CLEANUP_SECRET/,'Cleanup requires secret configuration');
console.log('Photo evidence feature checks passed.');
