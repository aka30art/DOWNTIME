import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const allowedOrigin = "https://aka30art.github.io";
const bucket = "repair-maintenance-evidence";
const machineTypes = ["KIVERCO_PICKING_LINE", "TANNA_SHREDDER", "FORKLIFT", "TELEHANDLER", "EXCAVATORS_360", "OTHER_EQUIPMENT"] as const;
const priorities = ["HIGH", "MEDIUM", "LOW"] as const;
const statuses = ["OPEN", "IN PROGRESS", "REPAIRED"] as const;
const mimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"]);
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-downtime-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Vary": "Origin",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const cryptoHex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const digest = async (s: string) => cryptoHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
const cleanText = (value: unknown, label: string, max: number, required = true) => {
  const result = String(value ?? "").trim();
  if (required && !result) throw new Error(`${label} is required.`);
  if (result.length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
  return result;
};
const isOneOf = <T extends readonly string[]>(value: unknown, allowed: T): value is T[number] => typeof value === "string" && allowed.includes(value);
const fail = (message: string) => ({ error: message });

const tierDefault: Record<string, Record<string, boolean>> = {
  OWNER: { canAccessYardHub: true, canAccessRepairMaintenance: true, canEditRepairMaintenance: true, canDeleteRepairMaintenance: true, canExportRepairMaintenanceReports: true },
  DEVACC: { canAccessYardHub: true, canAccessRepairMaintenance: true, canEditRepairMaintenance: true, canDeleteRepairMaintenance: true, canExportRepairMaintenanceReports: true },
  ADMIN: { canAccessYardHub: true, canAccessRepairMaintenance: true, canEditRepairMaintenance: true, canDeleteRepairMaintenance: true, canExportRepairMaintenanceReports: true },
  MANAGER: { canAccessYardHub: true, canAccessRepairMaintenance: true, canEditRepairMaintenance: true, canDeleteRepairMaintenance: true, canExportRepairMaintenanceReports: true },
  SUPERVISOR: { canAccessYardHub: true, canAccessRepairMaintenance: true, canEditRepairMaintenance: true, canDeleteRepairMaintenance: true, canExportRepairMaintenanceReports: true },
  USER: { canAccessYardHub: true, canAccessRepairMaintenance: false, canEditRepairMaintenance: false, canDeleteRepairMaintenance: false, canExportRepairMaintenanceReports: false },
  SPECTATOR: { canAccessYardHub: true, canAccessRepairMaintenance: false, canEditRepairMaintenance: false, canDeleteRepairMaintenance: false, canExportRepairMaintenanceReports: false },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    if (req.headers.get("origin") && req.headers.get("origin") !== allowedOrigin) return new Response("Forbidden", { status: 403 });
    return new Response("ok", { headers });
  }
  if (req.headers.get("origin") && req.headers.get("origin") !== allowedOrigin) return json({ error: "Origin denied" }, 403);
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "R&M service configuration missing" }, 500);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON request" }, 400); }
  const action = String(body.action || "");

  // Reuse the exact session issued by the existing DOWNTIME Central Bank login.
  const rawToken = req.headers.get("x-downtime-session") || "";
  if (!rawToken) return json({ error: "YARD HUB session required. Sign in through DOWNTIME first." }, 401);
  const tokenHash = await digest(rawToken);
  const { data: session, error: sessionError } = await db.from("downtime_central_sessions")
    .select("username,expires_at").eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (sessionError || !session) return json({ error: "YARD HUB session expired. Sign in again." }, 401);

  const { data: bankRow, error: bankError } = await db.from("downtime_central_bank").select("payload").eq("id", 1).maybeSingle();
  if (bankError || !bankRow?.payload) return json({ error: "Central account data is unavailable." }, 503);
  const bank = bankRow.payload as Record<string, any>;
  const user = (Array.isArray(bank.users) ? bank.users : []).find((item: any) => String(item.username).toLowerCase() === String(session.username).toLowerCase() && item.enabled !== false);
  if (!user) return json({ error: "This account is disabled or no longer exists." }, 401);
  const tier = String(user.tier || "USER").toUpperCase();
  const stored = bank.tiers?.[tier] || {};
  const permissions = { ...(tierDefault[tier] || tierDefault.USER), ...stored };
  if (tier === "OWNER" || tier === "DEVACC") Object.assign(permissions, tierDefault[tier]);

  // R&M section permissions use the separate YARD HUB tier assignment and matrix.
  // Before migration, retain the exact previous R&M behaviour. Other database errors
  // fail closed, rather than accidentally granting access.
  const { data: hubAccessRow, error: hubAccessError } = await db.from("yard_hub_tier_config")
    .select("payload").eq("id", 1).maybeSingle();
  const missingHubTable = hubAccessError?.code === "42P01" || hubAccessError?.code === "PGRST205";
  if (hubAccessError && !missingHubTable) {
    return json({ error: "YARD HUB permissions are temporarily unavailable." }, 503);
  }
  if (!hubAccessError && hubAccessRow?.payload) {
    const hubTier = String(hubAccessRow.payload?.userTiers?.[String(user.username).toLowerCase()] || "USER").toUpperCase();
    const mode = hubAccessRow.payload?.tiers?.[hubTier]?.repairMaintenance;
    if (!["NONE", "READ", "EDIT"].includes(mode)) {
      return json({ error: "YARD HUB R&M permission profile is invalid." }, 503);
    }
    permissions.canAccessRepairMaintenance = mode !== "NONE";
    permissions.canEditRepairMaintenance = mode === "EDIT";
    permissions.canDeleteRepairMaintenance = mode === "EDIT";
    permissions.canExportRepairMaintenanceReports = mode === "READ" || mode === "EDIT";
  }
  if (!permissions.canAccessYardHub) return json({ error: "YARD HUB access is not enabled for this account." }, 403);
  if (!permissions.canAccessRepairMaintenance) return json({ error: "R&M access is not enabled for this account." }, 403);

  const actor = String(user.username);
  const audit = async (event: string, details: Record<string, unknown> = {}) => {
    await db.from("repair_maintenance_audit").insert({ actor, action: event, details });
  };
  const requireEdit = () => permissions.canEditRepairMaintenance === true;
  const requireDelete = () => permissions.canDeleteRepairMaintenance === true;
  const loadFault = async (faultId: unknown) => {
    const id = cleanText(faultId, "Fault ID", 64);
    const { data, error } = await db.from("repair_maintenance_faults").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error("Unable to load fault record.");
    if (!data) throw new Error("Fault record not found.");
    return data;
  };

  try {
    if (action === "access") return json({ user: { username: actor, displayName: user.displayName || actor, tier }, permissions });

    if (action === "list") {
      if (!isOneOf(body.machineType, machineTypes)) return json(fail("Select a valid machine type."), 400);
      const { data, error } = await db.from("repair_maintenance_faults").select("id,machine_type,fault_name,description,priority,status,created_by,updated_by,created_at,updated_at")
        .eq("machine_type", body.machineType).order("created_at", { ascending: true });
      if (error) return json({ error: "Unable to load the machinery fault register." }, 503);
      return json({ faults: data || [] });
    }

    if (action === "get") {
      const fault = await loadFault(body.faultId);
      const [{ data: notes, error: notesError }, { data: attachments, error: filesError }] = await Promise.all([
        db.from("repair_maintenance_notes").select("id,note,created_by,created_at").eq("fault_id", fault.id).order("created_at", { ascending: true }),
        db.from("repair_maintenance_attachments").select("id,storage_path,filename,mime_type,size_bytes,kind,created_by,created_at").eq("fault_id", fault.id).order("created_at", { ascending: true }),
      ]);
      if (notesError || filesError) return json({ error: "Unable to load fault history or attachments." }, 503);
      const signed = await Promise.all((attachments || []).map(async (file: any) => {
        const { data, error } = await db.storage.from(bucket).createSignedUrl(file.storage_path, 300);
        if (error) throw new Error("Unable to create a secure evidence link.");
        return { id: file.id, filename: file.filename, mime_type: file.mime_type, size_bytes: file.size_bytes, kind: file.kind, created_by: file.created_by, created_at: file.created_at, signedUrl: data.signedUrl };
      }));
      return json({ fault, notes: notes || [], attachments: signed });
    }

    if (action === "create") {
      if (!requireEdit()) return json({ error: "You do not have permission to create R&M faults." }, 403);
      if (!isOneOf(body.machineType, machineTypes) || !isOneOf(body.priority, priorities) || !isOneOf(body.status, statuses.slice(0, 2))) return json(fail("Machine, priority or status is invalid."), 400);
      const faultName = cleanText(body.faultName, "Fault / defect", 120);
      const description = cleanText(body.description, "Description", 2000);
      const { data, error } = await db.from("repair_maintenance_faults").insert({ machine_type: body.machineType, fault_name: faultName, description, priority: body.priority, status: body.status, created_by: actor, updated_by: actor }).select("*").single();
      if (error || !data) return json({ error: "Unable to save the new fault record." }, 503);
      await audit("rm-fault-create", { faultId: data.id, machineType: data.machine_type, priority: data.priority });
      return json({ fault: data }, 201);
    }

    if (action === "update") {
      if (!requireEdit()) return json({ error: "You do not have permission to update R&M faults." }, 403);
      const fault = await loadFault(body.faultId);
      if (!isOneOf(body.priority, priorities) || !isOneOf(body.status, statuses)) return json(fail("Status or priority is invalid."), 400);
      const { data, error } = await db.from("repair_maintenance_faults").update({ status: body.status, priority: body.priority, updated_by: actor, updated_at: new Date().toISOString() }).eq("id", fault.id).select("*").single();
      if (error || !data) return json({ error: "Unable to update the fault record." }, 503);
      await audit("rm-fault-update", { faultId: fault.id, oldStatus: fault.status, status: data.status, priority: data.priority });
      return json({ fault: data });
    }

    if (action === "note-add") {
      if (!requireEdit()) return json({ error: "You do not have permission to add R&M notes." }, 403);
      const fault = await loadFault(body.faultId), note = cleanText(body.note, "Note", 2000);
      const { data, error } = await db.from("repair_maintenance_notes").insert({ fault_id: fault.id, note, created_by: actor }).select("id,note,created_by,created_at").single();
      if (error || !data) return json({ error: "Unable to save the note." }, 503);
      await db.from("repair_maintenance_faults").update({ updated_by: actor, updated_at: new Date().toISOString() }).eq("id", fault.id);
      await audit("rm-fault-note", { faultId: fault.id, noteId: data.id });
      return json({ note: data }, 201);
    }

    if (action === "upload") {
      if (!requireEdit()) return json({ error: "You do not have permission to attach R&M evidence." }, 403);
      const fault = await loadFault(body.faultId);
      const filename = cleanText(body.filename, "Filename", 180);
      const mimeType = String(body.mimeType || "").toLowerCase();
      const kind = body.kind === "PHOTO" ? "PHOTO" : body.kind === "FILE" ? "FILE" : "";
      if (!kind || !mimeTypes.has(mimeType) || (kind === "PHOTO" && !mimeType.startsWith("image/"))) return json(fail("File type is not supported."), 400);
      const dataUrl = String(body.dataUrl || "");
      const match = dataUrl.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);
      if (!match || match[1].toLowerCase() !== mimeType || match[2].length > 5_600_000) return json(fail("File data is invalid or exceeds the 4 MB limit."), 400);
      const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
      if (!bytes.length || bytes.length > 4 * 1024 * 1024) return json(fail("File exceeds the 4 MB limit."), 400);
      const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "evidence";
      const storagePath = `${fault.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await db.storage.from(bucket).upload(storagePath, bytes, { contentType: mimeType, upsert: false });
      if (uploadError) return json({ error: "Unable to store the attachment securely." }, 503);
      const { data, error } = await db.from("repair_maintenance_attachments").insert({ fault_id: fault.id, storage_path: storagePath, filename, mime_type: mimeType, size_bytes: bytes.length, kind, created_by: actor }).select("id,filename,kind,created_at").single();
      if (error || !data) {
        await db.storage.from(bucket).remove([storagePath]);
        return json({ error: "Unable to register the attachment." }, 503);
      }
      await db.from("repair_maintenance_faults").update({ updated_by: actor, updated_at: new Date().toISOString() }).eq("id", fault.id);
      await audit("rm-fault-attachment", { faultId: fault.id, attachmentId: data.id, kind, bytes: bytes.length });
      return json({ attachment: data }, 201);
    }

    if (action === "delete") {
      if (!requireDelete()) return json({ error: "You do not have permission to delete R&M faults." }, 403);
      const fault = await loadFault(body.faultId);
      const { data: files, error: fileError } = await db.from("repair_maintenance_attachments").select("storage_path").eq("fault_id", fault.id);
      if (fileError) return json({ error: "Unable to check fault attachments before deletion." }, 503);
      if (files?.length) {
        const { error: storageError } = await db.storage.from(bucket).remove(files.map((f: any) => f.storage_path));
        if (storageError) return json({ error: "Unable to remove stored evidence. Fault was not deleted." }, 503);
      }
      const { error } = await db.from("repair_maintenance_faults").delete().eq("id", fault.id);
      if (error) return json({ error: "Unable to delete the fault record." }, 503);
      await audit("rm-fault-delete", { faultId: fault.id, machineType: fault.machine_type, faultName: fault.fault_name });
      return json({ ok: true });
    }

    return json({ error: "Unknown R&M action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "R&M request failed.";
    return json({ error: message }, 400);
  }
});
