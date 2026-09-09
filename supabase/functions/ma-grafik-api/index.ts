import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const TZ = "Europe/Moscow";
const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") || "bul782@mail.ru").toLowerCase();
const MASTER_ROSTER_FROM = "2026-08-24";
const MANAGER_ROSTER_FROM = "2026-09-07";
const REMOVED_MASTER_NAME = "Ислам";
const REMOVED_MANAGER_NAME = "Сергей";
const MAX_RANGE_DAYS = 62;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function dateFromKey(key) {
  if (!isDateKey(key)) throw new Error("Дата должна быть в формате YYYY-MM-DD");
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) throw new Error("Некорректная дата");
  return dt;
}

function dateKeyFromDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const o = {};
  for (const part of parts) if (part.type !== "literal") o[part.type] = part.value;
  return `${o.year}-${o.month}-${o.day}`;
}

function addDays(key, days) {
  const dt = dateFromKey(key);
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return dateKeyFromDate(dt);
}

function diffDays(fromKey, toKey) {
  return Math.floor((dateFromKey(toKey).getTime() - dateFromKey(fromKey).getTime()) / 86400000);
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function serviceKeyForName(name, settings) {
  return name === settings.service1 ? "s1" : name === settings.service2 ? "s2" : "";
}

function serviceNameForKey(key, settings) {
  return key === "s1" ? settings.service1 : key === "s2" ? settings.service2 : "";
}

function normalizeSettings(raw) {
  const merged = {
    anchorDate: "2026-09-01",
    individualScheduleFrom: "2026-09-01",
    serviceBlockDays: 15,
    balancedRosterEnabled: true,
    balancedRosterFrom: "2026-08-01",
    service1: "Моба",
    service2: "Нова",
    shiftStart: "08:00",
    shiftEnd: "22:00",
    novaShiftStart: "09:00",
    novaShiftEnd: "19:00",
    managers: [["Сергей", "Арсен"], ["Дина", "Амалия"]],
    masters: [["Олег", "Георгий"], ["Асик", ""]],
    staffChanges: [],
    dayOverrides: [],
    employeeSchedules: [],
    ...(raw || {}),
  };

  merged.serviceBlockDays = 15;
  merged.balancedRosterEnabled = merged.balancedRosterEnabled !== false;
  merged.balancedRosterFrom = isDateKey(merged.balancedRosterFrom)
    ? String(merged.balancedRosterFrom)
    : "2026-08-01";
  merged.anchorDate = isDateKey(merged.anchorDate) ? String(merged.anchorDate) : "2026-09-01";
  merged.individualScheduleFrom = isDateKey(merged.individualScheduleFrom)
    ? String(merged.individualScheduleFrom)
    : merged.anchorDate;

  if (!Array.isArray(merged.employeeSchedules) || !merged.employeeSchedules.length) {
    throw new Error("В MA График отсутствует employeeSchedules");
  }

  merged.employeeSchedules = merged.employeeSchedules
    .filter((x) => x && x.name && ["manager", "master"].includes(x.role))
    .filter((x) => !(x.role === "master" && String(x.name) === REMOVED_MASTER_NAME))
    .map((x, i) => ({
      id: String(x.id || `employee-${i}`),
      name: String(x.name) === "Аслан" ? "Асик" : String(x.name),
      role: x.role === "master" ? "master" : "manager",
      group: Number(x.group) === 1 ? 1 : 0,
      slot: Number(x.slot) === 1 ? 1 : 0,
      workDays: Math.max(1, Math.min(14, Number(x.workDays) || 2)),
      offDays: Math.max(1, Math.min(14, Number(x.offDays) || 2)),
      cycleStart: isDateKey(x.cycleStart) ? String(x.cycleStart) : merged.anchorDate,
      employmentStart: isDateKey(x.employmentStart)
        ? String(x.employmentStart)
        : merged.individualScheduleFrom,
      isExtra: x.isExtra === true,
      scheduleChanges: (Array.isArray(x.scheduleChanges) ? x.scheduleChanges : [])
        .filter((c) => c && isDateKey(c.from))
        .map((c) => ({
          from: String(c.from),
          workDays: Math.max(1, Math.min(14, Number(c.workDays) || 2)),
          offDays: Math.max(1, Math.min(14, Number(c.offDays) || 2)),
          cycleStart: isDateKey(c.cycleStart) ? String(c.cycleStart) : String(c.from),
        }))
        .sort((a, b) => a.from.localeCompare(b.from)),
    }));

  merged.staffChanges = (Array.isArray(merged.staffChanges) ? merged.staffChanges : [])
    .filter((x) => x && isDateKey(x.date) && x.oldName)
    .map((x) => {
      const rawNew = String(x.newName || "").trim();
      const isLeft = x.type === "left" || /^(сотрудник\s+)?уш[её]л$/i.test(rawNew) || /уволил(ся|ась)$/i.test(rawNew);
      return {
        date: String(x.date),
        oldName: String(x.oldName) === "Аслан" ? "Асик" : String(x.oldName),
        newName: isLeft ? "" : (rawNew === "Аслан" ? "Асик" : rawNew),
        type: isLeft ? "left" : "replace",
      };
    })
    .filter((x) => x.type === "left" || x.newName)
    .sort((a, b) => a.date.localeCompare(b.date));

  merged.dayOverrides = (Array.isArray(merged.dayOverrides) ? merged.dayOverrides : [])
    .filter((x) => x && isDateKey(x.date) && (x.service || x.serviceKey) && x.manager && x.master)
    .filter((x) => String(x.date) < MASTER_ROSTER_FROM || (String(x.master) !== REMOVED_MASTER_NAME && String(x.replacedName || "") !== REMOVED_MASTER_NAME))
    .map((x) => {
      const serviceKey = ["s1", "s2"].includes(x.serviceKey)
        ? x.serviceKey
        : serviceKeyForName(String(x.service || ""), merged);
      return {
        date: String(x.date),
        serviceKey,
        service: serviceNameForKey(serviceKey, merged) || String(x.service || ""),
        manager: String(x.manager) === "Аслан" ? "Асик" : String(x.manager),
        master: String(x.master) === "Аслан" ? "Асик" : String(x.master),
      };
    });

  return merged;
}

function globalDayIndex(settings, date) {
  return diffDays(settings.anchorDate, dateKeyFromDate(date));
}

function employeeCycleForDate(settings, employee, date) {
  const key = dateKeyFromDate(date);
  const changes = (employee.scheduleChanges || [])
    .filter((c) => c.from <= key)
    .slice()
    .sort((a, b) => a.from.localeCompare(b.from));
  const current = changes.length ? changes[changes.length - 1] : null;
  return {
    workDays: Math.max(1, Number(current?.workDays ?? employee.workDays) || 2),
    offDays: Math.max(1, Number(current?.offDays ?? employee.offDays) || 2),
    cycleStart: current?.cycleStart || employee.cycleStart || settings.anchorDate,
  };
}

function employeeWorksOnDate(settings, employee, date) {
  const key = dateKeyFromDate(date);
  const employmentStart = employee.employmentStart || settings.individualScheduleFrom || settings.anchorDate;
  if (key < employmentStart && employee.isExtra === true) return false;
  const cycle = employeeCycleForDate(settings, employee, date);
  const phase = mod(diffDays(cycle.cycleStart, key), cycle.workDays + cycle.offDays);
  return phase < cycle.workDays;
}

function employeesForDate(settings, date) {
  const list = (settings.employeeSchedules || []).map((x) => ({ ...x }));
  const key = dateKeyFromDate(date);
  const changes = (settings.staffChanges || [])
    .filter((x) => x.date <= key)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const ch of changes) {
    for (const emp of list) {
      if (emp.name !== ch.oldName) continue;
      if (ch.type === "left") emp.inactive = true;
      else if (ch.newName) {
        emp.name = ch.newName;
        emp.inactive = false;
      }
    }
  }

  if (key >= MANAGER_ROSTER_FROM) {
    for (const emp of list) {
      if (emp.role === "manager" && emp.name === REMOVED_MANAGER_NAME) emp.inactive = true;
    }
  }
  return list;
}

function employeeServiceForDate(settings, employee, date) {
  const days = globalDayIndex(settings, date);
  const blockDays = Math.max(1, Number(settings.serviceBlockDays) || 14);
  const block = Math.floor(days / blockDays);
  const flip = mod(block, 2);
  const group = Number(employee.group) === 1 ? 1 : 0;
  const serviceIndex = group === 0 ? flip : 1 - flip;
  return serviceIndex === 0 ? settings.service1 : settings.service2;
}

function legacyTeamsForDate(settings, date) {
  const visible = employeesForDate(settings, date).filter((x) => x.isExtra !== true);
  function pair(role, group) {
    const items = visible
      .filter((x) => x.role === role && Number(x.group) === group)
      .sort((a, b) => (Number(a.slot) || 0) - (Number(b.slot) || 0));
    return [0, 1].map((slot) => {
      const emp = items.find((x) => (Number(x.slot) || 0) === slot) || items[slot];
      return emp && !emp.inactive ? emp.name : null;
    });
  }
  return {
    managers: [pair("manager", 0), pair("manager", 1)],
    masters: [pair("master", 0), pair("master", 1)],
  };
}

function legacyBaseScheduleForDate(settings, date) {
  const days = globalDayIndex(settings, date);
  const key = dateKeyFromDate(date);
  const blockDays = Math.max(1, Number(settings.serviceBlockDays) || 14);
  const block = Math.floor(days / blockDays);
  const flip = mod(block, 2);
  const partnerCycle = mod(Math.floor(block / 2), 2);
  const masterFlip = partnerCycle ? 2 : 0;
  const teams = legacyTeamsForDate(settings, date);
  const visible = employeesForDate(settings, date);

  function activeName(pair, offset) {
    const phase = mod(days + offset, 4);
    return pair[phase < 2 ? 0 : 1] || "Не назначен";
  }

  const selected = {
    manager: { 0: activeName(teams.managers[0], 0), 1: activeName(teams.managers[1], 2) },
    master: { 0: activeName(teams.masters[0], masterFlip), 1: activeName(teams.masters[1], 2 + masterFlip) },
  };

  function hasModernCycle(emp) {
    return (emp.scheduleChanges || []).some((c) => c.from <= key);
  }

  function namesFor(role, group, service) {
    const names = [];
    visible
      .filter((emp) => emp.isExtra !== true && !emp.inactive && emp.role === role && Number(emp.group) === group)
      .forEach((emp) => {
        const works = hasModernCycle(emp) ? employeeWorksOnDate(settings, emp, date) : emp.name === selected[role][group];
        if (works) names.push(emp.name);
      });
    visible
      .filter((emp) => emp.isExtra === true && !emp.inactive && emp.role === role && (!emp.employmentStart || emp.employmentStart <= key) && employeeServiceForDate(settings, emp, date) === service && employeeWorksOnDate(settings, emp, date))
      .forEach((emp) => names.push(emp.name));
    return [...new Set(names.filter(Boolean))];
  }

  function pairFor(service, group) {
    const managerNames = namesFor("manager", group, service);
    const masterNames = namesFor("master", group, service);
    return {
      manager: managerNames.length === 1 ? managerNames[0] : (managerNames.length === 0 ? "Не назначен" : `Конфликт: ${managerNames.join(", ")}`),
      master: masterNames.length === 1 ? masterNames[0] : (masterNames.length === 0 ? "Не назначен" : `Конфликт: ${masterNames.join(", ")}`),
      managerNames,
      masterNames,
    };
  }

  const g1 = flip === 0 ? 0 : 1;
  const g2 = flip === 0 ? 1 : 0;
  return { s1: pairFor(settings.service1, g1), s2: pairFor(settings.service2, g2) };
}

function standardBaseScheduleForDate(settings, date) {
  const key = dateKeyFromDate(date);
  if (settings.individualScheduleFrom && key < settings.individualScheduleFrom) {
    return legacyBaseScheduleForDate(settings, date);
  }
  const employees = employeesForDate(settings, date);

  function pairForService(service) {
    const managers = employees.filter((emp) => !emp.inactive && emp.role === "manager" && employeeServiceForDate(settings, emp, date) === service && employeeWorksOnDate(settings, emp, date));
    const masters = employees.filter((emp) => !emp.inactive && emp.role === "master" && employeeServiceForDate(settings, emp, date) === service && employeeWorksOnDate(settings, emp, date));
    const managerNames = managers.map((x) => x.name);
    const masterNames = masters.map((x) => x.name);
    return {
      manager: managers.length === 1 ? managers[0].name : (managers.length === 0 ? "Не назначен" : `Конфликт: ${managerNames.join(", ")}`),
      master: masters.length === 1 ? masters[0].name : (masters.length === 0 ? "Не назначен" : `Конфликт: ${masterNames.join(", ")}`),
      managerNames,
      masterNames,
    };
  }

  return { s1: pairForService(settings.service1), s2: pairForService(settings.service2) };
}

function sameRoster(names, required) {
  const a = [...new Set(names)].sort((x, y) => x.localeCompare(y, "ru"));
  const b = [...required].sort((x, y) => x.localeCompare(y, "ru"));
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function legacyMasterPlanBeforeRemoval(settings, date) {
  const key = dateKeyFromDate(date);
  const from = settings.balancedRosterFrom || "2026-08-01";
  if (key < from || key >= MASTER_ROSTER_FROM) return null;
  const days = diffDays(from, key);
  const phase = mod(days, 4);
  const day = date.getUTCDate();
  const novaMaster = (phase === 0 || phase === 1) ? "Георгий" : "Асик";
  const baseMobaMaster = (phase === 0 || phase === 1) ? "Олег" : "Ислам";
  const swapPairing = day >= 12 && day <= 21;
  const mobaMaster = swapPairing ? (baseMobaMaster === "Олег" ? "Ислам" : "Олег") : baseMobaMaster;
  return { s1: mobaMaster, s2: novaMaster };
}

function fixedMasterPlanForDate(date) {
  const key = dateKeyFromDate(date);
  if (key < MASTER_ROSTER_FROM) return null;
  const temporary = {
    "2026-08-24": { s1: "Асик", s2: "Без мастера" },
    "2026-08-25": { s1: "Георгий", s2: "Асик" },
    "2026-08-26": { s1: "Георгий", s2: "Асик" },
    "2026-08-27": { s1: "Георгий", s2: "Без мастера" },
    "2026-08-28": { s1: "Георгий", s2: "Асик" },
    "2026-08-29": { s1: "Георгий", s2: "Асик" },
    "2026-08-30": { s1: "Асик", s2: "Георгий" },
    "2026-08-31": { s1: "Асик", s2: "Георгий" },
  };
  if (temporary[key]) return temporary[key];

  const days = diffDays(MASTER_ROSTER_FROM, key);
  const week = mod(Math.floor(days / 7), 2);
  const weekday = date.getUTCDay();
  const weekend = weekday === 0 || weekday === 6;
  let mobaMaster = "Олег";
  let novaMaster = "";

  if (week === 0) {
    if (weekend) { mobaMaster = "Георгий"; novaMaster = "Асик"; }
    else novaMaster = (weekday === 1 || weekday === 2) ? "Асик" : "Георгий";
  } else {
    if (weekend) { mobaMaster = "Асик"; novaMaster = "Георгий"; }
    else novaMaster = (weekday === 1 || weekday === 2) ? "Георгий" : "Асик";
  }
  return { s1: mobaMaster, s2: novaMaster };
}

function balancedRosterState(settings, date) {
  if (settings.balancedRosterEnabled === false) return null;
  const key = dateKeyFromDate(date);
  const from = settings.balancedRosterFrom || "2026-08-01";
  if (key < from) return null;

  const active = employeesForDate(settings, date).filter((emp) => !emp.inactive && (!emp.employmentStart || emp.isExtra !== true || emp.employmentStart <= key));
  const managers = [...new Set(active.filter((x) => x.role === "manager").map((x) => x.name))];
  const masters = [...new Set(active.filter((x) => x.role === "master").map((x) => x.name))];

  const managerReady = key < MANAGER_ROSTER_FROM
    ? sameRoster(managers, ["Сергей", "Арсен", "Дина"])
    : sameRoster(managers, ["Арсен", "Дина"]);
  const masterReady = key >= MASTER_ROSTER_FROM && sameRoster(masters, ["Олег", "Георгий", "Асик"]);
  if (!managerReady && !masterReady) return null;

  const days = diffDays(from, key);
  let managerS1 = null, managerS2 = null, managerOff = [];

  if (managerReady) {
    const phase = mod(days, 4);
    const mobaRegularManager = (phase === 0 || phase === 1) ? "Арсен" : "Дина";
    if (key >= MANAGER_ROSTER_FROM) {
      managerS1 = mobaRegularManager;
      managerS2 = null;
      managerOff = ["Арсен", "Дина"].filter((name) => name !== managerS1);
    } else {
      const weekday = date.getUTCDay();
      const swapDay = weekday === 2 || weekday === 4;
      if (swapDay) {
        managerS1 = "Сергей";
        managerS2 = mobaRegularManager;
      } else {
        managerS1 = mobaRegularManager;
        managerS2 = (weekday >= 1 && weekday <= 5) ? "Сергей" : "Без менеджера";
      }
      managerOff = ["Арсен", "Дина", "Сергей"].filter((name) => name !== managerS1 && name !== managerS2);
    }
  }

  let masterS1 = null, masterS2 = null, masterOff = [];
  if (masterReady) {
    const md = fixedMasterPlanForDate(date);
    masterS1 = md.s1;
    masterS2 = md.s2;
    masterOff = ["Олег", "Георгий", "Асик"].filter((n) => n !== masterS1 && n !== masterS2);
  }

  if (managerReady && masterReady && key >= MANAGER_ROSTER_FROM) managerS2 = masterS2;

  return {
    managerReady,
    masterReady,
    manager: { s1: managerS1, s2: managerS2, off: managerOff },
    master: { s1: masterS1, s2: masterS2, off: masterOff },
  };
}

function baseScheduleForDate(settings, date) {
  const base = standardBaseScheduleForDate(settings, date);
  const state = balancedRosterState(settings, date);
  if (!state) return base;

  if (state.managerReady) {
    base.s1.manager = state.manager.s1;
    if (String(state.manager.s2 || "").trim() === "Без менеджера") base.s2.manager = "Без менеджера";
    else base.s2.manager = state.manager.s2;
  }

  const historical = legacyMasterPlanBeforeRemoval(settings, date);
  if (historical) {
    base.s1.master = historical.s1;
    base.s2.master = historical.s2;
  } else if (state.masterReady) {
    base.s1.master = state.master.s1;
    base.s2.master = state.master.s2;
  }

  const key = dateKeyFromDate(date);
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
  if (key < MANAGER_ROSTER_FROM && weekend) base.s2.manager = "Без менеджера";
  return base;
}

function scheduleForKey(settings, key) {
  const date = dateFromKey(key);
  const base = baseScheduleForDate(settings, date);
  const result = {
    date: key,
    services: {
      [settings.service1]: { manager: base.s1.manager, master: base.s1.master },
      [settings.service2]: { manager: base.s2.manager, master: base.s2.master },
    },
  };

  for (const o of (settings.dayOverrides || []).filter((x) => x.date === key)) {
    const service = o.service || serviceNameForKey(o.serviceKey, settings);
    if (service && result.services[service]) {
      result.services[service] = { manager: o.manager, master: o.master };
    }
  }
  return result;
}

function parseRange(url, defaultDays = 0) {
  const from = url.searchParams.get("from") || todayKey();
  const to = url.searchParams.get("to") || addDays(from, defaultDays);
  if (!isDateKey(from) || !isDateKey(to)) throw new Error("from/to должны быть YYYY-MM-DD");
  const span = diffDays(from, to);
  if (span < 0) throw new Error("to не может быть раньше from");
  if (span >= MAX_RANGE_DAYS) throw new Error(`Максимальный период — ${MAX_RANGE_DAYS} дней`);
  return { from, to, span };
}

async function assertAdmin(req) {
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  if ((data.user.email || "").toLowerCase() !== ADMIN_EMAIL) return null;
  return data.user;
}

async function loadSettings() {
  const { data, error } = await admin
    .from("ma_schedule_config")
    .select("settings,updated_at")
    .eq("id", "main")
    .maybeSingle();
  if (error) throw error;
  if (!data?.settings) throw new Error("Общий график не найден");
  return { settings: normalizeSettings(data.settings), updatedAt: data.updated_at || null };
}

async function todayPayload(settings, date) {
  const planned = scheduleForKey(settings, date);
  const { data, error } = await admin
    .from("ma_shifts")
    .select("service,shift_date,expected_manager,expected_master,opened_at,opened_by,closed_at,closed_by,open_late_minutes,early_close_minutes")
    .eq("shift_date", date)
    .is("voided_at", null)
    .order("service", { ascending: true });
  if (error) throw error;
  return { planned, actual: data || [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const marker = "/ma-grafik-api";
  const index = url.pathname.indexOf(marker);
  const route = (index >= 0 ? url.pathname.slice(index + marker.length) : url.pathname).replace(/\/+$/, "") || "/";

  if (req.method !== "GET") return json({ ok: false, error: "Разрешены только GET-запросы" }, 405);

  if (route === "/" || route === "/health") {
    return json({ ok: true, service: "MA Grafik API", version: "1.0.0", mode: "read-only", authRequired: true });
  }

  if (route === "/capabilities") {
    return json({
      ok: true,
      mode: "read-only",
      commands: [
        "get_today",
        "get_schedule",
        "get_employee_schedule",
        "get_employees",
      ],
    });
  }

  const user = await assertAdmin(req);
  if (!user) return json({ ok: false, error: "Требуется вход владельца MA График" }, 401);

  try {
    const { settings, updatedAt } = await loadSettings();

    if (route === "/today") {
      const date = url.searchParams.get("date") || todayKey();
      if (!isDateKey(date)) throw new Error("date должна быть YYYY-MM-DD");
      return json({ ok: true, timezone: TZ, configUpdatedAt: updatedAt, ...(await todayPayload(settings, date)) });
    }

    if (route === "/schedule") {
      const { from, to, span } = parseRange(url, 6);
      const days = [];
      for (let i = 0; i <= span; i++) days.push(scheduleForKey(settings, addDays(from, i)));
      return json({ ok: true, timezone: TZ, configUpdatedAt: updatedAt, from, to, days });
    }

    if (route === "/employee") {
      const name = String(url.searchParams.get("name") || "").trim();
      if (!name) throw new Error("Укажи name сотрудника");
      const { from, to, span } = parseRange(url, 30);
      const days = [];
      let known = false;
      for (let i = 0; i <= span; i++) {
        const date = addDays(from, i);
        const employees = employeesForDate(settings, date);
        if (employees.some((x) => !x.inactive && x.name.toLowerCase() === name.toLowerCase())) known = true;
        const schedule = scheduleForKey(settings, date);
        let assignment = null;
        for (const [service, pair] of Object.entries(schedule.services)) {
          if (String(pair.manager).toLowerCase() === name.toLowerCase()) assignment = { service, role: "manager", partner: pair.master };
          if (String(pair.master).toLowerCase() === name.toLowerCase()) assignment = { service, role: pair.manager === pair.master ? "responsible" : "master", partner: pair.manager };
        }
        days.push({ date, assignment, off: !assignment });
      }
      if (!known) return json({ ok: false, error: "Сотрудник не найден" }, 404);
      return json({ ok: true, timezone: TZ, configUpdatedAt: updatedAt, employee: name, from, to, days });
    }

    if (route === "/employees") {
      const date = url.searchParams.get("date") || todayKey();
      if (!isDateKey(date)) throw new Error("date должна быть YYYY-MM-DD");
      const schedule = scheduleForKey(settings, date);
      const employees = employeesForDate(settings, date)
        .filter((x) => !x.inactive)
        .map((x) => {
          let assignment = null;
          for (const [service, pair] of Object.entries(schedule.services)) {
            if (pair.manager === x.name) assignment = { service, role: "manager" };
            if (pair.master === x.name) assignment = { service, role: pair.manager === pair.master ? "responsible" : "master" };
          }
          return { name: x.name, role: x.role, assignment, off: !assignment };
        });
      return json({ ok: true, timezone: TZ, configUpdatedAt: updatedAt, date, employees });
    }

    return json({ ok: false, error: "Неизвестный маршрут" }, 404);
  } catch (e) {
    console.error("MA Grafik API", e);
    return json({ ok: false, error: e?.message || "Ошибка API" }, 400);
  }
});
