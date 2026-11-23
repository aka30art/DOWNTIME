import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const allowedOrigin = "https://aka30art.github.io";
const tierNames = ["OWNER", "DEVACC", "ADMIN", "MANAGER", "SUPERVISOR", "USER", "SPECTATOR"] as const;
const editableByAdmin = ["MANAGER", "SUPERVISOR", "USER", "SPECTATOR"] as const;
const accessModes = ["NONE", "READ", "EDIT"] as const;
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

function isHubSettingsAdmin(user: any, tier: string) {
  const username = String(user?.username || "").trim().toUpperCase();
  return (username === "DEV" && tier === "OWNER") || tier === "DEVACC" || tier === "ADMIN";
}
function isRootAdmin(user: any, tier: string) {
  const username = String(user?.username || "").trim().toUpperCase();
  return (username === "DEV" && tier === "OWNER") || tier === "DEVACC";
}
function normalizeTierPermissions(input: any, current: any, editableRoles: readonly string[]) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Tier permissions are required.");
  if (Number(input.schemaVersion) !== 1) throw new Error("Unsupported YARD HUB permission schema.");
  if (!input.tiers || typeof input.tiers !== "object" || Array.isArray(input.tiers)) throw new Error("Tier profiles are required.");
  const allowedTierKeys = new Set(tierNames);
  if (Object.keys(input.tiers).some((key) => !allowedTierKeys.has(key as any))) throw new Error("Unknown tier profile.");
  const currentTiers = current?.tiers && typeof current.tiers === "object" ? current.tiers : {};
  const nextTiers: Record<string, Record<string, string>> = {};
  for (const tier of tierNames) {
    const existing = currentTiers[tier] || {};
    nextTiers[tier] = {
      floor: accessModes.includes(existing.floor) ? existing.floor : "NONE",
      checkSheets: accessModes.includes(existing.checkSheets) ? existing.checkSheets : "NONE",
      repairMaintenance: accessModes.includes(existing.repairMaintenance) ? existing.repairMaintenance : "NONE",
    };
  }
  for (const role of editableRoles) {
    const value = input.tiers[role];
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Missing permission profile for " + role + ".");
    const keys = Object.keys(value);
    if (keys.length !== 3 || keys.some((key) => !["floor", "checkSheets", "repairMaintenance"].includes(key))) {
      throw new Error("Invalid application permission keys for " + role + ".");
    }
    for (const key of ["floor", "checkSheets", "repairMaintenance"] as const) {
      const mode = value[key];
      if (!accessModes.includes(mode)) throw new Error("Invalid " + key + " permission for " + role + ".");
      nextTiers[role][key] = mode;
    }
  }
  return { schemaVersion: 1, tiers: nextTiers };
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
  const tier = String(user.tier || "USER").toUpperCase();
  const isAdmin = isHubSettingsAdmin(user, tier);

  const { data: configRow, error: configError } = await db.from("yard_hub_tier_config")
    .select("payload,version,updated_by,updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (configError || !configRow?.payload) return json({ error: "YARD HUB permission settings are unavailable." }, 503);

  if (action === "my-access") {
    const storedHubAccess = bank.tiers?.[tier]?.canAccessYardHub;
    const canAccessYardHub = storedHubAccess !== false || tier === "OWNER" || tier === "DEVACC";
    const myPermissions = configRow.payload?.tiers?.[tier] || { floor: "NONE", checkSheets: "NONE", repairMaintenance: "NONE" };
    return json({
      user: safeUser(user),
      canManageSettings: isAdmin,
      canAccessYardHub,
      sections: {
        floor: myPermissions.floor,
        checkSheets: myPermissions.checkSheets,
        repairMaintenance: myPermissions.repairMaintenance,
      },
      permissionVersion: Number(configRow.version),
    });
  }

  if (!isAdmin) return json({ error: "YARD HUB SETTINGS is restricted to DEV, DEVACC and ADMIN." }, 403);

  if (action === "settings-state") {
    return json({
      user: safeUser(user),
      users: (Array.isArray(bank.users) ? bank.users : []).map(safeUser).sort((a: any, b: any) => a.username.localeCompare(b.username)),
      centralVersion: Number(bankRow.version || 0),
      tierPermissions: configRow.payload,
      permissionVersion: Number(configRow.version),
      updatedBy: configRow.updated_by,
      updatedAt: configRow.updated_at,
      editableTiers: isRootAdmin(user, tier) ? [...tierNames] : [...editableByAdmin],
    });
  }

  if (action === "save-tier-settings") {
    const expectedVersion = Number(body.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== Number(configRow.version)) {
      return json({ error: "YARD HUB permissions changed elsewhere. Refresh and try again." }, 409);
    }
    const editableRoles = isRootAdmin(user, tier) ? [...tierNames] : [...editableByAdmin];
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
