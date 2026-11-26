/**
 * DOWNTIME USER / STAFF identity contract helpers.
 *
 * Phase 2 foundation only:
 * - preserves legacy records without inventing identifiers;
 * - validates immutable UUID references when present;
 * - reports migration diagnostics without writing data;
 * - enforces the reciprocal USER <-> STAFF link for newly provisioned pairs.
 *
 * ROOTS classifications and YARD ROLE permissions are intentionally not handled
 * here. They are separate authorization contracts.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const normaliseUsername = (value) => String(value ?? "").trim().toLocaleLowerCase("en-GB");
const isUuid = (value) => typeof value === "string" && UUID_PATTERN.test(value);

function addDiagnostic(diagnostics, severity, code, path, message) {
  diagnostics.push({ severity, code, path, message });
}

/**
 * Returns a non-mutating, backwards-compatible view of the identity collections.
 * Missing IDs remain missing; this function never generates IDs or creates STAFF.
 */
export function normaliseIdentityDirectory(bank) {
  const source = isObject(bank) ? bank : {};
  const users = Array.isArray(source.users)
    ? source.users.filter(isObject).map((user) => ({ ...user }))
    : [];
  const staff = isObject(source.staff) ? source.staff : {};
  const profiles = isObject(staff.profiles) ? staff.profiles : {};
  const staffProfiles = Object.entries(profiles)
    .filter(([, profile]) => isObject(profile))
    .map(([legacyKey, profile]) => ({ legacyKey, ...profile }));

  return {
    users,
    staffProfiles,
    staffRoster: Array.isArray(staff.roster) ? [...staff.roster] : [],
  };
}

/**
 * Read-only diagnostics for legacy and partially migrated identity data.
 * Legacy records without IDs are warnings, not silently repaired records.
 */
export function diagnoseIdentityDirectory(bank) {
  const { users, staffProfiles } = normaliseIdentityDirectory(bank);
  const diagnostics = [];
  const userIds = new Map();
  const staffIds = new Map();
  const linkedUsers = new Map();
  const usernames = new Map();

  users.forEach((user, index) => {
    const path = `users[${index}]`;
    const username = normaliseUsername(user.username);

    if (!username) {
      addDiagnostic(diagnostics, "error", "user-username-missing", path, "USER has no usable username.");
    } else if (usernames.has(username)) {
      addDiagnostic(diagnostics, "error", "duplicate-username", path, `Username duplicates ${usernames.get(username)} case-insensitively.`);
    } else {
      usernames.set(username, path);
    }

    if (user.userId == null || user.userId === "") {
      addDiagnostic(diagnostics, "warning", "legacy-user-id-missing", path, "Legacy USER has no immutable userId; no identifier was generated.");
    } else if (!isUuid(user.userId)) {
      addDiagnostic(diagnostics, "error", "user-id-invalid", path, "USER userId must be a UUID.");
    } else if (userIds.has(user.userId.toLowerCase())) {
      addDiagnostic(diagnostics, "error", "duplicate-user-id", path, `userId duplicates ${userIds.get(user.userId.toLowerCase())}.`);
    } else {
      userIds.set(user.userId.toLowerCase(), path);
    }

    if (normaliseUsername(user.username) === "dev") {
      if (user.staffId) addDiagnostic(diagnostics, "error", "dev-staff-link-forbidden", path, "The immutable DEV root identity must not be linked to a STAFF profile.");
    } else if (!user.staffId) {
      addDiagnostic(diagnostics, "warning", "legacy-user-staff-link-missing", path, "USER has no linked STAFF identity; this is not repaired during diagnostics.");
    } else if (!isUuid(user.staffId)) {
      addDiagnostic(diagnostics, "error", "user-staff-id-invalid", path, "USER staffId must be a UUID.");
    }
  });

  staffProfiles.forEach((profile, index) => {
    const path = `staff.profiles[${JSON.stringify(profile.legacyKey)}]`;

    if (profile.staffId == null || profile.staffId === "") {
      addDiagnostic(diagnostics, "warning", "legacy-staff-id-missing", path, "Legacy STAFF profile has no immutable staffId; no identifier was generated.");
    } else if (!isUuid(profile.staffId)) {
      addDiagnostic(diagnostics, "error", "staff-id-invalid", path, "STAFF staffId must be a UUID.");
    } else if (staffIds.has(profile.staffId.toLowerCase())) {
      addDiagnostic(diagnostics, "error", "duplicate-staff-id", path, `staffId duplicates ${staffIds.get(profile.staffId.toLowerCase())}.`);
    } else {
      staffIds.set(profile.staffId.toLowerCase(), path);
    }

    if (profile.linkedUserId) {
      if (!isUuid(profile.linkedUserId)) {
        addDiagnostic(diagnostics, "error", "staff-linked-user-id-invalid", path, "STAFF linkedUserId must be a UUID.");
      } else {
        const key = profile.linkedUserId.toLowerCase();
        if (linkedUsers.has(key)) {
          addDiagnostic(diagnostics, "error", "user-has-multiple-staff", path, `linkedUserId is already used by ${linkedUsers.get(key)}.`);
        } else {
          linkedUsers.set(key, path);
        }
      }
    }
  });

  const staffById = new Map(
    staffProfiles.filter((profile) => isUuid(profile.staffId))
      .map((profile) => [profile.staffId.toLowerCase(), profile]),
  );
  const usersById = new Map(
    users.filter((user) => isUuid(user.userId))
      .map((user) => [user.userId.toLowerCase(), user]),
  );

  users.forEach((user, index) => {
    if (!user.staffId || !isUuid(user.staffId) || normaliseUsername(user.username) === "dev") return;
    const staff = staffById.get(user.staffId.toLowerCase());
    if (!staff) {
      addDiagnostic(diagnostics, "error", "orphan-user-staff-link", `users[${index}]`, "USER references a STAFF staffId that does not exist.");
    } else if (staff.linkedUserId?.toLowerCase() !== user.userId?.toLowerCase()) {
      addDiagnostic(diagnostics, "error", "identity-link-not-reciprocal", `users[${index}]`, "USER.staffId and STAFF.linkedUserId do not form a reciprocal link.");
    }
  });

  staffProfiles.forEach((profile, index) => {
    if (!profile.linkedUserId || !isUuid(profile.linkedUserId)) return;
    const user = usersById.get(profile.linkedUserId.toLowerCase());
    if (!user) {
      addDiagnostic(diagnostics, "error", "orphan-staff-user-link", `staff.profiles[${JSON.stringify(profile.legacyKey)}]`, "STAFF references a USER userId that does not exist.");
    } else if (user.staffId?.toLowerCase() !== profile.staffId?.toLowerCase()) {
      addDiagnostic(diagnostics, "error", "identity-link-not-reciprocal", `staff.profiles[${JSON.stringify(profile.legacyKey)}]`, "STAFF.linkedUserId and USER.staffId do not form a reciprocal link.");
    }
  });

  return diagnostics;
}

/**
 * Produces a dry-run summary only. It has no persistence or mutation capability.
 */
export function buildIdentityMigrationPreview(bank) {
  const { users, staffProfiles, staffRoster } = normaliseIdentityDirectory(bank);
  const diagnostics = diagnoseIdentityDirectory(bank);
  const errors = diagnostics.filter((item) => item.severity === "error").length;
  const warnings = diagnostics.filter((item) => item.severity === "warning").length;

  return {
    mode: "read-only",
    writesPerformed: 0,
    users: {
      total: users.length,
      withUserId: users.filter((user) => isUuid(user.userId)).length,
      withStaffLink: users.filter((user) => Boolean(user.staffId)).length,
      devRootCount: users.filter((user) => normaliseUsername(user.username) === "dev").length,
    },
    staff: {
      profileCount: staffProfiles.length,
      rosterEntryCount: staffRoster.length,
      withStaffId: staffProfiles.filter((profile) => isUuid(profile.staffId)).length,
      linkedToUser: staffProfiles.filter((profile) => Boolean(profile.linkedUserId)).length,
    },
    diagnostics: { total: diagnostics.length, errors, warnings },
    readyForIdentityCutover: errors === 0 && warnings === 0 && users.length > 0,
    findings: diagnostics,
  };
}

/**
 * Validates a newly provisioned ordinary USER/STAFF pair before persistence.
 * DEV is deliberately excluded because the root USER is not a STAFF member.
 */
export function validateNewUserStaffPair(user, staff, existingUsers = [], existingStaffProfiles = []) {
  if (!isObject(user) || !isObject(staff)) throw new TypeError("USER and STAFF records are required.");
  if (normaliseUsername(user.username) === "dev") throw new Error("DEV is the immutable root identity and cannot be linked to STAFF.");
  if (!isUuid(user.userId)) throw new Error("USER userId must be a valid immutable UUID.");
  if (!isUuid(user.staffId)) throw new Error("USER staffId must be a valid immutable UUID.");
  if (!isUuid(staff.staffId)) throw new Error("STAFF staffId must be a valid immutable UUID.");
  if (!isUuid(staff.linkedUserId)) throw new Error("STAFF linkedUserId must be a valid immutable UUID.");
  if (user.staffId.toLowerCase() !== staff.staffId.toLowerCase()) throw new Error("USER.staffId must match STAFF.staffId.");
  if (staff.linkedUserId.toLowerCase() !== user.userId.toLowerCase()) throw new Error("STAFF.linkedUserId must match USER.userId.");
  if (!normaliseUsername(user.username)) throw new Error("USER username is required.");

  const username = normaliseUsername(user.username);
  if (existingUsers.some((item) => normaliseUsername(item?.username) === username)) throw new Error("USER username already exists.");
  if (existingUsers.some((item) => item?.userId?.toLowerCase() === user.userId.toLowerCase())) throw new Error("USER userId already exists.");
  if (existingUsers.some((item) => item?.staffId?.toLowerCase() === user.staffId.toLowerCase())) throw new Error("USER staffId is already linked.");
  if (existingStaffProfiles.some((item) => item?.staffId?.toLowerCase() === staff.staffId.toLowerCase())) throw new Error("STAFF staffId already exists.");
  if (existingStaffProfiles.some((item) => item?.linkedUserId?.toLowerCase() === user.userId.toLowerCase())) throw new Error("USER is already linked to a STAFF profile.");

  return { valid: true, userId: user.userId, staffId: staff.staffId, linkedUserId: staff.linkedUserId };
}

export const identityUuidPattern = UUID_PATTERN;
