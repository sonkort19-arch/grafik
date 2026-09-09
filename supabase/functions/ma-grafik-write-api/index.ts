import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const TZ = "Europe/Moscow";
const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") || "bul782@mail.ru").toLowerCase();
const MASTER_ROSTER_FROM = "2026-08-24";
const MANAGER_ROSTER_FROM = "2026-09-07";
const REMOVED_MASTER_NAME = "Ислам";
const REMOVED_MANAGER_NAME = "Сергей";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

function envSecretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return keys.default || Object.values(keys)[0] || "";
  } catch (_) {
    return "";
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = envSecretKey();
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function isDateKey(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function validDateKey(value: unknown) {
  const key = String(value || "");
  if (!isDateKey(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function normalizedName(value: unknown) {
  const name = String(value || "").trim();
  return name === "Аслан" ? "Асик" : name;
}

function sameName(a: unknown, b: unknown) {
  return normalizedName(a).toLocaleLowerCase("ru") === normalizedName(b).toLocaleLowerCase("ru");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

async function assertAdmin(req: Request) {
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  if ((data.user.email || "").toLowerCase() !== ADMIN_EMAIL) return null;
  return data.user;
}

async function loadRawConfig() {
  const { data, error } = await admin
    .from("ma_schedule_config")
    .select("settings,updated_at")
    .eq("id", "main")
    .maybeSingle();
  if (error) throw error;
  if (!data?.settings) throw new Error("Общий график не найден");
  return { raw: clone(data.settings), updatedAt: String(data.updated_at || "") };
}

function serviceInfo(raw: any, requested: unknown) {
  const service1 = String(raw?.service1 || "Моба");
  const service2 = String(raw?.service2 || "Нова");
  const value = String(requested || "").trim();
  if (value === "s1" || sameName(value, service1)) return { key: "s1", name: service1 };
  if (value === "s2" || sameName(value, service2)) return { key: "s2", name: service2 };
  throw new Error(`Неизвестная точка. Доступно: ${service1}, ${service2}`);
}

function activeEmployeesForDate(raw: any, date: string) {
  const list = (Array.isArray(raw?.employeeSchedules) ? raw.employeeSchedules : [])
    .filter((x: any) => x && x.name && ["manager", "master"].includes(String(x.role)))
    .map((x: any) => ({
      name: normalizedName(x.name),
      role: x.role === "master" ? "master" : "manager",
      inactive: false,
    }));

  const changes = (Array.isArray(raw?.staffChanges) ? raw.staffChanges : [])
    .filter((x: any) => x && validDateKey(x.date) && String(x.date) <= date && x.oldName)
    .slice()
    .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));

  for (const change of changes) {
    for (const employee of list) {
      if (!sameName(employee.name, change.oldName)) continue;
      const replacement = normalizedName(change.newName);
      const left = change.type === "left" || !replacement || /^(сотрудник\s+)?уш[её]л$/i.test(replacement) || /уволил(ся|ась)$/i.test(replacement);
      if (left) employee.inactive = true;
      else {
        employee.name = replacement;
        employee.inactive = false;
      }
    }
  }

  for (const employee of list) {
    if (date >= MASTER_ROSTER_FROM && employee.role === "master" && sameName(employee.name, REMOVED_MASTER_NAME)) employee.inactive = true;
    if (date >= MANAGER_ROSTER_FROM && employee.role === "manager" && sameName(employee.name, REMOVED_MANAGER_NAME)) employee.inactive = true;
  }

  const result: Array<{name: string; role: "manager" | "master"}> = [];
  for (const employee of list) {
    if (employee.inactive) continue;
    if (result.some((x) => x.role === employee.role && sameName(x.name, employee.name))) continue;
    result.push({ name: employee.name, role: employee.role });
  }
  return result;
}

function canonicalEmployeeName(active: Array<{name: string; role: string}>, value: unknown) {
  const found = active.find((x) => sameName(x.name, value));
  return found?.name || normalizedName(value);
}

function validateTargetPair(raw: any, date: string, service: {key: string; name: string}, target: any) {
  const managerRaw = normalizedName(target?.manager);
  const masterRaw = normalizedName(target?.master);
  if (!managerRaw || !masterRaw) throw new Error("Нужно передать manager и master");

  const active = activeEmployeesForDate(raw, date);
  const manager = managerRaw === "Без менеджера" ? managerRaw : canonicalEmployeeName(active, managerRaw);
  const master = masterRaw === "Без мастера" ? masterRaw : canonicalEmployeeName(active, masterRaw);

  if (manager !== "Без менеджера") {
    const employee = active.find((x) => sameName(x.name, manager));
    if (!employee) throw new Error(`Сотрудник «${manager}» не найден в действующем составе на ${date}`);
    const responsibleMaster = service.key === "s2" && sameName(manager, master) && employee.role === "master";
    if (employee.role !== "manager" && !responsibleMaster) {
      throw new Error(`«${manager}» не является действующим менеджером`);
    }
  }

  if (master !== "Без мастера") {
    const employee = active.find((x) => sameName(x.name, master));
    if (!employee) throw new Error(`Сотрудник «${master}» не найден в действующем составе на ${date}`);
    if (employee.role !== "master") throw new Error(`«${master}» не является действующим мастером`);
  }

  if (service.key === "s2" && date >= MANAGER_ROSTER_FROM && manager !== "Без менеджера") {
    const managerEmployee = active.find((x) => sameName(x.name, manager));
    if (managerEmployee?.role === "master" && !sameName(manager, master)) {
      throw new Error("В Нове мастер может быть ответственным только если manager и master совпадают");
    }
  }

  return { manager, master };
}

function cleanExpectedPair(value: any) {
  const manager = normalizedName(value?.manager);
  const master = normalizedName(value?.master);
  if (!manager || !master) throw new Error("Передай expectedCurrent.manager и expectedCurrent.master из read-API");
  return { manager, master };
}

function overrideMatches(raw: any, row: any, date: string, service: {key: string; name: string}) {
  if (!row || String(row.date || "") !== date) return false;
  if (String(row.serviceKey || "") === service.key) return true;
  return sameName(row.service, service.name);
}

function changedRole(before: any, after: any) {
  const managerChanged = !sameName(before.manager, after.manager);
  const masterChanged = !sameName(before.master, after.master);
  if (managerChanged && !masterChanged) return { role: "manager", name: before.manager };
  if (masterChanged && !managerChanged) return { role: "master", name: before.master };
  return { role: "", name: "" };
}

function buildNextSettings(raw: any, date: string, service: {key: string; name: string}, before: any, after: any, reason: string) {
  const next = clone(raw || {});
  const existing = Array.isArray(next.dayOverrides) ? next.dayOverrides : [];
  next.dayOverrides = existing.filter((row: any) => !overrideMatches(next, row, date, service));
  const replaced = changedRole(before, after);
  next.dayOverrides.push({
    id: `chatgpt-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    date,
    serviceKey: service.key,
    service: service.name,
    manager: after.manager,
    master: after.master,
    reason: reason.slice(0, 250),
    replacedRole: replaced.role,
    replacedName: replaced.name,
  });
  next.dayOverrides.sort((a: any, b: any) => String(a.date || "").localeCompare(String(b.date || "")));
  return next;
}

function parseChangeBody(raw: any, body: any, currentUpdatedAt: string) {
  const date = String(body?.date || "");
  if (!validDateKey(date)) throw new Error("date должна быть корректной датой YYYY-MM-DD");
  const expectedUpdatedAt = String(body?.expectedConfigUpdatedAt || "");
  if (!expectedUpdatedAt) throw new Error("Нужен expectedConfigUpdatedAt из read-API");
  if (expectedUpdatedAt !== currentUpdatedAt) {
    const error: any = new Error("График изменился после чтения. Сначала заново получи актуальный график");
    error.status = 409;
    throw error;
  }
  const service = serviceInfo(raw, body?.service);
  const before = cleanExpectedPair(body?.expectedCurrent);
  const after = validateTargetPair(raw, date, service, body?.target);
  const reason = String(body?.reason || "Изменение через ChatGPT").trim() || "Изменение через ChatGPT";
  return { date, service, before, after, reason, expectedUpdatedAt };
}

async function applyChange(user: any, current: {raw: any; updatedAt: string}, change: any) {
  const nextSettings = buildNextSettings(current.raw, change.date, change.service, change.before, change.after, change.reason);
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("ma_schedule_config")
    .update({ settings: nextSettings, updated_at: now })
    .eq("id", "main")
    .eq("updated_at", current.updatedAt)
    .select("updated_at")
    .maybeSingle();

  if (error) throw error;
  if (!data?.updated_at) {
    const conflict: any = new Error("График успел измениться. Изменение не применено");
    conflict.status = 409;
    throw conflict;
  }

  const audit = await admin.from("ma_grafik_api_audit").insert({
    actor_email: user.email || ADMIN_EMAIL,
    action: "apply_change",
    work_date: change.date,
    service: change.service.name,
    before_pair: change.before,
    after_pair: change.after,
    config_before_updated_at: current.updatedAt || null,
    config_after_updated_at: data.updated_at,
    previous_settings: current.raw,
  });

  if (audit.error) {
    console.error("MA Grafik audit insert failed", audit.error);
  }

  return {
    updatedAt: data.updated_at,
    auditStored: !audit.error,
    dayOverride: {
      date: change.date,
      service: change.service.name,
      manager: change.after.manager,
      master: change.after.master,
      reason: change.reason,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const marker = "/ma-grafik-write-api";
  const index = url.pathname.indexOf(marker);
  const route = (index >= 0 ? url.pathname.slice(index + marker.length) : url.pathname).replace(/\/+$/, "") || "/";

  if (req.method === "GET" && (route === "/" || route === "/health")) {
    return json({
      ok: true,
      service: "MA Grafik Write API",
      version: "1.0.0",
      mode: "protected-write",
      authRequired: true,
      writesRequirePreviewVersion: true,
      writesRequireConfirm: true,
    });
  }

  if (req.method === "GET" && route === "/capabilities") {
    return json({
      ok: true,
      commands: ["preview_change", "apply_change"],
      note: "Изменяется только один день через dayOverrides; базовый цикл сотрудников не переписывается.",
    });
  }

  if (req.method !== "POST") return json({ ok: false, error: "Для изменений нужен POST-запрос" }, 405);

  const user = await assertAdmin(req);
  if (!user) return json({ ok: false, error: "Требуется вход владельца MA График" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const current = await loadRawConfig();
    const change = parseChangeBody(current.raw, body, current.updatedAt);

    if (route === "/preview-change") {
      return json({
        ok: true,
        timezone: TZ,
        mode: "preview",
        configUpdatedAt: current.updatedAt,
        date: change.date,
        service: change.service.name,
        before: change.before,
        after: change.after,
        reason: change.reason,
        willChange: !sameName(change.before.manager, change.after.manager) || !sameName(change.before.master, change.after.master),
        requiresConfirm: true,
      });
    }

    if (route === "/apply-change") {
      if (body?.confirm !== true) return json({ ok: false, error: "Изменение не применено: confirm должен быть true" }, 400);
      if (sameName(change.before.manager, change.after.manager) && sameName(change.before.master, change.after.master)) {
        return json({ ok: false, error: "Изменений нет" }, 400);
      }
      const result = await applyChange(user, current, change);
      return json({
        ok: true,
        timezone: TZ,
        applied: true,
        ...result,
      });
    }

    return json({ ok: false, error: "Неизвестный маршрут" }, 404);
  } catch (e: any) {
    console.error("MA Grafik Write API", e);
    return json({ ok: false, error: e?.message || "Ошибка API" }, Number(e?.status) || 400);
  }
});
