import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  activatePendingUserStaffProvisioning,
  buildIdentityMigrationPreview,
  buildNewUserStaffIdentityPair,
  buildPendingUserStaffProvisioning,
  diagnoseIdentityDirectory,
  normaliseIdentityDirectory,
  renameLinkedStaffDisplayName,
  validateNewUserStaffPair,
  validateStaffOperationalProfile,
} from "../supabase/functions/_shared/user-staff-identity.mjs";

const uid1 = "11111111-1111-4111-8111-111111111111";
const sid1 = "22222222-2222-4222-8222-222222222222";
const uid2 = "33333333-3333-4333-8333-333333333333";
const sid2 = "44444444-4444-4444-8444-444444444444";

const legacy = {
  users: [
    { username: "DEV", tier: "OWNER", enabled: true },
    { username: "Jan", tier: "DEVACC", enabled: true },
  ],
  staff: {
    roster: ["Jan", "Legacy Operator"],
    profiles: {
      Jan: { department: "Operations", station: "Line 1", stationLocked: true, onSite: true, photoPath: "jan/photo.png" },
      "Legacy Operator": { department: "Operations", status: "ARCHIVED", photo: "legacy-photo.png" },
    },
  },
};

const legacySnapshot = structuredClone(legacy);
const normalised = normaliseIdentityDirectory(legacy);
assert.equal(normalised.users.length, 2);
assert.equal(normalised.staffProfiles.length, 2);
assert.equal(normalised.staffProfiles[0].stationLocked, true, "operational station locks are preserved");
assert.equal(normalised.staffProfiles[0].photoPath, "jan/photo.png", "photo references are preserved");
assert.equal(normalised.staffProfiles[1].photo, "legacy-photo.png", "legacy photo fields are preserved");
assert.deepEqual(legacy, legacySnapshot, "normalisation must not mutate the legacy payload");
assert.equal(normalised.users[0].userId, undefined, "normalisation must not invent a USER ID");
assert.equal(normalised.users[1].staffId, undefined, "normalisation must not invent a USER/STAFF link");
assert.equal(normalised.staffProfiles[0].staffId, undefined, "normalisation must not invent a STAFF ID");
assert.deepEqual(normaliseIdentityDirectory(legacy), normalised, "normalisation must be deterministic and idempotent");

const preview = buildIdentityMigrationPreview(legacy);
assert.equal(preview.mode, "read-only");
assert.equal(preview.writesPerformed, 0);
assert.equal(preview.users.total, 2);
assert.equal(preview.staff.profileCount, 2);
assert.equal(preview.staff.rosterEntryCount, 2);
assert.equal(preview.staff.compatibilityRosterEntryCount, 0);
assert.equal(preview.staff.compatibilityProfileCount, 0);
assert.equal(preview.users.devRootCount, 1);
assert.equal(preview.readyForIdentityCutover, false, "legacy missing IDs must keep the cutover readiness gate closed");
assert.ok(preview.diagnostics.warnings >= 6);
assert.equal(preview.users.validRecordCount, 2);
assert.equal(preview.staff.validProfileCount, 2);
assert.ok(preview.findings.some((item) => item.code === "legacy-name-match-unverified"), "possible name matches are reported but never linked");

const generatedPair = buildNewUserStaffIdentityPair(
  { username: "Generated.User", displayName: "Generated User" },
  { displayName: "Generated User", department: "Operations", station: "Line 2", stationLocked: false },
  [],
  [],
  (() => { const ids = [uid1, sid1]; return () => ids.shift(); })(),
);
assert.equal(generatedPair.user.userId, uid1);
assert.equal(generatedPair.user.staffId, sid1);
assert.equal(generatedPair.user.status, "PROVISIONING");
assert.equal(generatedPair.user.enabled, false, "new USER remains unable to authenticate before role provisioning completes");
assert.equal(generatedPair.staff.staffId, sid1);
assert.equal(generatedPair.staff.linkedUserId, uid1);
assert.equal(generatedPair.staff.station, "Line 2");
assert.equal(generatedPair.staff.stationLocked, false);
assert.throws(() => buildNewUserStaffIdentityPair(
  { username: "Injected", displayName: "Injected", userId: uid1 },
  { displayName: "Injected" },
), /USER identity, tier, credential and activation fields are server-generated/);
assert.throws(() => buildNewUserStaffIdentityPair(
  { username: "Generated.User", displayName: "Generated User" },
  { displayName: "Generated User", linkedUserId: uid1 },
), /STAFF identity and ROOTS fields are server-generated/);
assert.throws(() => buildNewUserStaffIdentityPair(
  { username: "DEV", displayName: "DEV" },
  { displayName: "DEV" },
), /DEV is the immutable root identity/);
assert.throws(() => buildNewUserStaffIdentityPair(
  { username: "Broken", displayName: "Broken" },
  { displayName: "Broken" },
  [],
  [],
  () => uid1,
), /two distinct UUIDs/);

const validUser = { userId: uid1, staffId: sid1, username: "New.User", displayName: "New User" };
const validStaff = { staffId: sid1, linkedUserId: uid1, displayName: "New User", department: "Operations" };
assert.deepEqual(validateNewUserStaffPair(validUser, validStaff), {
  valid: true, userId: uid1, staffId: sid1, linkedUserId: uid1,
});

assert.throws(() => validateNewUserStaffPair(
  { ...validUser, staffId: sid2 }, validStaff,
), /USER\.staffId must match/);
assert.throws(() => validateNewUserStaffPair(
  validUser, { ...validStaff, linkedUserId: uid2 },
), /STAFF\.linkedUserId must match/);
assert.throws(() => validateNewUserStaffPair(
  { ...validUser, userId: "not-a-uuid" }, validStaff,
), /USER userId must be a valid/);
assert.throws(() => validateNewUserStaffPair(
  { ...validUser, username: "dev" }, validStaff,
), /DEV is the immutable root/);
assert.throws(() => validateNewUserStaffPair(
  { ...validUser, rootsClass: "ADMIN" }, validStaff,
), /Protected ROOTS classification cannot be supplied/);
assert.throws(() => validateNewUserStaffPair(
  { ...validUser, tier: "ADMIN" }, validStaff,
), /Legacy tier claims cannot be supplied/);
assert.throws(() => validateNewUserStaffPair(
  validUser, validStaff, [{ username: "NEW.USER" }], [],
), /username already exists/);
assert.throws(() => validateNewUserStaffPair(
  validUser, validStaff, [{ username: "Other", userId: uid1 }], [],
), /userId already exists/);
assert.throws(() => validateNewUserStaffPair(
  validUser, validStaff, [], [{ staffId: sid1 }],
), /STAFF staffId already exists/);
assert.throws(() => validateNewUserStaffPair(
  validUser, validStaff, [], [{ linkedUserId: uid1 }],
), /already linked to a STAFF/);

const linked = {
  users: [
    { username: "DEV", userId: uid2 },
    { username: "New.User", userId: uid1, staffId: sid1 },
  ],
  staff: {
    profiles: {
      "New User": { staffId: sid1, linkedUserId: uid1 },
    },
    roster: ["New User"],
  },
};
assert.equal(diagnoseIdentityDirectory(linked).filter((item) => item.severity === "error").length, 0);
assert.equal(diagnoseIdentityDirectory(linked).length, 0, "DEV is correctly exempt from a STAFF link");
const cleanTarget = {
  users: [{ username: "DEV", userId: uid2 }],
  staff: { roster: [], profiles: {} },
  appData: { staffRoster: [], operatorProfiles: {} },
};
assert.equal(buildIdentityMigrationPreview(cleanTarget).readyForIdentityCutover, true, "a valid DEV-only reset target passes readiness");
assert.equal(buildIdentityMigrationPreview(linked).readyForIdentityCutover, false, "a linked multi-user directory is not the clean cutover target");
const malformedRecords = {
  users: [{ username: "DEV", userId: uid2 }, null],
  staff: { roster: [], profiles: { Broken: null } },
};
const malformedPreview = buildIdentityMigrationPreview(malformedRecords);
assert.equal(malformedPreview.users.total, 2);
assert.equal(malformedPreview.users.validRecordCount, 1);
assert.equal(malformedPreview.users.invalidRecordCount, 1);
assert.equal(malformedPreview.staff.profileCount, 1);
assert.equal(malformedPreview.staff.validProfileCount, 0);
assert.equal(malformedPreview.staff.invalidProfileCount, 1);
assert.equal(malformedPreview.readyForIdentityCutover, false, "malformed identity records must block readiness");

const staleCompatibility = {
  users: [{ username: "DEV", userId: uid2 }],
  staff: { roster: [], profiles: {} },
  appData: { staffRoster: ["Old Staff"], operatorProfiles: { "Old Staff": {} } },
};
const stalePreview = buildIdentityMigrationPreview(staleCompatibility);
assert.equal(stalePreview.readyForIdentityCutover, false, "compatibility STAFF copies must also be empty at reset completion");
assert.equal(stalePreview.staff.compatibilityRosterEntryCount, 1);
assert.equal(stalePreview.staff.compatibilityProfileCount, 1);

const duplicateAndOrphan = {
  users: [
    { username: "Sam", userId: uid1, staffId: sid1 },
    { username: " sam ", userId: uid1, staffId: "55555555-5555-4555-8555-555555555555" },
    { username: "Orphan", userId: uid2, staffId: "55555555-5555-4555-8555-555555555555" },
  ],
  staff: {
    profiles: {
      First: { staffId: sid1, linkedUserId: "66666666-6666-4666-8666-666666666666" },
      Second: { staffId: sid1, linkedUserId: uid1 },
      Third: { staffId: sid2, linkedUserId: uid1 },
    },
  },
};
const issues = diagnoseIdentityDirectory(duplicateAndOrphan);
for (const code of [
  "duplicate-username",
  "duplicate-user-id",
  "duplicate-staff-id",
  "user-has-multiple-staff",
  "orphan-user-staff-link",
  "orphan-staff-user-link",
]) assert.ok(issues.some((item) => item.code === code), "diagnostic " + code);

const rosterMismatch = {
  users: [{ username: "DEV", userId: uid2 }],
  staff: { roster: ["Roster Only"], profiles: { "Different Profile": {} } },
  appData: { staffRoster: ["Legacy Copy"], operatorProfiles: { "Legacy Copy": {} } },
};
const ambiguousNames = {
  users: [{ username: "Sam", displayName: "Sam", userId: uid1 }],
  staff: { roster: ["First", "Second"], profiles: {
    First: { displayName: "Sam" },
    Second: { displayName: "Sam" },
  } },
};
assert.ok(diagnoseIdentityDirectory(ambiguousNames).some((item) => item.code === "ambiguous-legacy-name-match"), "ambiguous name matches block guessing");
const mismatchCodes = diagnoseIdentityDirectory(rosterMismatch).map((item) => item.code);
assert.ok(mismatchCodes.includes("staff-roster-profile-missing"));
assert.ok(mismatchCodes.includes("staff-roster-compatibility-mismatch"));
assert.ok(mismatchCodes.includes("staff-profile-compatibility-mismatch"));

const noMutationSnapshot = structuredClone(linked);
buildIdentityMigrationPreview(linked);
assert.deepEqual(linked, noMutationSnapshot, "migration preview must be read-only");

const operationalStaff = validateStaffOperationalProfile({
  department: "SCPL",
  onSiteRole: "Main Operator",
  onSite: true,
  station: "Station 1 · WOOD",
  stationLocked: true,
});
assert.deepEqual(operationalStaff, {
  department: "SCPL",
  onSiteRole: "Main Operator",
  station: "Station 1 · WOOD",
  stationLocked: true,
  onSite: true,
});
assert.throws(() => validateStaffOperationalProfile({
  department: "SCPL", onSiteRole: "Mechanic", onSite: true, station: "", stationLocked: false,
}), /operational role is invalid/);
assert.throws(() => validateStaffOperationalProfile({
  department: "SCPL", onSiteRole: "Main Operator", onSite: true, station: "", stationLocked: true,
}), /locked STAFF station must have/);
assert.throws(() => validateStaffOperationalProfile({
  department: "R&M", onSiteRole: "Mechanic", onSite: true, station: "Station 1 · WOOD", stationLocked: false,
}), /available only for SCPL/);
assert.throws(() => validateStaffOperationalProfile({
  department: "R&M", onSiteRole: "Mechanic", onSite: true, station: "", stationLocked: false, photoPath: "private/path",
}), /photo fields are not accepted/);

const requestedRoleId = "77777777-7777-4777-8777-777777777777";
const idempotencyKey = "88888888-8888-4888-8888-888888888888";
const provisioningBank = {
  users: [{ username: "DEV", userId: uid2, tier: "OWNER", enabled: true }],
  staff: { roster: [], profiles: {} },
  appData: { staffRoster: [], operatorProfiles: {} },
};
const provisioningInput = {
  idempotencyKey,
  requestFingerprint: "c".repeat(64),
  userId: uid1,
  staffId: sid1,
  requestedYardRoleId: requestedRoleId,
  userFields: { username: "New.Operator", displayName: "New Operator" },
  staffFields: {
    department: "SCPL",
    onSiteRole: "Main Operator",
    onSite: true,
    station: "Station 1 · WOOD",
    stationLocked: true,
  },
  pinSalt: "a".repeat(32),
  pinHash: "b".repeat(64),
  actorUserId: uid2,
  actorUsername: "DEV",
  actorDisplayName: "DEV",
  createdAt: "2026-11-26T23:00:00.000Z",
};
const provisioningBankSnapshot = structuredClone(provisioningBank);
const pending = buildPendingUserStaffProvisioning(provisioningBank, provisioningInput);
assert.deepEqual(provisioningBank, provisioningBankSnapshot, "pending provisioning must not mutate its input payload");
const pendingUser = pending.payload.users.find((item) => item.userId === uid1);
const pendingStaff = pending.payload.staff.profiles["New Operator"];
assert.equal(pendingUser.status, "PROVISIONING");
assert.equal(pendingUser.enabled, false, "pending USER cannot authenticate");
assert.equal(pendingUser.tier, undefined, "new USER receives no legacy tier claim");
assert.equal(pendingUser.provisioning.stage, "YARD_ROLE_PENDING");
assert.equal(pendingUser.provisioning.requestedYardRoleId, requestedRoleId);
assert.equal(pendingStaff.status, "PROVISIONING");
assert.equal(pendingStaff.staffId, sid1);
assert.equal(pendingStaff.linkedUserId, uid1);
assert.equal(pendingStaff.station, "Station 1 · WOOD");
assert.deepEqual(pending.payload.staff.roster, [], "pending STAFF must not appear in active roster");
assert.deepEqual(pending.payload.appData.staffRoster, [], "pending STAFF must not appear in compatibility roster");
assert.deepEqual(pending.payload.appData.operatorProfiles, {}, "pending STAFF must not appear in active operator profiles");
assert.equal(pending.receipt.stage, "YARD_ROLE_PENDING");
assert.equal(pending.auditEvent.action, "USER_STAFF_PROVISIONING_STARTED");
assert.equal(pending.auditEvent.actorUserId, uid2);
assert.equal(pending.auditEvent.actorUsername, "DEV");
assert.equal(pending.auditEvent.actorDisplayName, "DEV");
assert.equal(pending.payload.identityProvisioningEvents, undefined, "mutable payload is not treated as immutable audit history");
assert.equal(buildPendingUserStaffProvisioning(pending.payload, provisioningInput).replayed, true, "same idempotency key and fingerprint replay safely");
assert.throws(() => buildPendingUserStaffProvisioning(pending.payload, {
  ...provisioningInput, requestFingerprint: "d".repeat(64),
}), /different provisioning request/);
assert.throws(() => buildPendingUserStaffProvisioning(provisioningBank, {
  ...provisioningInput, requestedYardRoleId: "not-a-role-id",
}), /canonical YARD ROLE ID/);
const duplicateCompatibilityName = {
  users: [{ username: "DEV", userId: uid2 }],
  staff: { roster: [], profiles: {} },
  appData: { operatorProfiles: { "New Operator": {} }, staffRoster: [] },
};
assert.throws(() => buildPendingUserStaffProvisioning(duplicateCompatibilityName, provisioningInput), /display name already exists/);

const validRoleAssignment = {
  userId: uid1,
  staffId: sid1,
  yardRoleId: requestedRoleId,
  status: "ACTIVE",
  version: 1,
  verifiedAt: "2026-11-26T23:01:00.000Z",
};
assert.throws(() => activatePendingUserStaffProvisioning(pending.payload, {
  ...validRoleAssignment, status: "PENDING",
}, { userId: uid2, username: "DEV", displayName: "DEV" }), /verified active canonical YARD ROLE assignment/);
const prematurelyEnabled = structuredClone(pending.payload);
prematurelyEnabled.users.find((item) => item.userId === uid1).enabled = true;
assert.throws(() => activatePendingUserStaffProvisioning(prematurelyEnabled, validRoleAssignment, { userId: uid2, username: "DEV", displayName: "DEV" }), /must remain disabled/);
assert.throws(() => activatePendingUserStaffProvisioning(pending.payload, {
  ...validRoleAssignment, staffId: sid2,
}, { userId: uid2, username: "DEV", displayName: "DEV" }), /does not match the USER\/STAFF identity pair/);
const activated = activatePendingUserStaffProvisioning(pending.payload, validRoleAssignment, { userId: uid2, username: "DEV", displayName: "DEV" }, "2026-11-26T23:02:00.000Z");
const activeUser = activated.payload.users.find((item) => item.userId === uid1);
const activeStaff = activated.payload.staff.profiles["New Operator"];
assert.equal(activeUser.status, "ACTIVE");
assert.equal(activeUser.enabled, true);
assert.equal(activeUser.yardRoleId, requestedRoleId);
assert.equal(activeUser.tier, undefined, "activation does not restore legacy tier permissions");
assert.equal(activeUser.provisioning, undefined);
assert.equal(activeStaff.status, "ACTIVE");
assert.deepEqual(activated.payload.staff.roster, ["New Operator"]);
assert.deepEqual(activated.payload.appData.staffRoster, ["New Operator"]);
assert.equal(activated.payload.appData.operatorProfiles["New Operator"].staffId, sid1);
assert.equal(activated.payload.identityProvisioningReceipts[idempotencyKey].stage, "ACTIVE");
assert.equal(activated.payload.identityProvisioningReceipts[idempotencyKey].roleAssignmentVersion, 1);
assert.equal(activated.auditEvent.action, "USER_STAFF_PROVISIONING_ACTIVATED");
assert.equal(activated.auditEvent.actorUserId, uid2);
assert.equal(activated.auditEvent.actorUsername, "DEV");
assert.equal(activated.auditEvent.actorDisplayName, "DEV");
assert.equal(activated.payload.identityProvisioningEvents, undefined);
assert.equal(activatePendingUserStaffProvisioning(activated.payload, validRoleAssignment, { userId: uid2, username: "DEV", displayName: "DEV" }).replayed, true, "activation retries are idempotent");

const renameSource = structuredClone(activated.payload);
const renamedStaff = renameLinkedStaffDisplayName(renameSource, uid1, sid1, "Renamed Operator");
assert.equal(renamedStaff.changed, true);
assert.equal(renamedStaff.payload.users.find((item) => item.userId === uid1).staffId, sid1);
assert.equal(renamedStaff.payload.staff.profiles["Renamed Operator"].staffId, sid1);
assert.equal(renamedStaff.payload.staff.profiles["Renamed Operator"].linkedUserId, uid1);
assert.deepEqual(renamedStaff.payload.staff.roster, ["Renamed Operator"]);
assert.deepEqual(renamedStaff.payload.appData.staffRoster, ["Renamed Operator"]);
assert.equal(renamedStaff.payload.appData.operatorProfiles["Renamed Operator"].staffId, sid1);
assert.deepEqual(renameSource, activated.payload, "linked STAFF rename must not mutate the original payload");
const collisionPayload = structuredClone(activated.payload);
collisionPayload.staff.profiles["Other Staff"] = { staffId: sid2, linkedUserId: uid2 };
assert.throws(() => renameLinkedStaffDisplayName(collisionPayload, uid1, sid1, "Other Staff"), /display name already exists/);
const missingActiveStaff = structuredClone(activated.payload);
delete missingActiveStaff.staff.profiles["New Operator"];
assert.throws(() => activatePendingUserStaffProvisioning(missingActiveStaff, validRoleAssignment, { userId: uid2, username: "DEV", displayName: "DEV" }), /missing its reciprocal active STAFF profile/);
const missingActiveRoster = structuredClone(activated.payload);
missingActiveRoster.staff.roster = [];
assert.throws(() => activatePendingUserStaffProvisioning(missingActiveRoster, validRoleAssignment, { userId: uid2, username: "DEV", displayName: "DEV" }), /missing from the canonical roster/);

const centralApi = await readFile("supabase/functions/central-bank/index.ts", "utf8");
const yardHubApi = await readFile("supabase/functions/yard-hub-settings-api/index.ts", "utf8");
const browserClient = await readFile("central-bank-client.js", "utf8");
const yardHubUi = await readFile("yard-hub-settings.js", "utf8");
const html = await readFile("index.html", "utf8");
const provisioningMigration = await readFile("supabase/migrations/20261126233000_canonical_yard_role_registry.sql", "utf8");
const resolverSource = await readFile("supabase/functions/_shared/yard-role-resolver.mjs", "utf8");
const repairMaintenanceApi = await readFile("supabase/functions/repair-maintenance-api/index.ts", "utf8");
const gatelogApi = await readFile("supabase/functions/gatelog-api/index.ts", "utf8");

assert.match(centralApi, /import \{ resolveYardRolePermissions \} from ["']\.\.\/_shared\/yard-role-resolver\.mjs["']/);
assert.match(centralApi, /import \{ activatePendingUserStaffProvisioning, buildIdentityMigrationPreview, buildPendingUserStaffProvisioning, renameLinkedStaffDisplayName \} from ["']\.\.\/_shared\/user-staff-identity\.mjs["']/);
const provisioningRoutes = centralApi.slice(
  centralApi.indexOf('if(action==="user-staff-provision")'),
  centralApi.indexOf('if(action==="identity-diagnostics")'),
);
assert.ok(provisioningRoutes.length > 0, "staged USER/STAFF provisioning routes are registered");
assert.match(provisioningRoutes, /if\(!isDevRoot\)/, "only immutable DEV can provision and activate new identities");
assert.match(provisioningRoutes, /buildPendingUserStaffProvisioning\(bank/);
assert.match(provisioningRoutes, /requestedYardRoleId/);
assert.match(provisioningRoutes, /yard_role_assignments/, "activation reads the canonical YARD ROLE assignment store");
assert.match(provisioningRoutes, /resolveYardRolePermissions\(role,permissions\|\|\[\]\)/, "activation revalidates the active role and complete permission matrix");
assert.match(provisioningRoutes, /activatePendingUserStaffProvisioning\(bank,roleAssignment,\{userId:currentUser\.userId,username:currentUser\.username/);
assert.match(provisioningRoutes, /downtime_central_commit_identity_event/, "payload commit and immutable audit are atomic");
assert.doesNotMatch(provisioningRoutes, /yard_hub_tier_config|save-user-tier/, "legacy YARD HUB tiers cannot activate new identities");
assert.match(centralApi, /renameLinkedStaffDisplayName\(bank,existing\.userId,existing\.staffId,displayName\)/, "USER display-name edits preserve the linked STAFF identity");
assert.match(centralApi, /Canonical YARD ROLE identities cannot receive legacy tier claims/);
assert.match(centralApi, /This USER has a linked STAFF identity\. Disable the USER/);
assert.match(centralApi, /STAFF-only saves cannot create or alter authenticated USER identity links/);
assert.match(centralApi, /Linked STAFF profiles cannot be removed through tracker saves/);
assert.match(centralApi, /STAFF Settings cannot create or alter authenticated USER identity links/);

const legacyUserSave = centralApi.slice(
  centralApi.indexOf('if(action==="user-save")'),
  centralApi.indexOf('if(action==="user-delete")'),
);
assert.match(legacyUserSave, /New accounts must use the canonical USER \+ STAFF \+ YARD ROLE provisioning workflow/);

assert.match(yardHubApi, /action === "assign-user-role"/);
assert.match(yardHubApi, /yard_role_assign_user/);
assert.match(yardHubApi, /const targetUserId = String\(body\.userId \|\| ""\)/, "YARD ROLE assignment addresses the immutable USER ID rather than a username");
assert.match(yardHubApi, /yardRoles/);
assert.match(yardHubApi, /yard_role_assignments/);
assert.match(yardHubApi, /resolveYardRolePermissions/);
assert.match(yardHubApi, /assignableYardRoles/, "only roles with a valid permission matrix are offered for assignment");
assert.match(yardHubApi, /Canonical YARD ROLE identities cannot be assigned legacy YARD HUB tiers/);
assert.match(yardHubApi, /const canAccessYardHub = isProtectedRoot[\s\S]*!hasCanonicalYardRole/, "ordinary canonical identities cannot access YARD HUB settings through legacy tiers, while protected ROOTS is resolved separately");
assert.match(yardHubApi, /legacyTier: account\.tier \? String\(account\.tier\)\.toUpperCase\(\) : null/, "no legacy tier is fabricated for canonical USERs");

assert.match(yardHubUi, /yardHubUserYardRole/);
assert.match(yardHubUi, /yardHubStaffFields/);
assert.match(yardHubUi, /assign-user-role/);
assert.match(yardHubUi, /activateDowntimeCentralUserFromYardHub/);
assert.match(yardHubUi, /NO ACTIVE YARD ROLES CONFIGURED/, "account creation remains blocked when the role catalogue is empty");
assert.match(html, /yardHubUserYardRole/);
assert.match(html, /yardHubStaffDepartment/);
assert.match(html, /provisionUserStaff/);
assert.match(html, /activateDowntimeCentralUserFromYardHub/);

assert.match(browserClient, /identityDiagnostics\(\)\{return call\("identity-diagnostics"\)\}/, "browser adapter exposes read-only diagnostics");
assert.match(browserClient, /provisionUserStaff\(data,version,idempotencyKey\)/);
assert.match(browserClient, /activateProvisionedUser\(userId,version\)/);

assert.match(provisioningMigration, /create table if not exists public\.yard_roles/);
assert.match(provisioningMigration, /create table if not exists public\.yard_role_assignments/);
assert.match(provisioningMigration, /yard_role_assign_user/);
assert.match(provisioningMigration, /downtime_central_commit_identity_event/);
assert.match(provisioningMigration, /enable row level security/);
assert.doesNotMatch(provisioningMigration, /insert into public\.yard_roles/i, "no unapproved YARD ROLE catalogue entries are seeded");

assert.match(resolverSource, /OFF.*READ_ONLY.*INPUT.*MANAGE/);
assert.match(repairMaintenanceApi, /if \(user\.yardRoleId\) return json\(\{ error: "Canonical YARD ROLE authorization is not yet enabled for R&M/);
assert.match(gatelogApi, /if\(user\.yardRoleId\)return json\(\{error:"Canonical YARD ROLE authorization is not yet enabled for GATELOG/);
assert.match(centralApi, /DOWNTIME_IDENTITY_FINGERPRINT_SECRET/, "provisioning fingerprints require a server-only secret");
assert.match(centralApi, /hmacDigest\(fingerprintSecret,JSON\.stringify\(\{username,displayName,pin,staff:staffFields,requestedYardRoleId\}\)\)/, "low-entropy PIN is protected by HMAC in the idempotency fingerprint");
assert.match(centralApi, /const userId=String\(body\.userId\|\|""\)/, "activation targets immutable USER ID");
assert.match(centralApi, /actorUserId:currentUser\.userId,actorUsername:currentUser\.username,actorDisplayName/, "provisioning audit captures immutable actor identity and display-name snapshot");
assert.match(yardHubApi, /p_actor_user_id: user\.userId/, "YARD ROLE assignment audit captures immutable actor ID");
const yardRoleAssignmentRoute = yardHubApi.slice(yardHubApi.indexOf('if (action === "assign-user-role")'), yardHubApi.indexOf('if (action === "save-user-tier")'));
assert.doesNotMatch(yardRoleAssignmentRoute, /targetUsername|body\.username/, "YARD ROLE assignment never targets a mutable username");
assert.match(provisioningMigration, /actor_user_id uuid not null/, "YARD ROLE assignment audit stores immutable actor ID");
assert.match(provisioningMigration, /p_actor_user_id uuid/, "YARD ROLE assignment RPC requires immutable actor ID");
assert.match(resolverSource, /SCPL.*R&M.*Management.*SCFL.*Traffic/, "resolver enforces the owner-approved five-department catalogue");
console.log("PASS: additive USER/STAFF identity contract, DEV-only read-only diagnostics and reciprocal-link validation.");
