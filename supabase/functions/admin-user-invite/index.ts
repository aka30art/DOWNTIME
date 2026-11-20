// DOWNTIME — Authenticated admin user invitation endpoint (staged)
// Deploy only after Auth configuration, secrets, and central-user schema are reviewed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

const cors = {
  "Access-Control-Allow-Origin": "https://aka30art.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const allowedTiers = ["ADMIN", "MANAGER", "SUPERVISOR", "USER", "SPECTATOR"];

function response(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: cors });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return response(405, { error: "Method not allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  const secretKey = Deno.env.get("SUPABASE_SECRET_KEY");
  if (!url || !publishableKey || !secretKey) {
    return response(500, { error: "Auth provisioning configuration is incomplete" });
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return response(401, { error: "Authentication required" });
  const token = authorization.slice(7);

  const callerClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
  if (callerError || !callerData.user) return response(401, { error: "Invalid session" });

  const callerTier = callerData.user.app_metadata?.tier;
  if (!["OWNER", "ADMIN"].includes(callerTier)) return response(403, { error: "Insufficient tier" });

  let input: { email?: string; displayName?: string; tier?: string };
  try {
    input = await req.json();
  } catch {
    return response(400, { error: "Invalid JSON body" });
  }
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  const tier = input.tier;
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response(400, { error: "Valid email required" });
  }
  if (!displayName || displayName.length > 80) return response(400, { error: "Display name required (maximum 80 characters)" });
  if (!allowedTiers.includes(tier)) return response(400, { error: "Tier is not assignable" });
  if (tier === "ADMIN" && callerTier !== "OWNER") return response(403, { error: "Only OWNER can assign ADMIN" });
  if (tier === "OWNER") return response(403, { error: "OWNER cannot be assigned through invitations" });

  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName },
    redirectTo: "https://aka30art.github.io/DOWNTIME/",
  });
  if (inviteError || !invitation.user) {
    return response(400, { error: inviteError?.message ?? "Invitation could not be created" });
  }

  const { error: metadataError } = await admin.auth.admin.updateUserById(invitation.user.id, {
    app_metadata: { tier, app: "DOWNTIME" },
  });
  if (metadataError) {
    // Do not silently leave an invited user with incomplete authorization metadata.
    await admin.auth.admin.deleteUser(invitation.user.id);
    return response(500, { error: "Invitation provisioning failed; created account was rolled back" });
  }

  return response(201, { success: true, user: { id: invitation.user.id, email, display_name: displayName, tier } });
});
