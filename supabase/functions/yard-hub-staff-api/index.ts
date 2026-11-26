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
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const digest = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
const safeUser = (user: any) => ({
  username: String(user.username || ""),
  displayName: String(user.displayName || user.username || ""),
  tier: String(user.tier || "USER").toUpperCase(),
  enabled: user.enabled !== false,
});
const tiers = ["OWNER", "DEVACC", "ADMIN", "MANAGER", "SUPERVISOR", "MECHANIC", "USER", "SPECTATOR"];

function isRootDev(user: any, legacyTier: string) {
  return String(user?.username || "").trim().toUpperCase() === "DEV" && legacyTier === "OWNER";
}
function assignedHubTier(config: any, username: string) {
  const saved = String(config?.userTiers?.[String(username || "").trim().toLowerCase()] || "").toUpperCase();
  const customTiers = Array.isArray(config?.customTiers) ? config.customTiers : [];
  const retired = Array.isArray(config?.retiredTiers) ? config.retiredTiers : [];
  return (tiers.includes(saved) && !retired.includes(saved)) || customTiers.includes(saved) ? saved : "USER";
}
const modeRank: Record<string, number> = { NONE: 0, READ: 1, INPUT: 2, EDIT: 3 };
const cleanText = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const validUuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    if (req.headers.get("origin") && req.headers.get("origin") !== allowedOrigin) return new Response("Forbidden", { status: 403 });
    return new Response("ok", { headers });
  }
  if (req.headers.get("origin") && req.headers.get("origin") !== allowedOrigin) return json({ error: "Origin denied" }, 403);
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "YARD HUB Staff service configuration missing." }, 500);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: Record<string, any>;
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
    .select("payload")
    .eq("id", 1)
    .maybeSingle();
  if (bankError || !bankRow?.payload) return json({ error: "Central account directory is unavailable." }, 503);
  const bank = bankRow.payload as Record<string, any>;
  const accounts = Array.isArray(bank.users) ? bank.users : [];
  const user = accounts.find((item: any) =>
    String(item.username || "").toLowerCase() === String(session.username || "").toLowerCase() &&
    item.enabled !== false
  );
  if (!user) return json({ error: "This account is disabled or no longer exists." }, 401);

  const { data: configRow, error: configError } = await db.from("yard_hub_tier_config")
    .select("payload")
    .eq("id", 1)
    .maybeSingle();
  if (configError || !configRow?.payload) return json({ error: "YARD HUB permission settings are unavailable." }, 503);

  const legacyTier = String(user.tier || "USER").toUpperCase();
  const hubTier = assignedHubTier(configRow.payload, user.username);
  const legacyPermissions = bank.tiers?.[legacyTier] || {};
  const isRoot = isRootDev(user, legacyTier) || legacyTier === "DEVACC";
  const canAccessYardHub = legacyPermissions.canAccessYardHub !== false || isRootDev(user, legacyTier);
  if (!canAccessYardHub) return json({ error: "YARD HUB access is disabled for this account." }, 403);

  const staffMode = String(configRow.payload?.tiers?.[hubTier]?.floor || "NONE").toUpperCase();
  const rank = modeRank[staffMode] ?? 0;
  if (!rank) return json({ error: "STAFF MANAGEMENT is not enabled for your YARD HUB tier." }, 403);
  const actor = String(user.username || "UNKNOWN");
  const canManageAccounts = legacyPermissions.canManageUsers === true || legacyTier === "OWNER" || legacyTier === "DEVACC";
  const requireMode = (needed: "READ" | "INPUT" | "EDIT") =>
    rank >= modeRank[needed] ? null : json({ error: "Your YARD HUB tier does not have " + needed + " access to STAFF MANAGEMENT." }, 403);
  const accountByUsername = (username: string) =>
    accounts.find((item: any) => String(item.username || "").toLowerCase() === username.toLowerCase());

  if (action === "state") {
    const denied = requireMode("READ"); if (denied) return denied;
    const [peopleResult, companiesResult, rolesResult, assignmentsResult] = await Promise.all([
      db.from("yard_hub_staff_people").select("*").order("staff_number", { ascending: true }).limit(1000),
      db.from("yard_hub_staff_companies").select("*").order("name", { ascending: true }).limit(500),
      db.from("yard_hub_staff_roles").select("*").order("sort_order", { ascending: true }).order("name", { ascending: true }).limit(500),
      db.from("yard_hub_staff_role_assignments").select("*").order("assigned_at", { ascending: false }).limit(3000),
    ]);
    const err = peopleResult.error || companiesResult.error || rolesResult.error || assignmentsResult.error;
    if (err) return json({ error: "STAFF MANAGEMENT directory could not be loaded." }, 503);
    const linkedUsernames = new Set((peopleResult.data || [])
      .map((person: any) => String(person.linked_username || "").toLowerCase())
      .filter(Boolean));
    return json({
      actor,
      hubTier,
      permissionMode: staffMode,
      canManageAccounts,
      people: peopleResult.data || [],
      companies: companiesResult.data || [],
      roles: rolesResult.data || [],
      roleAssignments: assignmentsResult.data || [],
      // Account choices are returned only to existing Central Users managers.
      // Other readers receive safe status details for accounts already linked to a staff profile.
      accounts: accounts
        .filter((account: any) => canManageAccounts || linkedUsernames.has(String(account.username || "").toLowerCase()))
        .map(safeUser)
        .sort((a: any, b: any) => a.username.localeCompare(b.username)),
    });
  }

  if (action === "audit") {
    const denied = requireMode("READ"); if (denied) return denied;
    const { data, error } = await db.from("yard_hub_staff_audit")
      .select("*").order("created_at", { ascending: false }).limit(250);
    if (error) return json({ error: "Staff audit history is unavailable." }, 503);
    return json({ entries: data || [] });
  }

  if (action === "person-save") {
    const denied = requireMode("INPUT"); if (denied) return denied;
    const id = body.id ? String(body.id) : null;
    if (id && !validUuid(id)) return json({ error: "Invalid staff record reference." }, 400);
    const fullName = cleanText(body.fullName, 120);
    const displayName = cleanText(body.displayName || body.fullName, 80);
    const staffType = String(body.staffType || "").toUpperCase();
    const employmentStatus = String(body.employmentStatus || "ACTIVE").toUpperCase();
    const linkedUsername = cleanText(body.linkedUsername, 32);
    const companyId = body.companyId ? String(body.companyId) : null;
    const startDate = body.startDate ? String(body.startDate) : null;
    const notes = cleanText(body.notes, 4000);
    const roleIds = Array.isArray(body.roleIds) ? [...new Set(body.roleIds.map((value: unknown) => String(value)))] : [];
    const primaryRoleId = body.primaryRoleId ? String(body.primaryRoleId) : null;
    if (!fullName || !displayName || !["USER", "STAFF"].includes(staffType) || !["ACTIVE", "INACTIVE", "LEFT"].includes(employmentStatus)) {
      return json({ error: "Full name, display name, USER/STAFF classification and employment status are required." }, 400);
    }
    if (companyId && !validUuid(companyId)) return json({ error: "Invalid company or agency selection." }, 400);
    if (roleIds.length > 12 || roleIds.some((value: string) => !validUuid(value)) || (primaryRoleId && !validUuid(primaryRoleId))) {
      return json({ error: "Invalid yard role selection." }, 400);
    }
    if (primaryRoleId && !roleIds.includes(primaryRoleId)) return json({ error: "Primary Yard Role must also be included in the assigned roles." }, 400);
    if (staffType === "USER" && !linkedUsername) return json({ error: "USER records must be linked to an existing YARD HUB account." }, 400);
    if (staffType === "STAFF" && linkedUsername) return json({ error: "STAFF records cannot have a YARD HUB account link." }, 400);
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return json({ error: "Invalid start date." }, 400);

    let existing: any = null;
    if (id) {
      const { data, error } = await db.from("yard_hub_staff_people").select("*").eq("id", id).is("archived_at", null).maybeSingle();
      if (error || !data) return json({ error: "Staff record not found or archived." }, 404);
      existing = data;
    }
    const linkChanged = (existing?.linked_username || null) !== (linkedUsername || null) || (existing?.staff_type || null) !== staffType;
    if (linkChanged && !canManageAccounts) return json({ error: "Only authorised YARD HUB account managers can link or unlink login accounts." }, 403);
    if (rank < modeRank.EDIT && existing) return json({ error: "INPUT access can add new people, but cannot edit existing staff records." }, 403);
    if (rank < modeRank.EDIT && staffType !== "STAFF") return json({ error: "INPUT access can create STAFF-only records. USER account linking requires EDIT and account-management rights." }, 403);

    if (existing?.linked_username && existing.linked_username.toLowerCase() !== linkedUsername.toLowerCase()) {
      const oldAccount = accountByUsername(String(existing.linked_username));
      if (oldAccount?.enabled !== false) return json({ error: "Disable the currently linked YARD HUB account in HUB SETTINGS → USERS before unlinking or changing it." }, 409);
    }
    if (staffType === "USER") {
      const linkedAccount = accountByUsername(linkedUsername);
      if (!linkedAccount) return json({ error: "The selected YARD HUB account no longer exists. Refresh accounts and choose an existing account." }, 409);
      if (employmentStatus === "ACTIVE" && linkedAccount.enabled === false) {
        return json({ error: "The selected YARD HUB account is disabled. Re-enable it in HUB SETTINGS → USERS or keep the person classified as STAFF." }, 409);
      }
      if (employmentStatus !== "ACTIVE" && linkedAccount.enabled !== false) {
        return json({ error: "Disable the YARD HUB account in HUB SETTINGS → USERS before setting employment status to INACTIVE or LEFT." }, 409);
      }
      const duplicate = await db.from("yard_hub_staff_people").select("id").ilike("linked_username", linkedUsername).neq("id", id || "00000000-0000-0000-0000-000000000000").is("archived_at", null).maybeSingle();
      if (duplicate.error) return json({ error: "Account-link uniqueness could not be verified." }, 503);
      if (duplicate.data) return json({ error: "This YARD HUB account is already linked to another staff record." }, 409);
    } else if (existing?.linked_username) {
      const oldAccount = accountByUsername(String(existing.linked_username));
      if (oldAccount?.enabled !== false) return json({ error: "Disable the linked YARD HUB account in HUB SETTINGS → USERS before converting this person to STAFF." }, 409);
    }

    if (rank < modeRank.EDIT && employmentStatus !== "ACTIVE") {
      return json({ error: "INPUT access can only create active STAFF records." }, 403);
    }

    const { data, error } = await db.rpc("yard_hub_staff_save_person", {
      p_person_id: id,
      p_full_name: fullName,
      p_display_name: displayName,
      p_staff_type: staffType,
      p_employment_status: employmentStatus,
      p_company_id: companyId,
      p_linked_username: linkedUsername || null,
      p_start_date: startDate,
      p_notes: notes || null,
      p_role_ids: roleIds,
      p_primary_role_id: primaryRoleId,
      p_actor: actor,
    });
    if (error) return json({ error: error.message || "Staff record could not be saved." }, 400);
    return json({ ok: true, person: data?.person || data });
  }

  if (action === "person-archive") {
    const denied = requireMode("EDIT"); if (denied) return denied;
    const id = String(body.id || "");
    if (!validUuid(id)) return json({ error: "Invalid staff record reference." }, 400);
    const { data: person, error: personError } = await db.from("yard_hub_staff_people").select("*").eq("id", id).is("archived_at", null).maybeSingle();
    if (personError || !person) return json({ error: "Staff record not found or already archived." }, 404);
    if (person.linked_username) {
      if (!canManageAccounts) return json({ error: "Account-manager rights are required before archiving a linked USER record." }, 403);
      const linked = accountByUsername(String(person.linked_username));
      if (linked?.enabled !== false) return json({ error: "Disable the linked YARD HUB account in HUB SETTINGS → USERS before archiving this USER record." }, 409);
    }
    const { data, error } = await db.rpc("yard_hub_staff_archive_person", { p_person_id: id, p_actor: actor });
    if (error) return json({ error: error.message || "Staff record could not be archived." }, 400);
    return json({ ok: true, person: data });
  }

  if (action === "company-save") {
    const denied = requireMode("EDIT"); if (denied) return denied;
    const id = body.id ? String(body.id) : null;
    if (id && !validUuid(id)) return json({ error: "Invalid company or agency reference." }, 400);
    const { data, error } = await db.rpc("yard_hub_staff_save_company", {
      p_company_id: id,
      p_name: cleanText(body.name, 120),
      p_company_type: String(body.companyType || "").toUpperCase(),
      p_contact_name: cleanText(body.contactName, 120) || null,
      p_contact_email: cleanText(body.contactEmail, 180) || null,
      p_contact_phone: cleanText(body.contactPhone, 60) || null,
      p_notes: cleanText(body.notes, 2000) || null,
      p_actor: actor,
    });
    if (error) return json({ error: error.message || "Company or agency could not be saved." }, 400);
    return json({ ok: true, company: data });
  }

  if (action === "company-archive") {
    const denied = requireMode("EDIT"); if (denied) return denied;
    const id = String(body.id || ""); if (!validUuid(id)) return json({ error: "Invalid company or agency reference." }, 400);
    const { data, error } = await db.rpc("yard_hub_staff_archive_company", { p_company_id: id, p_actor: actor });
    if (error) return json({ error: error.message || "Company or agency could not be archived." }, 400);
    return json({ ok: true, company: data });
  }

  if (action === "role-save") {
    const denied = requireMode("EDIT"); if (denied) return denied;
    const id = body.id ? String(body.id) : null;
    if (id && !validUuid(id)) return json({ error: "Invalid yard role reference." }, 400);
    const { data, error } = await db.rpc("yard_hub_staff_save_role", {
      p_role_id: id,
      p_name: cleanText(body.name, 80),
      p_description: cleanText(body.description, 500) || null,
      p_sort_order: Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 100,
      p_actor: actor,
    });
    if (error) return json({ error: error.message || "Yard role could not be saved." }, 400);
    return json({ ok: true, role: data });
  }

  if (action === "role-archive") {
    const denied = requireMode("EDIT"); if (denied) return denied;
    const id = String(body.id || ""); if (!validUuid(id)) return json({ error: "Invalid yard role reference." }, 400);
    const { data, error } = await db.rpc("yard_hub_staff_archive_role", { p_role_id: id, p_actor: actor });
    if (error) return json({ error: error.message || "Yard role could not be archived." }, 400);
    return json({ ok: true, role: data });
  }

  return json({ error: "Unsupported YARD HUB Staff action." }, 400);
});
