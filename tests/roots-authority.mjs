import assert from "node:assert/strict";
import { resolveRootsAuthority, rootsCapabilities, canInteractWithRootsTarget } from "../supabase/functions/_shared/roots-authority.mjs";

const userId="11111111-1111-4111-8111-111111111111";
const staffId="22222222-2222-4222-8222-222222222222";
const dev1={username:"worker.one",tier:"USER",userId,staffId};
const admin={username:"worker.two",tier:"ADMIN",userId,staffId};
const devAssignment={user_id:userId,staff_id:staffId,roots_class:"DEV1"};
const adminAssignment={user_id:userId,staff_id:staffId,roots_class:"ADMIN"};

assert.equal(resolveRootsAuthority({username:"DEV",tier:"OWNER"}),"DEV");
assert.equal(resolveRootsAuthority({username:"DEVACC",tier:"DEVACC",userId,staffId},devAssignment),null,"legacy DEVACC cannot imply ROOTS");
assert.equal(resolveRootsAuthority({username:"old.admin",tier:"ADMIN",userId,staffId}),null,"legacy ADMIN tier cannot imply protected ADMIN");
assert.equal(resolveRootsAuthority(dev1,devAssignment),"DEV1");
assert.equal(resolveRootsAuthority(admin,adminAssignment),"ADMIN");
assert.equal(resolveRootsAuthority({...dev1,staffId:"33333333-3333-4333-8333-333333333333"},devAssignment),null,"mismatched STAFF assignment cannot grant ROOTS");
assert.equal(resolveRootsAuthority({...dev1,userId:"bad"},devAssignment),null,"invalid immutable identity cannot grant ROOTS");
assert.deepEqual(rootsCapabilities("DEV"),{canBrowseRoots:true,canAssignDev1:true,canAssignAdmin:true,hasAutomaticDepartmentManage:true});
assert.deepEqual(rootsCapabilities("DEV1"),{canBrowseRoots:false,canAssignDev1:false,canAssignAdmin:true,hasAutomaticDepartmentManage:true});
assert.deepEqual(rootsCapabilities("ADMIN"),{canBrowseRoots:false,canAssignDev1:false,canAssignAdmin:false,hasAutomaticDepartmentManage:true});
assert.equal(canInteractWithRootsTarget("DEV1","DEV"),false);
assert.equal(canInteractWithRootsTarget("ADMIN","DEV"),false);
assert.equal(canInteractWithRootsTarget("ADMIN","DEV1"),false);
assert.equal(canInteractWithRootsTarget("DEV1","DEV1"),false);
assert.equal(canInteractWithRootsTarget("DEV","DEV1"),true);
console.log("Protected ROOTS resolver contracts passed.");
