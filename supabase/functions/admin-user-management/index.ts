// DOWNTIME — Central USERS management endpoint (staged, Auth-backed)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

const cors = {
  "Access-Control-Allow-Origin": "https://aka30art.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const assignable = ["MANAGER", "SUPERVISOR", "USER", "SPECTATOR"];
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
  const url = Deno.env.get("SUPABASE_URL");
  const pub = Deno.env.get("SUPABASE_ANON_KEY");
  const secret = Deno.env.get("SUPABASE_SECRET_KEY");
  if (!url || !pub || !secret) return reply(500, { error: "Management configuration incomplete" });
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/, "");
  if (!token) return reply(401, { error: "Authentication required" });
  const userClient = createClient(url, pub, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !userData.user) return reply(401, { error: "Invalid session" });
  const callerTier = userData.user.app_metadata?.tier;
  if (!["OWNER", "ADMIN"].includes(callerTier)) return reply(403, { error: "Insufficient tier" });
  let body: { action?: string; userId?: string; tier?: string; displayName?: string };
  try { body = await req.json(); } catch { return reply(400, { error: "Invalid JSON" }); }
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  if (body.action === "list") {
    const users: Array<{ id: string; email?: string; displayName: string; tier?: string; createdAt: string; lastSignInAt?: string }> = [];
    for (let page = 1; page <= 20; page++) {
      const result = await admin.auth.admin.listUsers({ page, perPage: 100 });
      if (result.error) return reply(500, { error: "Unable to list central users" });
      for (const u of result.data.users) {
        if (u.app_metadata?.app !== "DOWNTIME") continue;
        users.push({ id: u.id, email: u.email, displayName: u.user_metadata?.display_name || "", tier: u.app_metadata?.tier, createdAt: u.created_at, lastSignInAt: u.last_sign_in_at });
      }
      if (result.data.users.length < 100) break;
    }
    return reply(200, { users });
  }

  if (body.action === "update") {
    if (!body.userId || !body.tier || !assignable.includes(body.tier)) return reply(400, { error: "User ID and an assignable tier are required" });
    const target = await admin.auth.admin.getUserById(body.userId);
    if (target.error || !target.data.user) return reply(404, { error: "User not found" });
    const targetTier = target.data.user.app_metadata?.tier;
    if (targetTier === "OWNER" || targetTier === "ADMIN") return reply(403, { error: "Privileged account changes require OWNER and cannot be assigned here" });
    const { error } = await admin.auth.admin.updateUserById(body.userId, { app_metadata: { tier: body.tier, app: "DOWNTIME" } });
    if (error) return reply(400, { error: "Tier update failed" });
    return reply(200, { success: true, userId: body.userId, tier: body.tier });
  }

  if (body.action === "delete") {
    if (!body.userId) return reply(400, { error: "User ID required" });
    const target = await admin.auth.admin.getUserById(body.userId);
    if (target.error || !target.data.user) return reply(404, { error: "User not found" });
    const targetTier = target.data.user.app_metadata?.tier;
    if (targetTier === "OWNER" || targetTier === "ADMIN") return reply(403, { error: "Privileged accounts are protected from this endpoint" });
    const { error } = await admin.auth.admin.deleteUser(body.userId);
    if (error) return reply(400, { error: "User deletion failed" });
    return reply(200, { success: true, userId: body.userId });
  }
  return reply(400, { error: "Unsupported action" });
});
