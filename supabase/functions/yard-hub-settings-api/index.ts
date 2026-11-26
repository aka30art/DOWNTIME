import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
  const { data: configRow, error: configError } = await db.from("yard_hub_tier_config")
    .select("payload,version,updated_by,updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (configError || !configRow?.payload) return json({ error: "YARD HUB permission settings are unavailable." }, 503);

  const legacyTier = String(user.tier || "USER").toUpperCase();
  const hubTier = assignedHubTier(configRow.payload, user.username);
  const isAdmin = isHubSettingsAdmin(user, hubTier, legacyTier);
  const legacyPermissions = bank.tiers?.[legacyTier] || {};
  const hasCanonicalYardRole = Boolean(user.yardRoleId);
  const canAccessYardHub = !hasCanonicalYardRole && (legacyPermissions.canAccessYardHub !== false || isRootDev(user, legacyTier));
  const canManageCentralUsers = legacyPermissions.canManageUsers === true ||
    legacyTier === "OWNER" || legacyTier === "DEVACC";

  if (action === "my-access") {
    const myPermissions = configRow.payload?.tiers?.[hubTier] || { floor: "NONE", checkSheets: "NONE", repairMaintenance: "NONE" };
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
    const [{ data: yardRoles, error: yardRolesError }, { data: roleAssignments, error: roleAssignmentsError }] = await Promise.all([
      db.from("yard_roles").select("id,name,description,status").eq("status", "ACTIVE").order("name"),
      db.from("yard_role_assignments").select("user_id,staff_id,yard_role_id,status,version,verified_at"),
    ]);
    if (yardRolesError || roleAssignmentsError) return json({ error: "Canonical YARD ROLE registry is unavailable." }, 503);
    const roleByUser = new Map((roleAssignments || []).map((assignment: any) => [String(assignment.user_id).toLowerCase(), assignment]));
    return json({
      user: { ...safeUser(user), legacyTier, hubTier },
      users: (Array.isArray(bank.users) ? bank.users : []).map((account: any) => {
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
        };
      }).sort((a: any, b: any) => a.username.localeCompare(b.username)),
      yardRoles: yardRoles || [],
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

  if (action === "assign-user-role") {
    if (!isRootDev(user, legacyTier)) return json({ error: "Only immutable DEV may assign a YARD ROLE during new USER provisioning." }, 403);
    const targetUsername = String(body.username || "").trim();
    const yardRoleId = String(body.yardRoleId || "");
    if (!targetUsername || targetUsername.length > 32 || !/^[A-Za-z0-9_.-]{2,32}$/.test(targetUsername)) return json({ error: "Valid username required." }, 400);
    if (!/^[0-9a-f-]{36}$/i.test(yardRoleId)) return json({ error: "A canonical YARD ROLE ID is required." }, 400);
    const target = (Array.isArray(bank.users) ? bank.users : []).find((account: any) =>
      String(account.username || "").toLowerCase() === targetUsername.toLowerCase()
    );
    if (!target) return json({ error: "Central USER account not found." }, 404);
    if (target.provisioning?.stage !== "YARD_ROLE_PENDING") return json({ error: "USER is not awaiting canonical YARD ROLE assignment." }, 409);
    if (target.provisioning.requestedYardRoleId !== yardRoleId) return json({ error: "Selected YARD ROLE does not match the provisioned request." }, 409);
    const { data: assignment, error: assignmentError } = await db.rpc("yard_role_assign_user", {
      p_user_id: target.userId,
      p_staff_id: target.staffId,
      p_yard_role_id: yardRoleId,
      p_actor: String(user.username),
    });
    if (assignmentError || !assignment) return json({ error: assignmentError?.message || "Canonical YARD ROLE assignment failed." }, 409);
    return json({ ok: true, assignment });
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
    if (target.provisioning || target.yardRoleId) return json({ error: "Canonical YARD ROLE identities do not have legacy YARD HUB tier assignments." }, 409);
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
