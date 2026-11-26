import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildIdentityMigrationPreview,
  diagnoseIdentityDirectory,
  normaliseIdentityDirectory,
  validateNewUserStaffPair,
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
      Jan: { department: "Operations", station: "Line 1" },
      "Legacy Operator": { department: "Operations", status: "ARCHIVED" },
    },
  },
};

const legacySnapshot = structuredClone(legacy);
const normalised = normaliseIdentityDirectory(legacy);
assert.equal(normalised.users.length, 2);
assert.equal(normalised.staffProfiles.length, 2);
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
assert.ok(preview.diagnostics.warnings >= 5);

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
    { username: " sam ", userId: uid1, staffId: sid2 },
  ],
  staff: {
    profiles: {
      First: { staffId: sid1, linkedUserId: uid2 },
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
const mismatchCodes = diagnoseIdentityDirectory(rosterMismatch).map((item) => item.code);
assert.ok(mismatchCodes.includes("staff-roster-profile-missing"));
assert.ok(mismatchCodes.includes("staff-roster-compatibility-mismatch"));
assert.ok(mismatchCodes.includes("staff-profile-compatibility-mismatch"));

const noMutationSnapshot = structuredClone(linked);
buildIdentityMigrationPreview(linked);
assert.deepEqual(linked, noMutationSnapshot, "migration preview must be read-only");

const centralApi = await readFile("supabase/functions/central-bank/index.ts", "utf8");
const browserClient = await readFile("central-bank-client.js", "utf8");
assert.match(centralApi, /import \{ buildIdentityMigrationPreview \} from ["']\.\.\/_shared\/user-staff-identity\.mjs["']/);
const diagnosticsRoute = centralApi.slice(
  centralApi.indexOf('if(action==="identity-diagnostics")'),
  centralApi.indexOf('if(action==="photo-evidence-context")'),
);
assert.ok(diagnosticsRoute.length > 0, "DEV-only diagnostics action is registered");
assert.match(diagnosticsRoute, /if\(!isDevRoot\)/, "identity diagnostics are restricted to immutable DEV");
assert.match(diagnosticsRoute, /buildIdentityMigrationPreview\(bank\)/, "the route uses the read-only preview");
assert.doesNotMatch(diagnosticsRoute, /\.update\(|\.insert\(|\.delete\(|\.rpc\(/, "the diagnostics route cannot write data");
assert.match(browserClient, /identityDiagnostics\(\)\{return call\("identity-diagnostics"\)\}/, "browser adapter exposes the read-only diagnostics action");

console.log("PASS: additive USER/STAFF identity contract, DEV-only read-only diagnostics and reciprocal-link validation.");
