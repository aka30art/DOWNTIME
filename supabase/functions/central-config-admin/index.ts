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
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const digest = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
    (byte) => byte.toString(16).padStart(2, "0")).join("");

const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const departmentDefaults = [
  { id: "downtime", route: "dept-downtime", mark: "D", title: "DOWNTIME", description: "PLANT DOWNTIME & OPERATIONS", categoryId: "operations", enabled: true, order: 0, status: "PROTECTED LIVE APPLICATION", statusTone: "live", submenu: [] },
  { id: "floor", route: "dept-floor", mark: "F", title: "FLOOR", description: "FLOOR & YARD OPERATIONS", categoryId: "operations", enabled: true, order: 1, status: "RESERVED MODULE", statusTone: "planned", submenu: [] },
  { id: "check-sheets", route: "dept-checksheets", mark: "CS", title: "CHECK SHEETS", description: "INSPECTIONS & COMPLIANCE", categoryId: "operations", enabled: true, order: 2, status: "RESERVED MODULE", statusTone: "planned", submenu: [] },
  { id: "repairs-maintenance", route: "dept-rm", mark: "R&M", title: "R&M", description: "REPAIRS & MAINTENANCE", categoryId: "operations", enabled: true, order: 3, status: "EXISTING APPLICATION", statusTone: "live", submenu: [] },
  { id: "hub-settings", route: "dept-yardhub", mark: "YH", title: "HUB SETTINGS", description: "YARD HUB & APPLICATION ACCESS", categoryId: "administration", enabled: true, order: 0, status: "ADMINISTRATION", statusTone: "admin", submenu: [] },
];
const supportedTargets = new Set([
  "overview", "organisation", "structure", "libraries", "defaults", "history",
  "navigation", "department-menu-settings", "modules", "controls", "information",
  "dept-downtime", "dept-floor", "dept-checksheets", "dept-rm", "dept-yardhub",
]);
const navigationDefaults = {
  overview: "Overview", organisation: "Organisation", structure: "Plant & Areas",
  libraries: "Operational Libraries", defaults: "System Defaults",
  history: "Version History", navigation: "Menu & Labels",
  modules: "Module Registry", controls: "System Controls", information: "System Information",
};

function defaultDepartmentMenu() {
  return {
    categories: [
      { id: "operations", label: "Operations", order: 0 },
      { id: "administration", label: "Administration", order: 1 },
    ],
    entries: structuredClone(departmentDefaults),
  };
}
function configString(value: unknown, label: string, max = 120): string {
  const result = String(value ?? "").trim();
  if (result.length > max) throw new Error(label + " must be " + max + " characters or fewer");
  return result;
}
function configStringList(value: unknown, label: string, maxItems = 250, maxLength = 100): string[] {
  if (!Array.isArray(value)) throw new Error(label + " must be a list");
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string") throw new Error(label + " entries must be text");
    const item = raw.trim();
    if (!item) continue;
    if (item.length > maxLength) throw new Error(label + " entries must be " + maxLength + " characters or fewer");
    const key = item.toLocaleLowerCase();
    if (seen.has(key)) throw new Error(label + " contains a duplicate entry: " + item);
    seen.add(key);
    result.push(item);
    if (result.length > maxItems) throw new Error(label + " cannot contain more than " + maxItems + " entries");
  }
  return result;
}
function normalizeDepartmentMenu(input: unknown) {
  const fallback = defaultDepartmentMenu();
  const raw = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const suppliedCategories = Array.isArray(raw.categories) ? raw.categories : fallback.categories;
  if (suppliedCategories.length < 1 || suppliedCategories.length > 20) {
    throw new Error("Department menu must contain between 1 and 20 categories");
  }
  const categories: Array<{ id: string; label: string; order: number }> = [];
  const categoryIds = new Set<string>();
  const categoryLabels = new Set<string>();
  suppliedCategories.forEach((item: any, index: number) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Department categories must be objects");
    const id = configString(item.id, "Category ID", 32).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error("Category IDs must use lowercase letters, numbers and hyphens");
    if (categoryIds.has(id)) throw new Error("Department categories contain a duplicate ID: " + id);
    categoryIds.add(id);
    const label = configString(item.label, "Category label", 40);
    if (!label) throw new Error("Category labels cannot be blank");
    const labelKey = label.toLocaleLowerCase();
    if (categoryLabels.has(labelKey)) throw new Error("Department category labels must be unique");
    categoryLabels.add(labelKey);
    const order = Number.isInteger(Number(item.order)) && Number(item.order) >= 0 ? Number(item.order) : index;
    categories.push({ id, label, order });
  });
  const suppliedEntries = Array.isArray(raw.entries) ? raw.entries : fallback.entries;
  if (suppliedEntries.length > departmentDefaults.length) throw new Error("Unsupported department menu entry");
  const entries = departmentDefaults.map((base) => {
    const item: any = suppliedEntries.find((entry: any) => entry && entry.id === base.id) || {};
    const categoryId = configString(item.categoryId ?? base.categoryId, "Department category", 32).toLowerCase();
    if (!categoryIds.has(categoryId)) throw new Error("Select a supported category for " + base.title);
    const title = configString(item.title ?? base.title, "Department title", 48);
    const description = configString(item.description ?? base.description, "Department description", 100);
    if (!title) throw new Error("Department titles cannot be blank");
    const rawOrder = Number(item.order);
    const order = Number.isInteger(rawOrder) && rawOrder >= 0 ? rawOrder : base.order;
    const suppliedSubmenu = Array.isArray(item.submenu) ? item.submenu : [];
    if (suppliedSubmenu.length > 12) throw new Error("A department can contain no more than 12 submenu entries");
    const submenuIds = new Set<string>();
    const submenu = suppliedSubmenu.map((child: any, index: number) => {
      if (!child || typeof child !== "object" || Array.isArray(child)) throw new Error("Submenu entries must be objects");
      const childId = configString(child.id, "Submenu ID", 40).toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(childId) || submenuIds.has(childId)) throw new Error("Submenu IDs must be unique lowercase slugs");
      submenuIds.add(childId);
      const label = configString(child.label, "Submenu label", 40);
      const target = configString(child.target, "Submenu destination", 40);
      if (!label) throw new Error("Submenu labels cannot be blank");
      if (!supportedTargets.has(target)) throw new Error("Submenu destination is not supported");
      const childOrder = Number.isInteger(Number(child.order)) && Number(child.order) >= 0 ? Number(child.order) : index;
      return { id: childId, label, target, enabled: child.enabled !== false, order: childOrder };
    }).sort((a: any, b: any) => a.order - b.order);
    return {
      ...base,
      title,
      description,
      categoryId,
      enabled: item.enabled !== false,
      order,
      submenu,
    };
  });
  const groupedOrders = new Map<string, Set<number>>();
  for (const entry of entries) {
    const used = groupedOrders.get(entry.categoryId) || new Set<number>();
    if (used.has(entry.order)) throw new Error("Department order values must be unique within a category");
    used.add(entry.order);
    groupedOrders.set(entry.categoryId, used);
  }
  return {
    categories: categories.sort((a, b) => a.order - b.order),
    entries: entries.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
  };
}
const departmentFeatureOptions: Record<string, string[]> = {
  downtime: ["weekly-tracker", "weekly-reports", "daily-tasks", "operator-on-duty", "plant-overview", "crew-switchboard", "plant-power", "settings"],
  floor: [],
  "check-sheets": [],
  "repairs-maintenance": ["faults-defects", "machinery-register", "service-records", "equipment-catalogue", "report-export"],
  "hub-settings": ["user-management", "staff-management", "access-rights", "department-menu", "central-data-bank"],
};
const departmentLandingTargets: Record<string, string> = {
  downtime: "dept-downtime", floor: "dept-floor", "check-sheets": "dept-checksheets",
  "repairs-maintenance": "dept-rm", "hub-settings": "dept-yardhub",
};
function defaultDepartmentSettings() {
  return Object.fromEntries(Object.entries(departmentLandingTargets).map(([id, target]) => [id, {
    moduleAvailable: !["floor", "check-sheets"].includes(id),
    defaultLandingPage: target,
    availableFeatures: departmentFeatureOptions[id],
    displayPreferences: { density: "comfortable", showDescriptions: true, showStatusBadges: true, showQuickLinks: true },
  }]));
}
function normalizeDepartmentSettings(input: unknown) {
  const defaults = defaultDepartmentSettings();
  const raw = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, any> : {};
  const result: Record<string, any> = {};
  for (const [id, target] of Object.entries(departmentLandingTargets)) {
    const item = raw[id] && typeof raw[id] === "object" && !Array.isArray(raw[id]) ? raw[id] : {};
    const landing = configString(item.defaultLandingPage ?? target, "Department landing page", 40);
    if (landing !== target && landing !== "overview") throw new Error("Unsupported default landing page for " + id);
    const features = configStringList(item.availableFeatures ?? departmentFeatureOptions[id], "Department features", 20, 60);
    if (features.some(feature => !departmentFeatureOptions[id].includes(feature))) throw new Error("Unsupported feature configured for " + id);
    const prefs = item.displayPreferences && typeof item.displayPreferences === "object" && !Array.isArray(item.displayPreferences) ? item.displayPreferences : {};
    const density = configString(prefs.density ?? "comfortable", "Department display density", 20);
    if (!["comfortable", "compact"].includes(density)) throw new Error("Department display density must be comfortable or compact");
    result[id] = {
      moduleAvailable: item.moduleAvailable !== undefined ? item.moduleAvailable === true : defaults[id].moduleAvailable,
      defaultLandingPage: landing,
      availableFeatures: features,
      displayPreferences: {
        density,
        showDescriptions: prefs.showDescriptions !== false,
        showStatusBadges: prefs.showStatusBadges !== false,
        showQuickLinks: prefs.showQuickLinks !== false,
      },
    };
  }
  return result;
}

const yardHubDepartmentDefaults = [
  { id: "downtime", kind: "downtime", title: "DOWNTIME", description: "PLANT DOWNTIME & OPERATIONS", enabled: true, order: 0, protected: true, submenus: [] },
  { id: "floor", kind: "floor", title: "FLOOR", description: "FLOOR & YARD OPERATIONS", enabled: true, order: 1, protected: false, submenus: [] },
  { id: "check-sheets", kind: "check-sheets", title: "CHECK SHEETS", description: "INSPECTIONS & COMPLIANCE", enabled: true, order: 2, protected: false, submenus: [] },
  { id: "repairs-maintenance", kind: "repairs-maintenance", title: "R&M", description: "REPAIRS & MAINTENANCE", enabled: true, order: 3, protected: false, submenus: [] },
  { id: "hub-settings", kind: "hub-settings", title: "HUB SETTINGS", description: "YARD HUB CONFIGURATION & ACCESS CONTROL", enabled: true, order: 4, protected: true, submenus: [] },
];
function defaultYardHubMenu() {
  return { departments: structuredClone(yardHubDepartmentDefaults) };
}
function normalizeYardHubMenu(input: unknown) {
  const fallback = defaultYardHubMenu();
  const raw = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const supplied = Array.isArray(raw.departments) ? raw.departments : fallback.departments;
  if (supplied.length < 1 || supplied.length > 100) throw new Error("YARD HUB must contain between 1 and 100 departments");
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const departments = supplied.map((item: any, index: number) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("YARD HUB department entries must be objects");
    const id = configString(item.id, "Department ID", 40).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || seenIds.has(id)) throw new Error("Department IDs must be unique lowercase slugs");
    seenIds.add(id);
    const base = yardHubDepartmentDefaults.find(entry => entry.id === id);
    const kind = base ? base.kind : "custom";
    const title = base?.kind === "downtime" ? base.title : configString(item.title ?? base?.title, "Department title", 48);
    const description = base?.kind === "downtime" ? base.description : configString(item.description ?? base?.description ?? "", "Department description", 100);
    if (!title) throw new Error("Department titles cannot be blank");
    const titleKey = title.toLocaleLowerCase();
    if (seenTitles.has(titleKey)) throw new Error("Department titles must be unique");
    seenTitles.add(titleKey);
    const order = Number.isInteger(Number(item.order)) && Number(item.order) >= 0 ? Number(item.order) : index;
    const enabled = base?.protected ? true : item.enabled !== false;
    const rawSubmenus = base?.kind === "downtime" || base?.kind === "hub-settings" ? [] : (Array.isArray(item.submenus) ? item.submenus : []);
    if (rawSubmenus.length > 30) throw new Error("A department can contain no more than 30 sub-menu items");
    const submenuIds = new Set<string>();
    const submenus = rawSubmenus.map((child: any, childIndex: number) => {
      if (!child || typeof child !== "object" || Array.isArray(child)) throw new Error("Sub-menu entries must be objects");
      const childId = configString(child.id, "Sub-menu ID", 40).toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(childId) || submenuIds.has(childId)) throw new Error("Sub-menu IDs must be unique lowercase slugs");
      submenuIds.add(childId);
      const label = configString(child.label, "Sub-menu title", 48);
      if (!label) throw new Error("Sub-menu titles cannot be blank");
      const childOrder = Number.isInteger(Number(child.order)) && Number(child.order) >= 0 ? Number(child.order) : childIndex;
      return { id: childId, label, enabled: child.enabled !== false, order: childOrder };
    }).sort((a: any, b: any) => a.order - b.order);
    return {
      id, kind, title, description, enabled, order,
      protected: base?.protected === true,
      submenus,
    };
  }).sort((a: any, b: any) => a.order - b.order || a.id.localeCompare(b.id));
  const usedOrders = new Set<number>();
  for (const item of departments) {
    if (usedOrders.has(item.order)) throw new Error("YARD HUB department order values must be unique");
    usedOrders.add(item.order);
  }
  return { departments };
}

function normalizeMasterHierarchy(input: unknown) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Error("Master hierarchy must be a list of sites");
  if (input.length > 100) throw new Error("Master hierarchy cannot contain more than 100 sites");
  const seenIds = new Set<string>();
  const cleanLevel = (items: any[], level: string, max: number, childKey: string | null, parentPath: string): any[] => {
    if (!Array.isArray(items)) throw new Error(parentPath + " must be a list");
    if (items.length > max) throw new Error(parentPath + " contains too many records");
    const seenNames = new Set<string>();
    return items.map((item: any) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(parentPath + " entries must be objects");
      const id = configString(item.id, level + " ID", 40).toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(level + " IDs must use lowercase letters, numbers and hyphens");
      if (seenIds.has(id)) throw new Error("Master hierarchy contains a duplicate record ID: " + id);
      seenIds.add(id);
      const name = configString(item.name, level + " name", 80);
      if (!name) throw new Error(level + " names cannot be blank");
      const key = name.toLocaleLowerCase();
      if (seenNames.has(key)) throw new Error(parentPath + " contains a duplicate name: " + name);
      seenNames.add(key);
      const result: any = { id, name };
      if (childKey) result[childKey] = cleanLevel(item[childKey] ?? [], ({ plants: "plant", areas: "area", stations: "station" } as Record<string,string>)[childKey]!, childKey === "plants" ? 300 : childKey === "areas" ? 1000 : 3000, childKey === "plants" ? "areas" : childKey === "areas" ? "stations" : null, level + " " + name + " " + childKey);
      else if (item.stations !== undefined) throw new Error("Stations cannot contain child records");
      return result;
    });
  };
  const sites = cleanLevel(input as any[], "site", 100, "plants", "Sites");
  const totals = { plants: 0, areas: 0, stations: 0 };
  sites.forEach((site: any) => site.plants.forEach((plant: any) => { totals.plants++; plant.areas.forEach((area: any) => { totals.areas++; totals.stations += area.stations.length; }); }));
  if (totals.plants > 300 || totals.areas > 1000 || totals.stations > 3000) throw new Error("Master hierarchy exceeds the registry limits");
  return sites;
}

function normalizeCentralConfig(input: any) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Configuration object required");
  if (JSON.stringify(input).length > 250000) throw new Error("Configuration is too large");
  if (Number(input.schemaVersion) !== 1) throw new Error("Unsupported configuration schema version");
  const rawNavigation = input.navigation && typeof input.navigation === "object" && !Array.isArray(input.navigation) ? input.navigation : {};
  const navigation: Record<string, string> = {};
  for (const [key, fallback] of Object.entries(navigationDefaults)) {
    const value = configString(rawNavigation[key] ?? fallback, "Navigation label", 40);
    navigation[key] = value || fallback;
  }
  const modules = configStringList(input.modules || [], "Module registry", 100, 80);
  const organization = input.organization || {};
  const structure = input.structure || {};
  const libraries = input.libraries || {};
  const defaults = input.defaults || {};
  const companyName = configString(organization.companyName, "Company name", 120);
  const siteCode = configString(organization.siteCode, "Site code", 32);
  const timezone = configString(organization.timezone || "Europe/London", "Timezone", 64);
  const locale = configString(organization.locale || "en-GB", "Locale", 20);
  try { new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format(new Date()); }
  catch { throw new Error("Timezone must be a valid IANA timezone"); }
  const shiftSchedule = defaults.shiftSchedule && typeof defaults.shiftSchedule === "object" && !Array.isArray(defaults.shiftSchedule) ? structuredClone(defaults.shiftSchedule) : {};
  if (JSON.stringify(shiftSchedule).length > 60000) throw new Error("Shift schedule is too large");
  const shiftPresets = Array.isArray(defaults.shiftPresets) ? defaults.shiftPresets.slice(0, 50).map((preset: any) => {
    if (!preset || typeof preset !== "object" || Array.isArray(preset) || !preset.config || typeof preset.config !== "object" || Array.isArray(preset.config)) {
      throw new Error("Shift presets must contain a name and configuration");
    }
    return { name: configString(preset.name, "Shift preset name", 60), config: preset.config };
  }).filter((preset: any) => preset.name) : [];
  const weekStartsOn = String(defaults.weekStartsOn || "MONDAY").toUpperCase();
  if (!days.includes(weekStartsOn)) throw new Error("Week start must be a valid day");
  const operatingDays = configStringList(defaults.operatingDays || days.slice(0, 6), "Operating days", 7, 12).map((day) => day.toUpperCase());
  if (operatingDays.some((day) => !days.includes(day))) throw new Error("Operating days contain an invalid day");
  const breakDeductionMinutes = Number(defaults.breakDeductionMinutes);
  if (!Number.isInteger(breakDeductionMinutes) || breakDeductionMinutes < 0 || breakDeductionMinutes > 240) {
    throw new Error("Break deduction must be between 0 and 240 minutes");
  }
  return {
    schemaVersion: 1,
    navigation,
    modules,
    departmentMenu: normalizeDepartmentMenu(input.departmentMenu),
    yardHubMenu: normalizeYardHubMenu(input.yardHubMenu),
    departmentSettings: normalizeDepartmentSettings(input.departmentSettings),
    organization: { companyName, siteCode, timezone, locale },
    structure: {
      sites: configStringList(structure.sites || [], "Sites"),
      plants: configStringList(structure.plants || [], "Plants"),
      areas: configStringList(structure.areas || [], "Plant areas"),
      stations: configStringList(structure.stations || [], "Stations"),
      hierarchy: normalizeMasterHierarchy(structure.hierarchy),
    },
    libraries: {
      areaPresets: configStringList(libraries.areaPresets || [], "Area presets"),
      downtimeReasons: configStringList(libraries.downtimeReasons || [], "Downtime reasons"),
      dailyTaskPresets: configStringList(libraries.dailyTaskPresets || [], "Daily task presets", 250, 120),
      equipmentCategories: configStringList(libraries.equipmentCategories || [], "Equipment categories"),
      eventCategories: configStringList(libraries.eventCategories || [], "Event categories"),
      statusCategories: configStringList(libraries.statusCategories || [], "Status categories"),
    },
    defaults: { shiftSchedule, shiftPresets, weekStartsOn, operatingDays, breakDeductionMinutes },
  };
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
  if (!url || !key) return json({ error: "Server config missing" }, 500);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
  const token = req.headers.get("x-downtime-session") || "";
  if (!token) return json({ error: "Session required" }, 401);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const tokenHash = await digest(token);
  const { data: session, error: sessionError } = await db.from("downtime_central_sessions")
    .select("username,tier,expires_at").eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (sessionError || !session) return json({ error: "Session expired. Sign in again." }, 401);
  const { data: bankRow, error: bankError } = await db.from("downtime_central_bank")
    .select("payload").eq("id", 1).maybeSingle();
  if (bankError || !bankRow) return json({ error: "Central identity registry unavailable" }, 503);
  const users = Array.isArray(bankRow.payload?.users) ? bankRow.payload.users : [];
  const user = users.find((item: any) => item && item.username === session.username && item.enabled !== false);
  if (!user) return json({ error: "Account disabled" }, 401);
  const username = String(user.username || "").trim().toUpperCase();
  const tier = String(user.tier || "");
  const isDevRoot = username === "DEV" && tier === "OWNER";
  const isDevacc = tier === "DEVACC";
  const actor = String(user.username || username);
  const action = body?.action;
  const { data: configState, error: configError } = await db.from("downtime_central_config_state").select("*").eq("id", 1).maybeSingle();
  if (configError || !configState) return json({ error: "Configuration control plane is not installed" }, 503);

  // Authenticated users may read only the published launcher structure. Drafts and all
  // administrative configuration actions remain restricted to DEV OWNER / DEVACC.
  if (action === "yard-hub-menu") {
    try {
      const publishedYardHubMenu = normalizeYardHubMenu(configState.published_payload?.yardHubMenu);
      return json({ yardHubMenu: publishedYardHubMenu, publishedVersion: Number(configState.published_version) });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Published YARD HUB menu is invalid" }, 503);
    }
  }
  if (!isDevRoot && !isDevacc) return json({ error: "Central Data Bank access is restricted to DEV and DEVACC only." }, 403);

  if (action === "central-config-state") {
    let draft: any;
    let published: any;
    try {
      draft = normalizeCentralConfig(configState.draft_payload);
      published = normalizeCentralConfig(configState.published_payload);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Configuration state is invalid" }, 500);
    }
    const { data: history, error: historyError } = await db.from("downtime_central_config_history")
      .select("version,parent_version,action,actor,note,created_at,published_at")
      .order("version", { ascending: false }).limit(40);
    if (historyError) return json({ error: "Configuration history unavailable" }, 503);
    const versions = (history || []).map((item: any) => ({
      ...item,
      status: Number(item.version) === Number(configState.published_version) ? "PUBLISHED" :
        Number(item.version) === Number(configState.draft_version) ? "CURRENT DRAFT" : "HISTORICAL",
    }));
    return json({
      draft, published,
      draftVersion: Number(configState.draft_version),
      publishedVersion: Number(configState.published_version),
      nextVersion: Number(configState.next_version),
      updatedBy: configState.updated_by,
      updatedAt: configState.updated_at,
      publishedBy: configState.published_by,
      publishedAt: configState.published_at,
      versions,
      user: { username: user.username, displayName: user.displayName || user.username, tier },
    });
  }

  if (action === "central-config-impact") {
    if (Number(body.draftVersion) !== Number(configState.draft_version) || Number(body.publishedVersion) !== Number(configState.published_version)) {
      return json({ error: "Configuration changed in another session. Refresh before reviewing impact." }, 409);
    }
    let draft: any;
    let published: any;
    try {
      draft = normalizeCentralConfig(configState.draft_payload);
      published = normalizeCentralConfig(configState.published_payload);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Configuration state is invalid" }, 500);
    }
    const changes: Array<{ path: string; type: string; classification: string; before?: unknown; after?: unknown }> = [];
    const counts = { added: 0, modified: 0, removed: 0 };
    const classifications = { structural: 0, destructive: 0, configuration: 0 };
    const visit = (before: any, after: any, path: string) => {
      if (before === after) return;
      const beforeObject = before !== null && typeof before === "object";
      const afterObject = after !== null && typeof after === "object";
      if (beforeObject && afterObject && Array.isArray(before) === Array.isArray(after)) {
        const keys = Array.isArray(after)
          ? Array.from({ length: Math.max(before.length, after.length) }, (_, index) => String(index))
          : Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
        for (const key of keys) {
          const hasBefore = Array.isArray(before) ? Number(key) < before.length : Object.prototype.hasOwnProperty.call(before, key);
          const hasAfter = Array.isArray(after) ? Number(key) < after.length : Object.prototype.hasOwnProperty.call(after, key);
          const nextPath = path ? path + (Array.isArray(after) ? "[" + key + "]" : "." + key) : key;
          if (!hasBefore) record(nextPath, "added", undefined, after[key]);
          else if (!hasAfter) record(nextPath, "removed", before[key], undefined);
          else visit(before[key], after[key], nextPath);
        }
        return;
      }
      record(path || "configuration", before === undefined ? "added" : after === undefined ? "removed" : "modified", before, after);
    };
    const record = (path: string, type: string, before: unknown, after: unknown) => {
      counts[type as keyof typeof counts]++;
      const classification = type === "removed" ? "destructive" :
        /^(organization|structure)(\.|\[|$)/.test(path) ? "structural" : "configuration";
      classifications[classification as keyof typeof classifications]++;
      if (changes.length < 300) changes.push({ path, type, classification, before, after });
    };
    visit(published, draft, "");
    const summary = {
      ...counts,
      total: counts.added + counts.modified + counts.removed,
      highImpact: classifications.structural + classifications.destructive,
    };
    const impactToken = await digest(JSON.stringify({
      draftVersion: Number(configState.draft_version),
      publishedVersion: Number(configState.published_version),
      draft,
      published,
    }));
    return json({
      draftVersion: Number(configState.draft_version),
      publishedVersion: Number(configState.published_version),
      summary,
      classifications,
      changes,
      truncated: summary.total > changes.length,
      impactToken,
    });
  }

  if (action === "central-config-validate") {
    let config: any;
    try { config = normalizeCentralConfig(body.config); }
    catch (error) { return json({ valid: false, error: error instanceof Error ? error.message : "Configuration validation failed" }, 400); }
    const structure = config.structure;
    const libraries = config.libraries;
    const hierarchy = structure.hierarchy;
    const counts = {
      sites: hierarchy.length,
      plants: hierarchy.reduce((n: number, site: any) => n + site.plants.length, 0),
      areas: hierarchy.reduce((n: number, site: any) => n + site.plants.reduce((p: number, plant: any) => p + plant.areas.length, 0), 0),
      stations: hierarchy.reduce((n: number, site: any) => n + site.plants.reduce((p: number, plant: any) => p + plant.areas.reduce((a: number, area: any) => a + area.stations.length, 0), 0), 0),
      modules: config.modules.length,
      libraryEntries: Object.values(libraries).reduce((n: number, list: any) => n + list.length, 0),
    };
    const warnings: string[] = [];
    if (!config.organization.companyName) warnings.push("Company name is not set");
    if (!config.organization.siteCode) warnings.push("Site code is not set");
    if (!counts.sites && !structure.sites.length) warnings.push("No site hierarchy or legacy site references are registered");
    return json({ valid: true, counts, warnings });
  }

  if (action === "central-config-audit") {
    const requestedLimit = body.limit === undefined ? 100 : Number(body.limit);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 200) {
      return json({ error: "Audit log limit must be between 1 and 200" }, 400);
    }
    const { data: events, error: auditError } = await db.from("downtime_central_audit")
      .select("id,username,action,created_at,details")
      .order("id", { ascending: false }).limit(requestedLimit);
    if (auditError) return json({ error: "Central Data Bank audit log unavailable" }, 503);
    return json({ events: events || [] });
  }

  if (action === "central-config-save-draft") {
    let config: any;
    try { config = normalizeCentralConfig(body.config); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid configuration" }, 400); }
    if (Number(body.draftVersion) !== Number(configState.draft_version) || Number(body.nextVersion) !== Number(configState.next_version)) {
      return json({ error: "Draft changed in another session. Refresh before saving." }, 409);
    }
    let note = "Draft configuration saved";
    try { note = configString(body.note || note, "Change note", 240); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid change note" }, 400); }
    const newVersion = Number(configState.next_version);
    const { error: historyError } = await db.from("downtime_central_config_history").insert({
      version: newVersion, payload: config, parent_version: configState.draft_version,
      action: "draft-save", actor, note,
    });
    if (historyError) return json({ error: "Unable to create configuration version" }, 409);
    const { data: write, error } = await db.from("downtime_central_config_state").update({
      draft_payload: config, draft_version: newVersion, next_version: newVersion + 1,
      updated_by: actor, updated_at: new Date().toISOString(),
    }).eq("id", 1).eq("draft_version", Number(body.draftVersion)).eq("next_version", Number(body.nextVersion)).select("id").maybeSingle();
    if (error || !write) {
      await db.from("downtime_central_config_history").delete().eq("version", newVersion);
      return json({ error: "Draft changed in another session. Refresh before saving." }, 409);
    }
    await db.from("downtime_central_audit").insert({ username: actor, action: "central-config-draft-save", details: { version: newVersion, scope: "central-data-bank" } });
    return json({ ok: true, draftVersion: newVersion, nextVersion: newVersion + 1, updatedAt: new Date().toISOString() });
  }

  if (action === "central-config-publish") {
    if (Number(body.draftVersion) !== Number(configState.draft_version) || Number(body.publishedVersion) !== Number(configState.published_version)) {
      return json({ error: "Configuration changed in another session. Refresh before publishing." }, 409);
    }
    if (Number(configState.draft_version) === Number(configState.published_version)) return json({ error: "There are no unpublished changes to activate." }, 409);
    const expectedImpactToken = await digest(JSON.stringify({
      draftVersion: Number(configState.draft_version),
      publishedVersion: Number(configState.published_version),
      draft: normalizeCentralConfig(configState.draft_payload),
      published: normalizeCentralConfig(configState.published_payload),
    }));
    if (typeof body.impactToken !== "string" || body.impactToken !== expectedImpactToken) {
      return json({ error: "A current change impact report must be reviewed before publishing. Run impact analysis again." }, 409);
    }
    let config: any;
    try { config = normalizeCentralConfig(configState.draft_payload); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Draft validation failed" }, 400); }
    const now = new Date().toISOString();
    const { data: write, error } = await db.from("downtime_central_config_state").update({
      published_payload: config, published_version: configState.draft_version,
      published_by: actor, published_at: now,
    }).eq("id", 1).eq("draft_version", Number(body.draftVersion)).eq("published_version", Number(body.publishedVersion)).select("id").maybeSingle();
    if (error || !write) return json({ error: "Configuration changed in another session. Refresh before publishing." }, 409);
    await db.from("downtime_central_config_history").update({ published_at: now }).eq("version", Number(configState.draft_version));
    await db.from("downtime_central_audit").insert({ username: actor, action: "central-config-publish", details: { version: Number(configState.draft_version), scope: "central-data-bank", impactReviewed: true, impactDigest: expectedImpactToken } });
    return json({ ok: true, publishedVersion: Number(configState.draft_version), publishedAt: now });
  }

  if (action === "central-config-restore-draft") {
    if (Number(body.draftVersion) !== Number(configState.draft_version) || Number(body.nextVersion) !== Number(configState.next_version)) {
      return json({ error: "Draft changed in another session. Refresh before restoring." }, 409);
    }
    const sourceVersion = Number(body.sourceVersion);
    if (!Number.isSafeInteger(sourceVersion) || sourceVersion < 1) return json({ error: "Select a valid historical version" }, 400);
    const { data: source, error: sourceError } = await db.from("downtime_central_config_history").select("payload").eq("version", sourceVersion).maybeSingle();
    if (sourceError || !source) return json({ error: "Historical configuration version not found" }, 404);
    let config: any;
    try { config = normalizeCentralConfig(source.payload); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Historical configuration is invalid" }, 400); }
    const newVersion = Number(configState.next_version);
    const note = "Restored historical version v" + sourceVersion + " as a new draft";
    const { error: historyError } = await db.from("downtime_central_config_history").insert({
      version: newVersion, payload: config, parent_version: sourceVersion,
      action: "restore-draft", actor, note,
    });
    if (historyError) return json({ error: "Unable to create restored draft" }, 409);
    const { data: write, error } = await db.from("downtime_central_config_state").update({
      draft_payload: config, draft_version: newVersion, next_version: newVersion + 1,
      updated_by: actor, updated_at: new Date().toISOString(),
    }).eq("id", 1).eq("draft_version", Number(body.draftVersion)).eq("next_version", Number(body.nextVersion)).select("id").maybeSingle();
    if (error || !write) {
      await db.from("downtime_central_config_history").delete().eq("version", newVersion);
      return json({ error: "Draft changed in another session. Refresh before restoring." }, 409);
    }
    await db.from("downtime_central_audit").insert({ username: actor, action: "central-config-restore-draft", details: { sourceVersion, newVersion, scope: "central-data-bank" } });
    return json({ ok: true, draftVersion: newVersion, nextVersion: newVersion + 1, sourceVersion });
  }
  return json({ error: "Unsupported configuration action" }, 400);
});
