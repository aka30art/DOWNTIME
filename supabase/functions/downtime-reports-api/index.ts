import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = "https://aka30art.github.io";
const bucket = "downtime-pdfs";
const maxBytes = 5 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cors = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-downtime-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Vary": "Origin",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

async function authorize(req: Request, url: string, serviceKey: string) {
  const token = (req.headers.get("x-downtime-session") || "").trim();
  if (!token) return { error: "A valid DOWNTIME session is required.", status: 401 };
  let response: Response;
  try {
    response = await fetch(url.replace(/\/$/, "") + "/functions/v1/central-bank", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": "Bearer " + serviceKey,
        "x-downtime-session": token,
      },
      body: JSON.stringify({ action: "reports-context" }),
    });
  } catch {
    return { error: "Central authorization service is unavailable.", status: 503 };
  }
  if (!response.ok) return { error: response.status === 401 ? "Session invalid or expired." : "Central authorization service is unavailable.", status: response.status === 401 ? 401 : 503 };
  let context: any;
  try { context = await response.json(); } catch { return { error: "Invalid Central authorization response.", status: 503 }; }
  if (!context?.user?.username || !context?.permissions) return { error: "Report authorization context is unavailable.", status: 503 };
  return { user: context.user, permissions: context.permissions };
}

function cleanFileName(value: unknown) {
  const name = String(value || "").trim().replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120);
  return name.toLowerCase().endsWith(".pdf") ? name : "";
}

function validWeekStart(value: unknown) {
  const week = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return false;
  const date = new Date(week + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === week;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin");
    if (origin && origin !== allowedOrigin) return new Response("Forbidden", { status: 403 });
    return new Response("ok", { headers: cors });
  }
  const origin = req.headers.get("origin");
  if (origin && origin !== allowedOrigin) return json({ error: "Origin denied." }, 403);
  if (req.method !== "POST") return json({ error: "POST only." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Report archive service configuration is missing." }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth: any = await authorize(req, url, serviceKey);
  if (auth.error) return json({ error: auth.error }, auth.status);
  const user = auth.user;
  const permissions = auth.permissions;

  let body: any = {};
  let file: File | null = null;
  const contentType = req.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    let form: FormData;
    try { form = await req.formData(); } catch { return json({ error: "Invalid report upload form." }, 400); }
    body.action = String(form.get("action") || "");
    body.weekStart = String(form.get("weekStart") || "");
    body.fileName = String(form.get("fileName") || "");
    try { body.operators = JSON.parse(String(form.get("operators") || "{}")); } catch { return json({ error: "Invalid operator summary." }, 400); }
    const suppliedFile = form.get("file");
    if (suppliedFile instanceof File) file = suppliedFile;
  } else {
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  }

  const action = String(body.action || "");
  if (action === "list") {
    if (permissions.canViewReports !== true && permissions.canExportReports !== true) return json({ error: "Weekly report viewing permission is required." }, 403);
    const { data, error } = await admin.from("downtime_reports")
      .select("id,week_start,created_at,operators,file_name,file_size_bytes")
      .order("created_at", { ascending: false }).limit(100);
    if (error) return json({ error: "Weekly report archive is unavailable." }, 503);
    return json({ reports: data || [] });
  }

  if (action === "download") {
    if (permissions.canViewReports !== true && permissions.canExportReports !== true) return json({ error: "Weekly report viewing permission is required." }, 403);
    const reportId = String(body.reportId || "");
    if (!uuidPattern.test(reportId)) return json({ error: "Invalid report ID." }, 400);
    const { data: report, error } = await admin.from("downtime_reports").select("id,storage_path,file_name").eq("id", reportId).maybeSingle();
    if (error) return json({ error: "Weekly report archive is unavailable." }, 503);
    if (!report) return json({ error: "Weekly report not found." }, 404);
    const { data, error: signError } = await admin.storage.from(bucket).createSignedUrl(report.storage_path, 60);
    if (signError) return json({ error: "Unable to create a temporary report download." }, 503);
    return json({ url: data.signedUrl, fileName: report.file_name, expiresIn: 60 });
  }

  if (action === "upload") {
    if (permissions.canExportReports !== true) return json({ error: "Weekly report export permission is required." }, 403);
    if (!file || file.type !== "application/pdf" || file.size < 1 || file.size > maxBytes) return json({ error: "A PDF file up to 5MB is required." }, 413);
    if (!validWeekStart(body.weekStart)) return json({ error: "A valid report week is required." }, 400);
    const fileName = cleanFileName(body.fileName || file.name);
    if (!fileName) return json({ error: "A valid PDF file name is required." }, 400);
    const operators = body.operators;
    if (!operators || typeof operators !== "object" || Array.isArray(operators) || Object.keys(operators).length > 7 ||
        Object.values(operators).some((value: any) => typeof value !== "string" || value.length > 120)) {
      return json({ error: "Invalid weekly operator summary." }, 400);
    }
    const path = body.weekStart + "/" + crypto.randomUUID() + "_" + fileName;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage.from(bucket).upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) return json({ error: "Unable to upload weekly report." }, 503);
    const { data: report, error: insertError } = await admin.from("downtime_reports").insert({
      week_start: body.weekStart, operators, file_name: fileName, storage_path: path, file_size_bytes: file.size,
    }).select("id,week_start,created_at,operators,file_name,file_size_bytes").single();
    if (insertError) {
      await admin.storage.from(bucket).remove([path]);
      return json({ error: "Unable to register weekly report." }, 503);
    }
    const { error: auditError } = await admin.from("downtime_central_audit").insert({
      username: user.username, action: "weekly-report-upload",
      details: { reportId: report.id, weekStart: body.weekStart, actorUserId: user.userId || null, actorStaffId: user.staffId || null },
    });
    if (auditError) {
      await admin.from("downtime_reports").delete().eq("id", report.id);
      await admin.storage.from(bucket).remove([path]);
      return json({ error: "Unable to record weekly report authorization." }, 503);
    }

    // Preserve the existing 12-report retention rule as a server-controlled policy,
    // separate from user-initiated deletion permission.
    let pruned = 0;
    const { data: archive } = await admin.from("downtime_reports").select("id,storage_path").order("created_at", { ascending: false }).limit(100);
    for (const old of (archive || []).slice(12)) {
      const { error: pruneAuditError } = await admin.from("downtime_central_audit").insert({
        username: user.username, action: "weekly-report-auto-prune",
        details: { reportId: old.id, actorUserId: user.userId || null, actorStaffId: user.staffId || null },
      });
      if (pruneAuditError) continue;
      const { error: removeError } = await admin.storage.from(bucket).remove([old.storage_path]);
      if (removeError) continue;
      const { error: deleteError } = await admin.from("downtime_reports").delete().eq("id", old.id);
      if (!deleteError) pruned++;
    }
    return json({ ok: true, report, pruned }, 201);
  }

  if (action === "delete") {
    if (permissions.canDeleteRecords !== true) return json({ error: "Manage permission is required to delete weekly reports." }, 403);
    const reportId = String(body.reportId || "");
    if (!uuidPattern.test(reportId)) return json({ error: "Invalid report ID." }, 400);
    const { data: report, error } = await admin.from("downtime_reports").select("id,storage_path,file_name,week_start").eq("id", reportId).maybeSingle();
    if (error) return json({ error: "Weekly report archive is unavailable." }, 503);
    if (!report) return json({ ok: true });
    const { error: auditError } = await admin.from("downtime_central_audit").insert({
      username: user.username, action: "weekly-report-delete-authorized",
      details: { reportId, fileName: report.file_name, weekStart: report.week_start, actorUserId: user.userId || null, actorStaffId: user.staffId || null },
    });
    if (auditError) return json({ error: "Unable to record weekly report deletion authorization." }, 503);
    const { error: removeError } = await admin.storage.from(bucket).remove([report.storage_path]);
    if (removeError) return json({ error: "Unable to remove weekly report file." }, 503);
    const { error: deleteError } = await admin.from("downtime_reports").delete().eq("id", reportId);
    if (deleteError) return json({ error: "Report file removed but archive metadata could not be updated." }, 503);
    return json({ ok: true });
  }

  return json({ error: "Unknown report archive action." }, 400);
});
