/**
 * Protected ROOTS authority resolver.
 * DEV is recognised only by the immutable bootstrap USER ID.
 * DEV1 and ADMIN require an active matching USER/STAFF assignment.
 * Legacy tier labels are never ROOTS authority evidence.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = value => String(value ?? "").trim().toLowerCase();

export function resolveRootsAuthority(user, assignment = null, immutableDevUserId = null) {
  if (!user || typeof user !== "object" || user.enabled === false) return null;
  if (user.status && String(user.status).toUpperCase() !== "ACTIVE") return null;
  const userId = String(user.userId || "");
  if (!UUID.test(userId)) return null;

  // DEV is the singleton bootstrap USER; a STAFF identity is not required to preserve root access.
  if (UUID.test(String(immutableDevUserId || "")) && norm(userId) === norm(immutableDevUserId)) return "DEV";

  const staffId = String(user.staffId || "");
  if (!UUID.test(staffId) || norm(userId) === norm(staffId)) return null;
  if (!assignment || String(assignment.status || "").toUpperCase() !== "ACTIVE") return null;
  if (!["DEV1", "ADMIN"].includes(String(assignment.roots_class || ""))) return null;
  if (norm(assignment.user_id) !== norm(userId) || norm(assignment.staff_id) !== norm(staffId)) return null;
  return String(assignment.roots_class);
}

export function rootsCapabilities(authority) {
  return Object.freeze({
    canBrowseRoots: authority === "DEV",
    canAssignDev1: authority === "DEV",
    canAssignAdmin: authority === "DEV" || authority === "DEV1",
    canManageYardRoles: ["DEV", "DEV1", "ADMIN"].includes(authority),
    hasAutomaticDepartmentManage: ["DEV", "DEV1", "ADMIN"].includes(authority),
    canReclassifyRoots: authority === "DEV",
    canRevokeRoots: authority === "DEV",
  });
}

export function canInteractWithRootsTarget(actorAuthority, targetAuthority) {
  if (!targetAuthority) return true;
  if (targetAuthority === "DEV") return actorAuthority === "DEV";
  if (targetAuthority === "DEV1") return actorAuthority === "DEV";
  if (targetAuthority === "ADMIN") return actorAuthority === "DEV" || actorAuthority === "DEV1";
  return false;
}
