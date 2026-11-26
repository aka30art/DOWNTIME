/**
 * Canonical ordinary YARD ROLE permission resolver.
 * ROOTS classifications are deliberately handled by a separate authorization layer.
 */
export const YARD_ROLE_LEVELS = Object.freeze(["OFF", "READ_ONLY", "INPUT", "MANAGE"]);
export const YARD_ROLE_DEPARTMENTS = Object.freeze(["SCPL", "R&M", "Management", "SCFL", "Traffic"]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function resolveYardRolePermissions(role, permissionRows = []) {
  if (!isObject(role) || !UUID_PATTERN.test(String(role.id || ""))) {
    throw new Error("A canonical YARD ROLE with an immutable UUID is required.");
  }
  if (String(role.status || "").toUpperCase() !== "ACTIVE") {
    throw new Error("YARD ROLE is not active.");
  }
  const roleName = String(role.name || "").trim();
  if (!roleName || roleName.length > 80) throw new Error("YARD ROLE name is invalid.");
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
    if (!YARD_ROLE_DEPARTMENTS.includes(department)) throw new Error("YARD ROLE department is not in the approved department catalogue.");
    if (seen.has(key)) throw new Error("A YARD ROLE can have only one access level per department.");
    if (!YARD_ROLE_LEVELS.includes(level)) throw new Error("YARD ROLE department access level is invalid.");
    seen.add(key);
    departments[department] = level;
  }
  const missingDepartments = YARD_ROLE_DEPARTMENTS.filter((department) => !seen.has(department.toLocaleLowerCase("en-GB")));
  if (missingDepartments.length) {
    throw new Error("YARD ROLE must define exactly one access level for each approved department: " + missingDepartments.join(", "));
  }
  return Object.freeze({
    yardRoleId: role.id,
    name: roleName,
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
