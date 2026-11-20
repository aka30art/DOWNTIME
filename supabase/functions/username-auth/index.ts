import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = "https://aka30art.github.io";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-app-session, x-owner-bootstrap-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const PBKDF2_ITERATIONS = 600_000;
const encoder = new TextEncoder();

function b64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromB64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
async function digestToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return b64(new Uint8Array(bytes));
}
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Stored format: pbkdf2-sha256$600000$<base64-salt>$<base64-derived-key>
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 300_000 || iterations > 2_000_000) return false;
  const salt = fromB64(parts[2]), expected = fromB64(parts[3]);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations }, key, expected.length * 8));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
async function validateSession(admin: any, token: string) {
  if (!token || token.length < 40 || token.length > 512) return null;
  const tokenHash = await digestToken(token);
  const { data: session, error } = await admin.from("downtime_auth_sessions")
    .select("session_id,user_id,expires_at,revoked_at,downtime_app_users(user_id,username,display_name,tier,enabled)")
    .eq("token_hash", tokenHash).maybeSingle();
  if (error || !session || session.revoked_at || new Date(session.expires_at) <= new Date()) return null;
  const user = session.downtime_app_users;
  if (!user || !user.enabled) return null;
  await admin.from("downtime_auth_sessions").update({ last_seen_at: new Date().toISOString() }).eq("session_id", session.session_id);
  return { session, user };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin");
    if (origin !== allowedOrigin) return new Response("Forbidden", { status: 403 });
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.headers.get("origin") !== allowedOrigin) return json({ error: "Forbidden origin" }, 403);
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server configuration missing" }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const action = body?.action;
  if (action === "bootstrap-owner") {
    const bootstrapSecret = Deno.env.get("DOWNTIME_OWNER_BOOTSTRAP_SECRET");
    const providedSecret = req.headers.get("x-owner-bootstrap-secret") || "";
    const secretBytes = encoder.encode(bootstrapSecret || "");
    const providedBytes = encoder.encode(providedSecret);
    let secretDiff = secretBytes.length ^ providedBytes.length;
    for (let i = 0; i < Math.max(secretBytes.length, providedBytes.length); i++) secretDiff |= (secretBytes[i] || 0) ^ (providedBytes[i] || 0);
    if (!bootstrapSecret || secretDiff !== 0) return json({ error: "Forbidden" }, 403);
    const username = String(body?.username || "").trim().toLowerCase();
    const displayName = String(body?.displayName || "").trim();
    const pin = String(body?.pin || "");
    if (username !== "jan" || !displayName || displayName.length > 80 || !/^\d{4,8}$/.test(pin)) return json({ error: "Bootstrap requires Jan, a display name, and a 4–8 digit PIN" }, 400);
    const { count, error: countError } = await admin.from("downtime_app_users").select("user_id", { count: "exact", head: true });
    if (countError) return json({ error: "Bootstrap unavailable" }, 503);
    if (count !== 0) return json({ error: "Bootstrap is already closed" }, 409);
    const pinHash = await (async (pw: string) => {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await crypto.subtle.importKey("raw", encoder.encode(pw), "PBKDF2", false, ["deriveBits"]);
      const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256));
      return "pbkdf2-sha256$" + PBKDF2_ITERATIONS + "$" + b64(salt) + "$" + b64(derived);
    })(pin);
    const { data, error: insertError } = await admin.from("downtime_app_users").insert({ username: "jan", display_name: displayName, password_hash: pinHash, tier: "OWNER", enabled: true }).select("user_id,username,display_name,tier,enabled").single();
    if (insertError) return json({ error: "Bootstrap failed" }, 503);
    await admin.from("downtime_sync_audit").insert({ actor_id: data.user_id, domain: "USERS", record_key: data.user_id, operation: "INSERT", new_data: { username: "jan", tier: "OWNER", bootstrap: true } });
    return json({ user: data, bootstrapClosed: true }, 201);
  }
  if (action === "login") {
    const username = String(body?.username || "").trim().toLowerCase();
    const pin = String(body?.pin || "");
    if (!/^[a-z0-9._-]{3,32}$/.test(username) || !/^\d{4,8}$/.test(pin)) return json({ error: "Invalid username or PIN" }, 400);
    const rateKey = await digestToken("downtime-login:" + username);
    const { data: permitted, error: rateError } = await admin.rpc("downtime_auth_rate_limit", { p_login_key_hash: rateKey, p_max_attempts: 5, p_window_seconds: 900 });
    if (rateError) return json({ error: "Authentication unavailable" }, 503);
    if (permitted !== true) return json({ error: "Too many login attempts. Try again later." }, 429);
    const { data: user, error } = await admin.from("downtime_app_users").select("user_id,username,display_name,password_hash,tier,enabled").eq("username", username).maybeSingle();
    if (error) return json({ error: "Authentication unavailable" }, 503);
    if (!user || !user.enabled || !await verifyPassword(pin, user.password_hash)) return json({ error: "Invalid username or PIN" }, 401);
    await admin.rpc("downtime_auth_rate_limit_reset", { p_login_key_hash: rateKey });
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = b64(tokenBytes);
    const tokenHash = await digestToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
    const { error: insertError } = await admin.from("downtime_auth_sessions").insert({ user_id: user.user_id, token_hash: tokenHash, expires_at: expiresAt });
    if (insertError) return json({ error: "Could not create session" }, 503);
    return json({ token, expiresAt, user: { username: user.username, displayName: user.display_name, tier: user.tier } });
  }
  const token = req.headers.get("x-app-session") || String(body?.token || "");
  const valid = await validateSession(admin, token);
  if (!valid) return json({ error: "Session invalid or expired" }, 401);
  if (action === "validate") return json({ user: { username: valid.user.username, displayName: valid.user.display_name, tier: valid.user.tier }, expiresAt: valid.session.expires_at });
  if (action === "logout") {
    const tokenHash = await digestToken(token);
    const { error } = await admin.from("downtime_auth_sessions").update({ revoked_at: new Date().toISOString() }).eq("token_hash", tokenHash).is("revoked_at", null);
    if (error) return json({ error: "Logout failed" }, 503);
    return json({ ok: true });
  }
  return json({ error: "Unknown action" }, 400);
});
