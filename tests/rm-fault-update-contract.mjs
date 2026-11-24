import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RM_FAULT_PRIORITIES, RM_FAULT_STATUSES, isFaultUpdateValid } from "../supabase/functions/repair-maintenance-api/update-contract.js";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const html=read("../repair-maintenance.html");
const app=read("../repair-maintenance-app.js");
const api=read("../supabase/functions/repair-maintenance-api/index.ts");
const migration=read("../supabase/migrations/20261124220000_rm_fault_update_status_contract.sql");

// Exercise the exact status/priority validator used by the Edge Function.
assert.deepEqual(RM_FAULT_STATUSES,["OPEN","PERM. FIX","IN PROGRESS","REPAIRED"]);
assert.deepEqual(RM_FAULT_PRIORITIES,["HIGH","MEDIUM","LOW"]);
for(const status of ["OPEN","PERM. FIX","IN PROGRESS","REPAIRED"]){
  for(const priority of ["HIGH","MEDIUM","LOW"]){
    assert.equal(isFaultUpdateValid(status,priority),true, status+" / "+priority+" must be accepted");
  }
}
for(const status of ["","CLOSED","PERMANENT FIX",null,42]){
  assert.equal(isFaultUpdateValid(status,"HIGH"),false,"invalid status must be rejected: "+status);
}
for(const priority of ["","URGENT",null,42]){
  assert.equal(isFaultUpdateValid("OPEN",priority),false,"invalid priority must be rejected: "+priority);
}

// The user-facing editor exposes the intended status and priority choices.
const statusMarkup=html.match(/<select id="detailStatus"[^>]*>([\\s\\S]*?)<\\/select>/)?.[1]||"";
for(const status of ["OPEN","PERM. FIX"])assert.ok(statusMarkup.includes("<option>"+status+"</option>"),"UI must expose "+status);
const priorityMarkup=html.match(/<select id="detailPriority"[^>]*>([\\s\\S]*?)<\\/select>/)?.[1]||"";
for(const priority of RM_FAULT_PRIORITIES)assert.ok(priorityMarkup.includes("<option>"+priority+"</option>"),"UI must expose "+priority);

// Existing records with pre-change status values must remain visible/editable.
assert.match(app,/legacyStatus\.dataset\.legacy='true'/,"unknown legacy status is retained as an editor option");
assert.match(app,/statusSelect\.value=currentFault\.status/,"editor opens with the stored status selected");

// The client sends both edited values, disables duplicate submits, and surfaces failures in the open dialog.
const clientUpdate=app.match(/async function updateFault\(\)\{([\\s\\S]*?)\n  \}/)?.[1]||"";
assert.ok(clientUpdate,"client update handler exists");
assert.match(clientUpdate,/api\('update',\{faultId:currentFault\.id,status,priority\}\)/,"client submits both status and priority");
assert.match(clientUpdate,/button\.disabled=true/,"UPDATE cannot be submitted twice while saving");
assert.match(clientUpdate,/say\(error\.message,'detailUpdateStatus','error'\)/,"save errors are visible inside the open details dialog");
assert.match(html,/id="detailUpdateStatus"[^>]*role="status"[^>]*aria-live="polite"/,"dialog exposes an accessible update result");

 // The Edge Function validates the shared contract and persists both fields against the selected fault.
assert.match(api,/import \{ RM_FAULT_PRIORITIES, isFaultUpdateValid \} from "\.\/update-contract\.js"/);
const serverUpdate=api.match(/if \(action === "update"\) \{([\\s\\S]*?)\n    \}\n\n    if \(action === "note-add"\)/)?.[1]||"";
assert.ok(serverUpdate,"backend update action exists");
assert.match(serverUpdate,/isFaultUpdateValid\(body\.status, body\.priority\)/,"backend validates status and priority together");
assert.match(serverUpdate,/\.update\(\{ status: body\.status, priority: body\.priority, updated_by: actor, updated_at:/,"backend persists both fields");
assert.match(serverUpdate,/\.eq\("id", fault\.id\)\.select\("\*"\)\.single\(\)/,"backend returns the updated fault row");

// Database check constraint must accept the current UI value and retain legacy values.
assert.match(migration,/drop constraint if exists repair_maintenance_faults_status_check/);
assert.match(migration,/check \(status in \('OPEN', 'PERM\\. FIX', 'IN PROGRESS', 'REPAIRED'\)\)/);
console.log("R&M fault UPDATE status/priority regression: PASS");
