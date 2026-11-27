import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveYardRolePermissions } from "../_shared/yard-role-resolver.mjs";
import { resolveRootsAuthority } from "../_shared/roots-authority.mjs";

const allowedOrigin = "https://aka30art.github.io";
const tierNames = ["OWNER", "DEVACC", "ADMIN", "MANAGER", "SUPERVISOR", "MECHANIC", "USER", "SPECTATOR"] as const;
const editableByAdmin = ["MANAGER", "SUPERVISOR", "MECHANIC", "USER", "SPECTATOR"] as const;
const accessModes = ["NONE", "READ", "INPUT", "EDIT"] as const;
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-downtime-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Vary": "Origin",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const digest = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
const safeUser = (user: any) => ({
  username: String(user.username || ""),
  displayName: String(user.displayName || user.username || ""),
  tier: String(user.tier || "USER"),
  enabled: user.enabled !== false,
});

function isRootDev(user: any, legacyTier: string) {
  return String(user?.username || "").trim().toUpperCase() === "DEV" && legacyTier === "OWNER";
}
function isHubSettingsAdmin(user: any, hubTier: string, legacyTier: string) {
  return isRootDev(user, legacyTier) || hubTier === "DEVACC" || hubTier === "ADMIN";
}
function isRootAdmin(user: any, hubTier: string, legacyTier: string) {
  return isRootDev(user, legacyTier) || hubTier === "DEVACC";
}
function assignedHubTier(config: any, username: string) {
  const saved = String(config?.userTiers?.[String(username || "").trim().toLowerCase()] || "").toUpperCase();
  const customTiers = Array.isArray(config?.customTiers) ? config.customTiers : [];
  const retired = Array.isArray(config?.retiredTiers) ? config.retiredTiers : [];
  return (tierNames.includes(saved as any) && !retired.includes(saved)) || customTiers.includes(saved) ? saved : "USER";
}
function normalizeTierPermissions(input: any, current: any, editableRoles: readonly string[]) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Tier permissions are required.");
  if (Number(input.schemaVersion) !== 1) throw new Error("Unsupported YARD HUB permission schema.");
  if (!input.tiers || typeof input.tiers !== "object" || Array.isArray(input.tiers)) throw new Error("Tier profiles are required.");
  const customTiers = Array.isArray(input.customTiers) ? input.customTiers : (Array.isArray(current?.customTiers) ? current.customTiers : []);
  if (customTiers.length > 30 || customTiers.some((name: unknown) => typeof name !== "string" || !/^[A-Z][A-Z0-9_]{1,23}$/.test(name) || tierNames.includes(name as any)) || new Set(customTiers).size !== customTiers.length) throw new Error("Invalid custom tier names.");
  const retiredTiers = Array.isArray(input.retiredTiers) ? input.retiredTiers : (Array.isArray(current?.retiredTiers) ? current.retiredTiers : []);
  if (retiredTiers.some((name: unknown) => typeof name !== "string" || !tierNames.includes(name as any) || ["OWNER", "DEVACC"].includes(name)) || new Set(retiredTiers).size !== retiredTiers.length) throw new Error("Invalid retired tier names.");
  const allTierNames = [...tierNames.filter(name => !retiredTiers.includes(name)), ...customTiers];
  if (Object.keys(input.tiers).some((key) => !allTierNames.includes(key))) throw new Error("Unknown tier profile.");
  const currentTiers = current?.tiers && typeof current.tiers === "object" ? current.tiers : {};
  const nextTiers: Record<string, Record<string, string>> = {};
  for (const tier of allTierNames) {
    const existing = currentTiers[tier] || {};
    const legacyMode = accessModes.includes(existing.repairMaintenance) ? existing.repairMaintenance : "NONE";
    nextTiers[tier] = { floor: accessModes.includes(existing.floor) ? existing.floor : "NONE", checkSheets: accessModes.includes(existing.checkSheets) ? existing.checkSheets : "NONE", repairMaintenance: legacyMode, repairMaintenanceMachinery: accessModes.includes(existing.repairMaintenanceMachinery) ? existing.repairMaintenanceMachinery : legacyMode };
  }
  for (const role of editableRoles) {
    const value = input.tiers[role];
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Missing permission profile for " + role + ".");
    const keys = ["floor", "checkSheets", "repairMaintenance", "repairMaintenanceMachinery"];
    if (Object.keys(value).some((key) => !keys.includes(key)) || ["floor", "checkSheets", "repairMaintenance"].some((key) => !Object.prototype.hasOwnProperty.call(value, key))) throw new Error("Invalid application permission keys for " + role + ".");
    for (const key of keys as ("floor" | "checkSheets" | "repairMaintenance" | "repairMaintenanceMachinery")[]) {
      const mode = key === "repairMaintenanceMachinery" ? (value[key] ?? value.repairMaintenance) : value[key];
      if (!accessModes.includes(mode)) throw new Error("Invalid " + key + " permission for " + role + ".");
      nextTiers[role][key] = mode;
    }
  }
  return { schemaVersion: 1, customTiers, retiredTiers, tiers: nextTiers, userTiers: current?.userTiers && typeof current.userTiers === "object" && !Array.isArray(current.userTiers) ? structuredClone(current.userTiers) : {} };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    if (req.headers.get("origin") && req.headers.get("origin") !== allowedOrigin) return new Response("Forbidden", { status: 403 });
    return new Response("ok", { headers });
  }
  if (req.headers.get("origin") && req.headers.get("origin") !== allowedOrigin) return json({ error: "Origin denied" }, 403);
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "YARD HUB settings service configuration missing." }, 500);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON request." }, 400); }
  const action = String(body.action || "");
  const rawToken = req.headers.get("x-downtime-session") || "";
  if (!rawToken) return json({ error: "YARD HUB session required. Sign in first." }, 401);

  const tokenHash = await digest(rawToken);
  const { data: session, error: sessionError } = await db.from("downtime_central_sessions")
    .select("username,expires_at")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (sessionError || !session) return json({ error: "YARD HUB session expired. Sign in again." }, 401);

  const { data: bankRow, error: bankError } = await db.from("downtime_central_bank")
    .select("payload,version")
    .eq("id", 1)
    .maybeSingle();
  if (bankError || !bankRow?.payload) return json({ error: "Central user directory is unavailable." }, 503);

  const bank = bankRow.payload as Record<string, any>;
  const user = (Array.isArray(bank.users) ? bank.users : []).find((item: any) =>
    String(item.username).toLowerCase() === String(session.username).toLowerCase() && item.enabled !== false
  );
  if (!user) return json({ error: "This account is disabled or no longer exists." }, 401);
  let rootsAssignment: any = null;
  if (user.userId) {
    const rootsLookup = await db.from("downtime_roots_assignments").select("user_id,staff_id,roots_class,status,version,revoked_at").eq("status", "ACTIVE").eq("user_id", user.userId).maybeSingle();
    if (rootsLookup.error) return json({ error: "Protected identity registry is unavailable." }, 503);
    rootsAssignment = rootsLookup.data;
  }
  const { data: rootsBootstrap, error: rootsBootstrapError } = await db.from("downtime_roots_bootstrap").select("user_id").eq("singleton", true).maybeSingle();
  if (rootsBootstrapError || !rootsBootstrap?.user_id) return json({ error: "Immutable DEV bootstrap identity is unavailable." }, 503);
  const rootsAuthority = resolveRootsAuthority(user, rootsAssignment, rootsBootstrap.user_id);
  const { data: configRow, error: configError } = await db.from("yard_hub_tier_config")
    .select("payload,version,updated_by,updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (configError || !configRow?.payload) return json({ error: "YARD HUB permission settings are unavailable." }, 503);

  const legacyTier = String(user.tier || "USER").toUpperCase();
  const hubTier = assignedHubTier(configRow.payload, user.username);
  const isProtectedRoot = ["DEV", "DEV1", "ADMIN"].includes(rootsAuthority || "");
  const isAdmin = isProtectedRoot || isHubSettingsAdmin(user, hubTier, legacyTier);
  const legacyPermissions = bank.tiers?.[legacyTier] || {};
  const hasCanonicalYardRole = Boolean(user.yardRoleId);
  const canAccessYardHub = isProtectedRoot || (!hasCanonicalYardRole && (legacyPermissions.canAccessYardHub !== false || isRootDev(user, legacyTier)));
  const canManageCentralUsers = isProtectedRoot || legacyPermissions.canManageUsers === true ||
    legacyTier === "OWNER" || legacyTier === "DEVACC";

  if (action === "my-access") {
    const myPermissions = isProtectedRoot ? { floor: "EDIT", checkSheets: "EDIT", repairMaintenance: "EDIT", repairMaintenanceMachinery: "EDIT" } : configRow.payload?.tiers?.[hubTier] || { floor: "NONE", checkSheets: "NONE", repairMaintenance: "NONE" };
    return json({
      user: { ...safeUser(user), legacyTier, hubTier },
      canManageSettings: isAdmin && canAccessYardHub,
      canManageCentralUsers,
      canAccessYardHub,
      sections: {
        floor: myPermissions.floor,
        checkSheets: myPermissions.checkSheets,
        repairMaintenance: myPermissions.repairMaintenance,
        repairMaintenanceMachinery: myPermissions.repairMaintenanceMachinery ?? myPermissions.repairMaintenance,
      },
      permissionVersion: Number(configRow.version),
    });
  }

  if (!canAccessYardHub) return json({ error: "YARD HUB access is not enabled for this account." }, 403);
  if (!isAdmin) return json({ error: "YARD HUB SETTINGS is restricted to DEV, DEVACC and ADMIN." }, 403);

  if (action === "settings-state") {
    const [{ data: yardRoles, error: yardRolesError }, { data: roleAssignments, error: roleAssignmentsError }, { data: rolePermissions, error: rolePermissionsError }, { data: rootsAssignments, error: rootsAssignmentsError }] = await Promise.all([
      db.from("yard_roles").select("id,name,description,status,version").order("name"),
      db.from("yard_role_assignments").select("user_id,staff_id,yard_role_id,status,version,verified_at"),
      db.from("yard_role_department_permissions").select("yard_role_id,department,can_view,can_enter,can_edit,can_manage"),
      db.from("downtime_roots_assignments").select("user_id,staff_id,roots_class,status,version,revoked_at").eq("status", "ACTIVE"),
    ]);
    if (yardRolesError || roleAssignmentsError || rolePermissionsError) return json({ error: "Canonical YARD ROLE registry is unavailable." }, 503);
    if (rootsAssignmentsError) return json({ error: "Protected identity registry is unavailable." }, 503);
    const protectedUserIds = new Set((rootsAssignments || []).map((assignment: any) => String(assignment.user_id).toLowerCase()));
    const assignableYardRoles = (yardRoles || []).filter((role: any) => {
      try { return Object.keys(resolveYardRolePermissions(role, rolePermissions || []).departments).length > 0; }
      catch { return false; }
    });
    const roleByUser = new Map((roleAssignments || []).map((assignment: any) => [String(assignment.user_id).toLowerCase(), assignment]));
    const rootsByUser = new Map((rootsAssignments || []).map((assignment: any) => [String(assignment.user_id).toLowerCase(), assignment]));
    return json({
      user: { ...safeUser(user), legacyTier, hubTier, rootsAuthority },
      users: (Array.isArray(bank.users) ? bank.users : []).filter((account: any) => rootsAuthority === "DEV" || (String(account.username || "").trim().toUpperCase() !== "DEV" && !protectedUserIds.has(String(account.userId || "").toLowerCase()))).map((account: any) => {
        const assignment: any = roleByUser.get(String(account.userId || "").toLowerCase());
        return {
          ...safeUser(account),
          legacyTier: account.tier ? String(account.tier).toUpperCase() : null,
          hubTier: assignedHubTier(configRow.payload, account.username),
          provisioningState: account.provisioning?.stage || null,
          userId: account.userId || null,
          staffId: account.staffId || null,
          requestedYardRoleId: account.provisioning?.requestedYardRoleId || null,
          yardRoleId: assignment?.yard_role_id || account.yardRoleId || null,
          yardRoleVersion: assignment?.version || null,
          rootsClass: (rootsByUser.get(String(account.userId || "").toLowerCase()) as any)?.roots_class || null,
        };
      }).sort((a: any, b: any) => a.username.localeCompare(b.username)),
      yardRoles: assignableYardRoles,
      roleCatalogue: isProtectedRoot ? (yardRoles || []).map((role: any) => ({ ...role, permissions: (rolePermissions || []).filter((row: any) => String(row.yard_role_id).toLowerCase() === String(role.id).toLowerCase()).map((row: any) => ({ department: row.department, can_view: row.can_view === true, can_enter: row.can_enter === true, can_edit: row.can_edit === true, can_manage: row.can_manage === true })) })) : [],
      userTiers: configRow.payload?.userTiers || {},
      centralVersion: Number(bankRow.version || 0),
      tierPermissions: normalizeTierPermissions(configRow.payload, configRow.payload, [...tierNames.filter(name => !(configRow.payload.retiredTiers || []).includes(name)), ...(Array.isArray(configRow.payload.customTiers) ? configRow.payload.customTiers : [])]),
      permissionVersion: Number(configRow.version),
      updatedBy: configRow.updated_by,
      updatedAt: configRow.updated_at,
      editableTiers: isRootAdmin(user, hubTier, legacyTier) ? [...tierNames.filter(name => !(configRow.payload.retiredTiers || []).includes(name)), ...(configRow.payload.customTiers || [])] : [...editableByAdmin],
      canManageCentralUsers,
    });
  }

  if (action === "yard-role-save") {
    if (!isProtectedRoot) return json({ error: "Only DEV or a protected ROOTS identity may create or change canonical YARD ROLE definitions." }, 403);
    if (!/^[0-9a-f-]{36}$/i.test(String(user.userId || ""))) return json({ error: "Authenticated actor has no immutable USER ID." }, 409);
    const roleId = String(body.roleId || crypto.randomUUID());
    if (!/^[0-9a-f-]{36}$/i.test(roleId)) return json({ error: "Canonical YARD ROLE ID is invalid." }, 400);
    const expectedVersion = Number(body.version ?? 0);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return json({ error: "A valid YARD ROLE version is required." }, 400);
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const status = String(body.status || "DRAFT").toUpperCase();
    const permissions = Array.isArray(body.permissions) ? body.permissions : null;
    if (!name || name.length > 80 || description.length > 500 || !["DRAFT", "ACTIVE", "RETIRED"].includes(status) || !permissions) {
      return json({ error: "YARD ROLE name, description, status and five-department permission matrix are required." }, 400);
    }
    const { data: saved, error: saveError } = await db.rpc("yard_role_save_definition", {
      p_role_id: roleId,
      p_expected_version: expectedVersion,
      p_name: name,
      p_description: description,
      p_status: status,
      p_permissions: permissions,
      p_actor_user_id: user.userId,
      p_actor_username: String(user.username),
      p_actor_display_name: String(user.displayName || user.username),
    });
    if (saveError || !saved) return json({ error: saveError?.message?.includes("YARD_ROLE_VERSION_CONFLICT") ? "YARD ROLE changed elsewhere. Refresh and try again." : saveError?.message || "YARD ROLE definition could not be saved." }, 409);
    return json({ ok: true, role: saved });
  }

  if (action === "assign-user-role") {
    if (!isProtectedRoot) return json({ error: "Only DEV or a protected ROOTS identity may assign a canonical YARD ROLE." }, 403);
    const targetUserId = String(body.userId || "");
    const yardRoleId = String(body.yardRoleId || "");
    if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) return json({ error: "Immutable USER ID required." }, 400);
    if (!/^[0-9a-f-]{36}$/i.test(yardRoleId)) return json({ error: "A canonical YARD ROLE ID is required." }, 400);
    if (!/^[0-9a-f-]{36}$/i.test(String(user.userId || ""))) return json({ error: "Authenticated actor has no immutable USER ID." }, 409);
    const target = (Array.isArray(bank.users) ? bank.users : []).find((account: any) =>
      String(account.userId || "").toLowerCase() === targetUserId.toLowerCase()
    );
    if (!target) return json({ error: "Central USER account not found." }, 404);
    const rootsTarget = await db.from("downtime_roots_assignments").select("user_id").eq("status", "ACTIVE").eq("user_id", targetUserId).maybeSingle();
    if (rootsTarget.error) return json({ error: "Protected identity registry is unavailable." }, 503);
    if (rootsTarget.data) return json({ error: "Protected ROOTS identities receive automatic department Manage authority and cannot be assigned an ordinary YARD ROLE." }, 409);
    const isPending = target.provisioning?.stage === "YARD_ROLE_PENDING";
    if (isPending && target.provisioning.requestedYardRoleId !== yardRoleId) return json({ error: "Selected YARD ROLE does not match the provisioned request." }, 409);
    if (!isPending && (target.enabled !== true || target.status !== "ACTIVE" || !target.staffId || target.tier != null || target.provisioning)) return json({ error: "Only an active canonical USER without a legacy tier claim can receive a direct YARD ROLE assignment." }, 409);
    const profiles = Object.values(bank.staff?.profiles || {}) as any[];
    const linkedProfile = profiles.find((profile: any) =>
      profile && String(profile.staffId || "").toLowerCase() === String(target.staffId || "").toLowerCase() &&
      String(profile.linkedUserId || "").toLowerCase() === String(target.userId || "").toLowerCase()
    );
    const expectedStaffStatus = isPending ? "PROVISIONING" : "ACTIVE";
    if (!linkedProfile || String(linkedProfile.status || "").toUpperCase() !== expectedStaffStatus) {
      return json({ error: "The USER and STAFF identities must have a reciprocal linked profile in the expected lifecycle state." }, 409);
    }
    const { data: role, error: roleError } = await db.from("yard_roles").select("id,name,description,status").eq("id", yardRoleId).eq("status", "ACTIVE").maybeSingle();
    const { data: permissions, error: permissionsError } = await db.from("yard_role_department_permissions").select("yard_role_id,department,can_view,can_enter,can_edit,can_manage").eq("yard_role_id", yardRoleId);
    if (roleError || permissionsError || !role) return json({ error: "Selected canonical YARD ROLE is unavailable." }, 409);
    try { resolveYardRolePermissions(role, permissions || []); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "YARD ROLE permission matrix is invalid." }, 409); }

    let assignment: any = null, assignmentError: any = null;
    if (isPending) {
      const assigned = await db.rpc("yard_role_assign_user", {
        p_user_id: target.userId,
        p_staff_id: target.staffId,
        p_yard_role_id: yardRoleId,
        p_actor_user_id: user.userId,
        p_actor_username: String(user.username),
        p_actor_display_name: String(user.displayName || user.username),
      });
      assignment = assigned.data; assignmentError = assigned.error;
    } else {
      const nextPayload = structuredClone(bank);
      const nextTarget = (Array.isArray(nextPayload.users) ? nextPayload.users : []).find((account: any) =>
        String(account.userId || "").toLowerCase() === targetUserId.toLowerCase()
      );
      if (!nextTarget) return json({ error: "Central USER account changed. Refresh and try again." }, 409);
      nextTarget.yardRoleId = yardRoleId;
      const expectedBankVersion = Number(bankRow.version);
      if (!Number.isInteger(expectedBankVersion) || expectedBankVersion < 1) return json({ error: "Central Bank version is unavailable. Refresh and try again." }, 503);
      if (Number.isInteger(Number(body.assignmentVersion)) && Number(body.assignmentVersion) > 0) {
        const reassigned = await db.rpc("yard_role_reassign_user", {
          p_user_id: target.userId,
          p_staff_id: target.staffId,
          p_yard_role_id: yardRoleId,
          p_expected_version: Number(body.assignmentVersion),
          p_expected_bank_version: expectedBankVersion,
          p_next_payload: nextPayload,
          p_actor_user_id: user.userId,
          p_actor_username: String(user.username),
          p_actor_display_name: String(user.displayName || user.username),
        });
        assignment = reassigned.data; assignmentError = reassigned.error;
      } else {
        const assigned = await db.rpc("yard_role_assign_existing_user", {
          p_user_id: target.userId,
          p_staff_id: target.staffId,
          p_yard_role_id: yardRoleId,
          p_expected_bank_version: expectedBankVersion,
          p_next_payload: nextPayload,
          p_actor_user_id: user.userId,
          p_actor_username: String(user.username),
          p_actor_display_name: String(user.displayName || user.username),
        });
        assignment = assigned.data; assignmentError = assigned.error;
      }
    }
    if (assignmentError || !assignment) return json({ error: assignmentError?.message?.includes("YARD_ROLE_ASSIGNMENT_VERSION_CONFLICT") || assignmentError?.message?.includes("CENTRAL_BANK_VERSION_CONFLICT") ? "YARD ROLE or Central Bank data changed elsewhere. Refresh and try again." : assignmentError?.message || "Canonical YARD ROLE assignment failed." }, 409);    return json({ ok: true, assignment });
  }

  if (action === "save-user-tier") {
    const targetUsername = String(body.username || "").trim();
    const nextTier = String(body.tier || "").toUpperCase();
    if (!targetUsername || targetUsername.length > 32 || !/^[A-Za-z0-9_.-]{2,32}$/.test(targetUsername)) {
      return json({ error: "Valid username required." }, 400);
    }
    const customTierNames = Array.isArray(configRow.payload.customTiers) ? configRow.payload.customTiers : [];
    const retiredTierNames = Array.isArray(configRow.payload.retiredTiers) ? configRow.payload.retiredTiers : [];
    if ((!tierNames.includes(nextTier as any) || retiredTierNames.includes(nextTier)) && !customTierNames.includes(nextTier)) return json({ error: "Unknown YARD HUB tier." }, 400);
    if (customTierNames.includes(nextTier) && !isRootAdmin(user, hubTier, legacyTier)) return json({ error: "Only DEV / DEVACC may assign custom YARD HUB tiers." }, 403);
    const target = (Array.isArray(bank.users) ? bank.users : []).find((account: any) =>
      String(account.username || "").toLowerCase() === targetUsername.toLowerCase()
    );
    if (!target) return json({ error: "Central user account not found." }, 404);
    if (target.userId) {
      const { data: protectedTarget, error: protectedTargetError } = await db.from("downtime_roots_assignments").select("user_id").eq("status", "ACTIVE").eq("user_id", target.userId).maybeSingle();
      if (protectedTargetError) return json({ error: "Protected identity registry is unavailable." }, 503);
      if (protectedTarget) return json({ error: "Protected ROOTS identities cannot receive ordinary YARD HUB tier assignments." }, 409);
    }
    if (target.provisioning || target.yardRoleId) return json({ error: "Canonical YARD ROLE identities cannot be assigned legacy YARD HUB tiers." }, 409);
    const targetLegacyTier = String(target.tier || "USER").toUpperCase();
    if (String(target.username).trim().toUpperCase() === "DEV" && targetLegacyTier === "OWNER" && nextTier !== "OWNER") {
      return json({ error: "The DEV root account must remain assigned to the OWNER YARD HUB tier." }, 403);
    }
    const root = isRootAdmin(user, hubTier, legacyTier);
    const previousTier = assignedHubTier(configRow.payload, target.username);
    if (!root && String(target.username).toLowerCase() === String(user.username).toLowerCase() && nextTier !== previousTier) {
      return json({ error: "Administrators cannot change their own YARD HUB tier." }, 403);
    }
    if (!root && !editableByAdmin.includes(nextTier as any) && nextTier !== previousTier) {
      return json({ error: "ADMIN may assign only MANAGER, SUPERVISOR, USER and SPECTATOR YARD HUB tiers." }, 403);
    }
    if (nextTier === "OWNER" && !(String(target.username).trim().toUpperCase() === "DEV" && targetLegacyTier === "OWNER")) {
      return json({ error: "DEV is the only OWNER YARD HUB account." }, 403);
    }
    if (nextTier === "DEVACC" && previousTier !== "DEVACC" && !isRootDev(user, legacyTier)) {
      return json({ error: "Only root DEV may assign the DEVACC YARD HUB tier." }, 403);
    }
    if (["DEVACC", "OWNER", "ADMIN"].includes(previousTier) && target.username !== user.username && !root) {
      return json({ error: "Protected YARD HUB account." }, 403);
    }
    const expectedVersion = Number(body.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== Number(configRow.version)) {
      return json({ error: "YARD HUB permissions changed elsewhere. Refresh and try again." }, 409);
    }
    const nextPayload = structuredClone(configRow.payload);
    nextPayload.userTiers = nextPayload.userTiers && typeof nextPayload.userTiers === "object" ? nextPayload.userTiers : {};
    nextPayload.userTiers[String(target.username).toLowerCase()] = nextTier;
    const { data: savedVersion, error: saveError } = await db.rpc("yard_hub_save_tier_settings", {
      p_expected_version: expectedVersion,
      p_next_payload: nextPayload,
      p_actor: String(user.username),
    });
    if (saveError) return json({ error: "Unable to save YARD HUB user tier assignment." }, 503);
    if (!savedVersion) return json({ error: "YARD HUB permissions changed elsewhere. Refresh and try again." }, 409);
    return json({ ok: true, previousTier, tier: nextTier, version: Number(savedVersion) });
  }

  if (action === "remove-user-tier") {
    const targetUsername = String(body.username || "").trim();
    if (!targetUsername) return json({ error: "Username required." }, 400);
    const target = (Array.isArray(bank.users) ? bank.users : []).find((account: any) =>
      String(account.username || "").toLowerCase() === targetUsername.toLowerCase()
    );
    if (!target) return json({ error: "Central user account not found." }, 404);
    if (target.provisioning || target.yardRoleId) return json({ error: "Canonical YARD ROLE identities cannot have legacy YARD HUB tier assignments removed." }, 409);
    const root = isRootAdmin(user, hubTier, legacyTier);
    if (!root && !editableByAdmin.includes(assignedHubTier(configRow.payload, target.username) as any)) {
      return json({ error: "ADMIN cannot remove protected YARD HUB tier assignments." }, 403);
    }
    if (String(target.username).trim().toUpperCase() === "DEV") return json({ error: "The DEV OWNER assignment cannot be removed." }, 403);
    if (!root && String(target.username).toLowerCase() === String(user.username).toLowerCase()) {
      return json({ error: "Administrators cannot remove their own YARD HUB tier assignment." }, 403);
    }
    const expectedVersion = Number(body.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== Number(configRow.version)) {
      return json({ error: "YARD HUB permissions changed elsewhere. Refresh and try again." }, 409);
    }
    const nextPayload = structuredClone(configRow.payload);
    nextPayload.userTiers = nextPayload.userTiers && typeof nextPayload.userTiers === "object" ? nextPayload.userTiers : {};
    delete nextPayload.userTiers[String(target.username).toLowerCase()];
    const { data: savedVersion, error: saveError } = await db.rpc("yard_hub_save_tier_settings", {
      p_expected_version: expectedVersion,
      p_next_payload: nextPayload,
      p_actor: String(user.username),
    });
    if (saveError) return json({ error: "Unable to remove YARD HUB user tier assignment." }, 503);
    if (!savedVersion) return json({ error: "YARD HUB permissions changed elsewhere. Refresh and try again." }, 409);
    return json({ ok: true, version: Number(savedVersion) });
  }

  if (action === "save-tier-settings") {
    const expectedVersion = Number(body.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== Number(configRow.version)) {
      return json({ error: "YARD HUB permissions changed elsewhere. Refresh and try again." }, 409);
    }
    const incomingPayload = body.payload as Record<string, any> | undefined;
    const incomingCustomTiers = Array.isArray(incomingPayload?.customTiers) ? incomingPayload.customTiers : [];
    const incomingRetiredTiers = Array.isArray(incomingPayload?.retiredTiers) ? incomingPayload.retiredTiers : [];
    const rootAdmin = isRootAdmin(user, hubTier, legacyTier);
    const activeTierNames = [...tierNames.filter(name => !incomingRetiredTiers.includes(name)), ...incomingCustomTiers];
    // OWNER and DEVACC permission profiles are immutable at the API boundary, not only in the UI.
    const editableRoles = rootAdmin ? activeTierNames.filter(name => !["OWNER", "DEVACC"].includes(name)) : editableByAdmin.filter(name => activeTierNames.includes(name));
    if (!rootAdmin && JSON.stringify(incomingCustomTiers) !== JSON.stringify(configRow.payload.customTiers || [])) return json({ error: "Only DEV / DEVACC may create or change custom tiers." }, 403);
    const currentCustomTiers = Array.isArray(configRow.payload.customTiers) ? configRow.payload.customTiers : [];
    const currentRetiredTiers = Array.isArray(configRow.payload.retiredTiers) ? configRow.payload.retiredTiers : [];
    if (!rootAdmin && JSON.stringify(incomingRetiredTiers) !== JSON.stringify(currentRetiredTiers)) return json({ error: "Only DEV / DEVACC may remove built-in tiers." }, 403);
    const removedBuiltInTiers = tierNames.filter(name => !["OWNER", "DEVACC"].includes(name) && !currentRetiredTiers.includes(name) && incomingRetiredTiers.includes(name));
    const removedCustomTiers = currentCustomTiers.filter((name: string) => !incomingCustomTiers.includes(name));
    if (removedCustomTiers.length && !rootAdmin) return json({ error: "Only DEV / DEVACC may remove custom tiers." }, 403);
    const assignedUsers = configRow.payload.userTiers && typeof configRow.payload.userTiers === "object" ? configRow.payload.userTiers : {};
    const removedTierNames = [...removedCustomTiers, ...removedBuiltInTiers];
    const assignedToRemovedTier = Object.entries(assignedUsers).find(([, assigned]) => removedTierNames.includes(String(assigned).toUpperCase()));
    if (assignedToRemovedTier) return json({ error: "Reassign every user from " + String(assignedToRemovedTier[1]) + " before deleting that tier." }, 409);
    let nextPayload: any;
    try {
      nextPayload = normalizeTierPermissions(body.payload, configRow.payload, editableRoles);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Invalid tier permissions." }, 400);
    }
    const { data: savedVersion, error: saveError } = await db.rpc("yard_hub_save_tier_settings", {
      p_expected_version: expectedVersion,
      p_next_payload: nextPayload,
      p_actor: String(user.username),
    });
    if (saveError) return json({ error: "Unable to save YARD HUB permissions." }, 503);
    if (!savedVersion) return json({ error: "YARD HUB permissions changed elsewhere. Refresh and try again." }, 409);
    return json({ ok: true, version: Number(savedVersion) });
  }

  return json({ error: "Unknown YARD HUB settings action." }, 400);
});
