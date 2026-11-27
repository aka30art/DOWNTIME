import assert from "node:assert/strict";
import { canYardRolePerform, resolveYardRolePermissions, YARD_ROLE_ACCESS_LEVELS, YARD_ROLE_DEPARTMENTS, YARD_ROLE_PERMISSION_KEYS } from "../supabase/functions/_shared/yard-role-resolver.mjs";

const role = { id: "11111111-1111-4111-8111-111111111111", name: "Test Role", status: "ACTIVE" };
const flags = {
  "OFF": [false,false,false,false],
  "READ ONLY": [true,false,false,false],
  "INPUT": [true,true,false,false],
  "MANAGE": [true,true,true,true],
};
const rows = YARD_ROLE_DEPARTMENTS.map((department,index) => {
  const [can_view,can_enter,can_edit,can_manage] = flags[YARD_ROLE_ACCESS_LEVELS[index%4]];
  return {yard_role_id:role.id,department,can_view,can_enter,can_edit,can_manage};
});
const resolved = resolveYardRolePermissions(role, rows);
assert.deepEqual(YARD_ROLE_PERMISSION_KEYS, ["view","enter","edit","manage"]);
assert.deepEqual(YARD_ROLE_ACCESS_LEVELS, ["OFF","READ ONLY","INPUT","MANAGE"]);
assert.deepEqual(YARD_ROLE_DEPARTMENTS, ["SCPL","R&M","Management","SCFL","Traffic"]);
assert.equal(resolved.departments.SCPL.level,"OFF");
assert.equal(resolved.departments["R&M"].level,"READ ONLY");
assert.equal(resolved.departments.Management.level,"INPUT");
assert.equal(resolved.departments.SCFL.level,"MANAGE");
assert.equal(canYardRolePerform(resolved,"SCPL","VIEW"),false);
assert.equal(canYardRolePerform(resolved,"R&M","VIEW"),true);
assert.equal(canYardRolePerform(resolved,"R&M","ENTER"),false);
assert.equal(canYardRolePerform(resolved,"Management","VIEW"),true);
assert.equal(canYardRolePerform(resolved,"Management","ENTER"),true);
assert.equal(canYardRolePerform(resolved,"Management","EDIT"),false);
assert.equal(canYardRolePerform(resolved,"SCFL","VIEW"),true);
assert.equal(canYardRolePerform(resolved,"SCFL","ENTER"),true);
assert.equal(canYardRolePerform(resolved,"SCFL","EDIT"),true);
assert.equal(canYardRolePerform(resolved,"SCFL","MANAGE"),true);
assert.equal(canYardRolePerform(resolved,"UNKNOWN","VIEW"),false);
assert.equal(canYardRolePerform(resolved,"ROOTS","MANAGE"),false);
assert.throws(()=>resolveYardRolePermissions({...role,status:"RETIRED"},[]),/not active/);
assert.throws(()=>resolveYardRolePermissions(role,rows.slice(0,4)),/exactly one access-level record/);
assert.throws(()=>resolveYardRolePermissions(role,[...rows,rows[0]]),/only one permission record/);
assert.throws(()=>resolveYardRolePermissions(role,rows.map((row,i)=>i?row:{...row,can_view:"true"})),/explicit boolean/);
assert.throws(()=>resolveYardRolePermissions(role,rows.map((row,i)=>i?row:{...row,department:"GATELOG"})),/not in the approved department catalogue/);
assert.throws(()=>resolveYardRolePermissions(role,rows.map((row,i)=>i?row:{...row,can_view:false,can_enter:true})),/OFF, READ ONLY, INPUT or MANAGE/);
assert.throws(()=>resolveYardRolePermissions({id:"bad",status:"ACTIVE"},[]),/immutable UUID/);
console.log("PASS: YARD ROLE resolver enforces the four access levels OFF / READ ONLY / INPUT / MANAGE for all five departments.");
