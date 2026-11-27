import assert from "node:assert/strict";
import { resolveRootsAuthority, rootsCapabilities, canInteractWithRootsTarget } from "../supabase/functions/_shared/roots-authority.mjs";

const devId="00000000-0000-4000-8000-000000000001";\nconst userId="11111111-1111-4111-8111-111111111111";
const staffId="22222222-2222-4222-8222-222222222222";
const dev1={username:"worker.one",tier:"USER",userId,staffId,enabled:true,status:"ACTIVE"};
const admin={username:"worker.two",tier:"ADMIN",userId,staffId,enabled:true,status:"ACTIVE"};
const devAssignment={user_id:userId,staff_id:staffId,roots_class:"DEV1",status:"ACTIVE"};
const adminAssignment={user_id:userId,staff_id:staffId,roots_class:"ADMIN",status:"ACTIVE"};

assert.equal(resolveRootsAuthority({username:"DEV",tier:"OWNER",userId:devId},null,devId),"DEV");\nassert.equal(resolveRootsAuthority({username:"DEV",tier:"OWNER",userId},null,devId),null,"DEV username alone cannot imply bootstrap authority");
assert.equal(resolveRootsAuthority({username:"DEVACC",tier:"DEVACC",userId,staffId},devAssignment),null,"legacy DEVACC cannot imply ROOTS");
assert.equal(resolveRootsAuthority({username:"old.admin",tier:"ADMIN",userId,staffId}),null,"legacy ADMIN tier cannot imply protected ADMIN");
assert.equal(resolveRootsAuthority(dev1,devAssignment),"DEV1");
assert.equal(resolveRootsAuthority(admin,adminAssignment),"ADMIN");
assert.equal(resolveRootsAuthority({...dev1,staffId:"33333333-3333-4333-8333-333333333333"},devAssignment),null,"mismatched STAFF assignment cannot grant ROOTS");
assert.equal(resolveRootsAuthority({...dev1,userId:"bad"},devAssignment),null,"invalid immutable identity cannot grant ROOTS");
assert.equal(resolveRootsAuthority({...dev1,enabled:false},devAssignment),null,"disabled USER cannot retain ROOTS authority");
assert.equal(resolveRootsAuthority({...dev1,status:"PENDING"},devAssignment),null,"inactive USER cannot retain ROOTS authority");
assert.deepEqual(rootsCapabilities("DEV"),{canBrowseRoots:true,canAssignDev1:true,canAssignAdmin:true,canManageYardRoles:true,hasAutomaticDepartmentManage:true,canReclassifyRoots:true,canRevokeRoots:true});
assert.deepEqual(rootsCapabilities("DEV1"),{canBrowseRoots:false,canAssignDev1:false,canAssignAdmin:true,canManageYardRoles:true,hasAutomaticDepartmentManage:true,canReclassifyRoots:false,canRevokeRoots:false});
assert.deepEqual(rootsCapabilities("ADMIN"),{canBrowseRoots:false,canAssignDev1:false,canAssignAdmin:false,canManageYardRoles:true,hasAutomaticDepartmentManage:true,canReclassifyRoots:false,canRevokeRoots:false});
assert.equal(canInteractWithRootsTarget("DEV1","DEV"),false);
assert.equal(canInteractWithRootsTarget("ADMIN","DEV"),false);
assert.equal(canInteractWithRootsTarget("ADMIN","DEV1"),false);
assert.equal(canInteractWithRootsTarget("DEV1","DEV1"),false);
assert.equal(canInteractWithRootsTarget("DEV","DEV1"),true);\nassert.equal(canInteractWithRootsTarget("DEV1","ADMIN"),true);\nassert.equal(canInteractWithRootsTarget("ADMIN","ADMIN"),false);
console.log("Protected ROOTS resolver contracts passed.");
