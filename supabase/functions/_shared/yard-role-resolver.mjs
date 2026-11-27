/**
 * Canonical ordinary YARD ROLE permission resolver.
 * Four permissions are independently selectable for each department.
 * ROOTS classifications are handled by a separate authorization layer.
 */
export const YARD_ROLE_PERMISSION_KEYS = Object.freeze(["view", "enter", "edit", "manage"]);
export const YARD_ROLE_DEPARTMENTS = Object.freeze(["SCPL", "R&M", "Management", "SCFL", "Traffic"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function resolveYardRolePermissions(role, permissionRows = []) {
  if (!isObject(role) || !UUID_PATTERN.test(String(role.id || ""))) throw new Error("A canonical YARD ROLE with an immutable UUID is required.");
  if (String(role.status || "").toUpperCase() !== "ACTIVE") throw new Error("YARD ROLE is not active.");
  const roleName = String(role.name || "").trim();
  if (!roleName || roleName.length > 80) throw new Error("YARD ROLE name is invalid.");
  if (!Array.isArray(permissionRows)) throw new Error("YARD ROLE department permissions must be an array.");
  const departments = Object.create(null), seen = new Set();
  for (const row of permissionRows) {
    if (!isObject(row)) throw new Error("YARD ROLE department permission record is invalid.");
    if (String(row.yard_role_id || row.yardRoleId || "").toLowerCase() !== String(role.id).toLowerCase()) continue;
    const department = String(row.department || "").trim(), key = department.toLocaleLowerCase("en-GB");
    if (!YARD_ROLE_DEPARTMENTS.includes(department)) throw new Error("YARD ROLE department is not in the approved department catalogue.");
    if (seen.has(key)) throw new Error("A YARD ROLE can have only one permission record per department.");
    const permissions = {};
    for (const permission of YARD_ROLE_PERMISSION_KEYS) {
      const field = "can_" + permission;
      if (typeof row[field] !== "boolean") throw new Error("YARD ROLE " + permission + " permission must be an explicit boolean.");
      permissions[permission] = row[field];
    }
    seen.add(key); departments[department] = Object.freeze(permissions);
  }
  const missing = YARD_ROLE_DEPARTMENTS.filter((department) => !seen.has(department.toLocaleLowerCase("en-GB")));
  if (missing.length) throw new Error("YARD ROLE must define exactly one independent permission record for each approved department: " + missing.join(", "));
  return Object.freeze({ yardRoleId: role.id, name: roleName, departments: Object.freeze({ ...departments }) });
}

/** Ordinary role permissions only; ROOTS authority must be evaluated separately. */
export function canYardRolePerform(resolvedRole, department, action) {
  if (!isObject(resolvedRole) || !isObject(resolvedRole.departments)) return false;
  const key = Object.keys(resolvedRole.departments).find((name) => name.toLocaleLowerCase("en-GB") === String(department || "").trim().toLocaleLowerCase("en-GB"));
  if (!key) return false;
  const p = resolvedRole.departments[key], a = String(action || "").toUpperCase();
  if (["VIEW", "READ"].includes(a)) return p.view === true;
  if (["ADD", "ENTER", "CREATE", "SUBMIT"].includes(a)) return p.enter === true;
  if (["EDIT", "UPDATE"].includes(a)) return p.edit === true;
  if (["REMOVE", "DELETE", "MANAGE"].includes(a)) return p.manage === true;
  return false;
}
