import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RM_FAULT_PRIORITIES, RM_FAULT_STATUSES, isFaultUpdateValid } from "../supabase/functions/repair-maintenance-api/update-contract.js";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const html=read("../repair-maintenance.html");
const app=read("../repair-maintenance-app.js");
const api=read("../supabase/functions/repair-maintenance-api/index.ts");
const migration=read("../supabase/migrations/20261124220000_rm_fault_update_status_contract.sql");

// Execute the exact validator imported by the R&M Edge Function.
assert.deepEqual(RM_FAULT_STATUSES,["OPEN","PERM. FIX","IN PROGRESS","REPAIRED"]);
assert.deepEqual(RM_FAULT_PRIORITIES,["HIGH","MEDIUM","LOW"]);
for(const status of RM_FAULT_STATUSES){
  for(const priority of RM_FAULT_PRIORITIES){
    assert.equal(isFaultUpdateValid(status,priority),true,status+" / "+priority+" must be accepted");
  }
}
for(const status of ["","CLOSED","PERMANENT FIX",null,42]){
  assert.equal(isFaultUpdateValid(status,"HIGH"),false,"invalid status must be rejected: "+status);
}
for(const priority of ["","URGENT",null,42]){
  assert.equal(isFaultUpdateValid("OPEN",priority),false,"invalid priority must be rejected: "+priority);
}

// The editor exposes OPEN / PERM. FIX and all three priorities.
const statusStart=html.indexOf('<select id="detailStatus"');
const statusEnd=html.indexOf("</select>",statusStart);
assert.ok(statusStart>=0&&statusEnd>statusStart,"status selector exists");
const statusMarkup=html.slice(statusStart,statusEnd);
for(const status of ["OPEN","PERM. FIX"])assert.ok(statusMarkup.includes("<option>"+status+"</option>"),"UI must expose "+status);
const priorityStart=html.indexOf('<select id="detailPriority"');
const priorityEnd=html.indexOf("</select>",priorityStart);
assert.ok(priorityStart>=0&&priorityEnd>priorityStart,"priority selector exists");
const priorityMarkup=html.slice(priorityStart,priorityEnd);
for(const priority of RM_FAULT_PRIORITIES)assert.ok(priorityMarkup.includes("<option>"+priority+"</option>"),"UI must expose "+priority);

// Older statuses remain visible and selected instead of silently becoming a blank value.
assert.ok(app.includes("option[data-legacy=\"true\"]"),"previous temporary legacy options are cleared");
assert.ok(app.includes("legacyStatus.dataset.legacy='true'"),"unknown stored statuses get a temporary option");
assert.ok(app.includes("statusSelect.value=currentFault.status"),"editor selects the value stored on the fault");

// Client sends both edited values, blocks duplicate submits, and surfaces errors in the open dialog.
const clientStart=app.indexOf("async function updateFault()");
const clientEnd=app.indexOf("function startNote()",clientStart);
assert.ok(clientStart>=0&&clientEnd>clientStart,"client update handler exists");
const clientUpdate=app.slice(clientStart,clientEnd);
assert.ok(clientUpdate.includes("api('update',{faultId:currentFault.id,status,priority})"),"client submits both status and priority");
assert.ok(clientUpdate.includes("button.disabled=true"),"UPDATE cannot be submitted twice while saving");
assert.ok(clientUpdate.includes("say(error.message,'detailUpdateStatus','error')"),"save errors are visible inside the open dialog");
assert.ok(html.includes('id="detailUpdateStatus"')&&html.includes('aria-live="polite"'),"dialog exposes an accessible update result");

// Edge Function validates the shared contract and persists both values against the selected fault.
assert.ok(api.includes('import { RM_FAULT_PRIORITIES, isFaultUpdateValid } from "./update-contract.js"'));
const serverStart=api.indexOf('if (action === "update") {');
const serverEnd=api.indexOf('if (action === "note-add")',serverStart);
assert.ok(serverStart>=0&&serverEnd>serverStart,"backend update action exists");
const serverUpdate=api.slice(serverStart,serverEnd);
assert.ok(serverUpdate.includes("isFaultUpdateValid(body.status, body.priority)"),"backend validates status and priority together");
assert.ok(serverUpdate.includes(".update({ status: body.status, priority: body.priority, updated_by: actor, updated_at:"),"backend persists both fields");
assert.ok(serverUpdate.includes('.eq("id", fault.id).select("*").single()'),"backend returns the updated fault row");

// The migration replaces the old database constraint and keeps pre-existing status values accepted.
assert.ok(migration.includes("drop constraint if exists repair_maintenance_faults_status_check"));
assert.ok(migration.includes("check (status in ('OPEN', 'PERM. FIX', 'IN PROGRESS', 'REPAIRED'))"));
console.log("R&M fault UPDATE status/priority regression: PASS");
