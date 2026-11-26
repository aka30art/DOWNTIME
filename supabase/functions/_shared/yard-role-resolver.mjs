/**
 * Canonical ordinary YARD ROLE permission resolver.
 * ROOTS classifications are deliberately handled by a separate authorization layer.
 */
export const YARD_ROLE_LEVELS = Object.freeze(["OFF", "READ_ONLY", "INPUT", "MANAGE"]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function resolveYardRolePermissions(role, permissionRows = []) {
  if (!isObject(role) || !UUID_PATTERN.test(String(role.id || ""))) {
    throw new Error("A canonical YARD ROLE with an immutable UUID is required.");
  }
  if (String(role.status || "").toUpperCase() !== "ACTIVE") {
    throw new Error("YARD ROLE is not active.");
  }
  if (!Array.isArray(permissionRows)) {
    throw new Error("YARD ROLE department permissions must be an array.");
  }
  const departments = Object.create(null);
  const seen = new Set();
  for (const row of permissionRows) {
    if (!isObject(row)) throw new Error("YARD ROLE department permission record is invalid.");
    if (String(row.yard_role_id || row.yardRoleId || "").toLowerCase() !== String(role.id).toLowerCase()) continue;
    const department = String(row.department || "").trim();
    const key = department.toLocaleLowerCase("en-GB");
    const level = String(row.access_level || row.accessLevel || "").toUpperCase();
    if (!department || department.length > 80) throw new Error("YARD ROLE department name is invalid.");
    if (seen.has(key)) throw new Error("A YARD ROLE can have only one access level per department.");
    if (!YARD_ROLE_LEVELS.includes(level)) throw new Error("YARD ROLE department access level is invalid.");
    seen.add(key);
    departments[department] = level;
  }
  return Object.freeze({
    yardRoleId: role.id,
    name: String(role.name || ""),
    departments: Object.freeze({ ...departments }),
  });
}

/** Ordinary role permissions only; ROOTS authority must be evaluated separately. */
export function canYardRolePerform(resolvedRole, department, action) {
  if (!isObject(resolvedRole) || !isObject(resolvedRole.departments)) return false;
  const key = Object.keys(resolvedRole.departments)
    .find((name) => name.toLocaleLowerCase("en-GB") === String(department || "").trim().toLocaleLowerCase("en-GB"));
  if (!key) return false;
  const level = resolvedRole.departments[key];
  const normalizedAction = String(action || "").toUpperCase();
  if (level === "OFF") return false;
  if (normalizedAction === "VIEW") return true;
  if (["ADD", "EDIT"].includes(normalizedAction)) return ["INPUT", "MANAGE"].includes(level);
  if (["REMOVE", "DELETE"].includes(normalizedAction)) return level === "MANAGE";
  return false;
}
