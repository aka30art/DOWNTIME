/**
 * Protected ROOTS authority resolver.
 *
 * DEV is the immutable bootstrap identity. DEV1 and protected ADMIN are
 * recognised only through a matching server-loaded ROOTS assignment row.
 * Legacy tier strings are deliberately not authority evidence.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = value => String(value ?? "").trim().toLocaleLowerCase("en-GB");

export function resolveRootsAuthority(user, assignment = null) {
  if (!user || typeof user !== "object") return null;
  if (String(user.username || "").trim().toUpperCase() === "DEV" &&
      String(user.tier || "").toUpperCase() === "OWNER") return "DEV";
  if (user.enabled !== true || String(user.status || "").toUpperCase() !== "ACTIVE") return null;
  if (!UUID.test(String(user.userId || "")) || !UUID.test(String(user.staffId || ""))) return null;
  if (!assignment || !["DEV1", "ADMIN"].includes(String(assignment.roots_class || ""))) return null;
  if (norm(assignment.user_id) !== norm(user.userId) ||
      norm(assignment.staff_id) !== norm(user.staffId)) return null;
  return assignment.roots_class;
}

export function rootsCapabilities(authority) {
  return Object.freeze({
    canBrowseRoots: authority === "DEV",
    canAssignDev1: authority === "DEV",
    canAssignAdmin: authority === "DEV" || authority === "DEV1",
    hasAutomaticDepartmentManage: ["DEV", "DEV1", "ADMIN"].includes(authority),
  });
}

export function canInteractWithRootsTarget(actorAuthority, targetAuthority) {
  if (!targetAuthority) return true;
  if (targetAuthority === "DEV") return actorAuthority === "DEV";
  if (targetAuthority === "DEV1" && actorAuthority === "ADMIN") return false;
  if (targetAuthority === "DEV1" && actorAuthority === "DEV1") return false;
  return true;
}
