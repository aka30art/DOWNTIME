import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html=await readFile('index.html','utf8');
const fn=await readFile('supabase/functions/photo-evidence/index.ts','utf8');
const migration=await readFile('supabase/migrations/20261120010000_photo_evidence.sql','utf8');
const workflow=await readFile('.github/workflows/photo-evidence-cleanup.yml','utf8');

const config=await readFile('supabase/config.toml','utf8');
assert.match(config,/\[functions\.photo-evidence\]\s+verify_jwt = false/,'custom Central Bank session verification is enabled for the photo endpoint');


assert.match(html,/let SB_URL='https:\/\/ygwfipksbbprqynvbklk\.supabase\.co'/,'Supabase constants remain configured before photo endpoint use');
assert.doesNotMatch(html,/const SB_URL=/,'No duplicate Supabase constants declaration remains');
assert.match(html,/async function photoApi\(action,payload=\{\}\)/,'all photo API operations use the authenticated request helper');
assert.match(html,/window\.DowntimeCentral\?\.session\?\.token/,'photo API reads the active Central Bank session token');
assert.match(html,/x-downtime-session':sessionToken/,'photo API transmits the opaque session token');
assert.equal((html.match(/fetch\(PHOTO_ENDPOINT/g)||[]).length,1,'photo endpoint network calls are centralised in one authenticated helper');

assert.match(html,/id="photoInput" type="file" accept="image\/\*"/,'Gallery/files picker input exists');
assert.match(html,/id="photoCameraInput" type="file" accept="image\/\*" capture="environment"/,'Dedicated camera capture input exists');
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
assert.match(fn,/"Access-Control-Allow-Origin": allowedOrigin/,'photo endpoint CORS is restricted to the application origin');
assert.doesNotMatch(fn,/"Access-Control-Allow-Origin": "\*"/,'photo endpoint does not allow wildcard browser origins');
assert.match(fn,/async function resolveAccess/,'photo endpoint resolves authenticated DOWNTIME access server-side');
assert.match(fn,/from\("downtime_central_sessions"\)/,'photo endpoint validates opaque sessions against the central session table');
assert.match(fn,/from\("downtime_central_bank"\)/,'photo endpoint resolves the current enabled account and tier');
assert.match(fn,/if\(!access\.canEditTracker\)/,'photo upload requires server-side tracker edit permission');
assert.match(fn,/if\(!access\.canDeleteRecords\)/,'photo deletion requires the separate server-side record-delete permission');
assert.match(html,/photoUploading\|\|!permission\('canDeleteRecords'\)/,'photo removal control is gated by the record-delete right');
assert.match(fn,/if\(!access\.canViewDashboards\)/,'view requires server-side dashboard view permission');
assert.match(fn,/DOWNTIME session expired/,'expired sessions are rejected');

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
