import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const allowedOrigin = "https://aka30art.github.io";
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-downtime-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Vary": "Origin",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const fail = (message: string, status = 400) => json({ error: message }, status);
const digest = async (value: string) => Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  b => b.toString(16).padStart(2, "0"),
).join("");
const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const uuid = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    if (req.headers.get("origin") && req.headers.get("origin") !== allowedOrigin) return new Response("Forbidden", { status: 403 });
    return new Response("ok", { headers });
  }
  if (req.headers.get("origin") && req.headers.get("origin") !== allowedOrigin) return fail("Origin denied.", 403);
  if (req.method !== "POST") return fail("POST only.", 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return fail("STAFF MANAGEMENT service configuration missing.", 500);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("Invalid JSON request."); }
  const action = clean(body.action, 40);
  const rawToken = req.headers.get("x-downtime-session") || "";
  if (!rawToken) return fail("YARD HUB session required. Sign in first.", 401);

  const { data: session, error: sessionError } = await db.from("downtime_central_sessions")
    .select("username,expires_at")
    .eq("token_hash", await digest(rawToken))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (sessionError || !session) return fail("YARD HUB session expired. Sign in again.", 401);

  const { data: bankRow, error: bankError } = await db.from("downtime_central_bank")
    .select("payload")
    .eq("id", 1)
    .maybeSingle();
  if (bankError || !bankRow?.payload) return fail("Central account directory unavailable.", 503);

  const bank = bankRow.payload as Record<string, any>;
  const users = Array.isArray(bank.users) ? bank.users : [];
  const user = users.find((item: any) =>
    String(item?.username || "").toLowerCase() === String(session.username).toLowerCase() &&
    item?.enabled !== false
  );
  if (!user) return fail("This account is disabled or no longer exists.", 401);

  const legacyTier = String(user.tier || "USER").toUpperCase();
  const root = String(user.username || "").trim().toUpperCase() === "DEV" && legacyTier === "OWNER";
  const tierPermissions = bank.tiers?.[legacyTier] || {};
  const canAccessYardHub = tierPermissions.canAccessYardHub !== false || root;
  const canManageStaff = tierPermissions.canManageStaff === true || root;
  const canViewStaff = tierPermissions.canViewStaff === true || canManageStaff;
  if (!canAccessYardHub) return fail("YARD HUB access is disabled for this account.", 403);
  if (!canViewStaff) return fail("STAFF DIRECTORY access is not enabled for this account.", 403);

  const actor = clean(user.username, 80);
  const managerActions = new Set([
    "create-staff", "update-staff", "archive-staff", "restore-staff",
    "create-role", "update-role", "archive-role",
  ]);
  if (managerActions.has(action) && !canManageStaff) return fail("STAFF MANAGEMENT changes require staff-management permission.", 403);

  const payload: Record<string, unknown> = {};
  if (action === "create-staff" || action === "update-staff") {
    payload.display_name = clean(body.display_name, 120);
    payload.site_role_id = String(body.site_role_id || "");
    if (!payload.display_name) return fail("Staff name is required.");
    if (!uuid(payload.site_role_id)) return fail("Select a valid on-site role.");
    if (action === "update-staff") {
      payload.staff_member_id = String(body.staff_member_id || "");
      if (!uuid(payload.staff_member_id)) return fail("A valid staff member ID is required.");
    }
  } else if (action === "archive-staff" || action === "restore-staff") {
    payload.staff_member_id = String(body.staff_member_id || "");
    if (!uuid(payload.staff_member_id)) return fail("A valid staff member ID is required.");
  } else if (action === "create-role") {
    payload.role_key = clean(body.role_key, 40).toLowerCase();
    payload.display_name = clean(body.display_name, 80);
    payload.sort_order = Number.isInteger(body.sort_order) ? Number(body.sort_order) : 100;
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(String(payload.role_key))) return fail("Role key must use lowercase letters, numbers and underscores.");
    if (!payload.display_name) return fail("Role name is required.");
  } else if (action === "update-role" || action === "archive-role") {
    payload.role_id = String(body.role_id || "");
    if (!uuid(payload.role_id)) return fail("A valid role ID is required.");
    if (action === "update-role") {
      if (body.display_name !== undefined) payload.display_name = clean(body.display_name, 80);
      if (body.sort_order !== undefined && Number.isInteger(body.sort_order)) payload.sort_order = Number(body.sort_order);
      if (typeof body.is_active === "boolean") payload.is_active = body.is_active;
    }
  } else if (action === "link-account" || action === "unlink-account") {
    return fail("Account linking is paused until the existing YARD HUB account directory provides a stable immutable account ID. No username-based link will be created.", 409);
  } else if (action !== "bootstrap") {
    return fail("Unknown STAFF MANAGEMENT action.");
  }

  const { data, error } = await db.rpc("staff_management_rpc", {
    p_action: action,
    p_payload: payload,
    p_actor: actor,
    p_include_management: canManageStaff,
  });
  if (error) {
    const message = String(error.message || "STAFF MANAGEMENT request failed.");
    const status = /not found/i.test(message) ? 404 : 400;
    return fail(message, status);
  }
  return json({
    ...((data && typeof data === "object" && !Array.isArray(data)) ? data : { result: data }),
    user: { username: actor, tier: legacyTier },
    permissions: { canViewStaff, canManageStaff },
  });
});
