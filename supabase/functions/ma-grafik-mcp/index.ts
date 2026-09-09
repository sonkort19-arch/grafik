const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const MCP_URL = `${SUPABASE_URL}/functions/v1/ma-grafik-mcp`;
const READ_API = `${SUPABASE_URL}/functions/v1/ma-grafik-api`;
const WRITE_API = `${SUPABASE_URL}/functions/v1/ma-grafik-write-api`;
const AUTH_SERVER = `${SUPABASE_URL}/auth/v1`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "WWW-Authenticate, MCP-Protocol-Version, MCP-Session-Id",
  "Cache-Control": "no-store",
};

const SUPPORTED_PROTOCOL = "2025-06-18";

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, ...extraHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function rpcResult(id: unknown, result: unknown) {
  return json({ jsonrpc: "2.0", id: id ?? null, result }, 200, {
    "MCP-Protocol-Version": SUPPORTED_PROTOCOL,
  });
}

function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  }, 200, { "MCP-Protocol-Version": SUPPORTED_PROTOCOL });
}

function protectedResourceMetadata() {
  return {
    resource: MCP_URL,
    authorization_servers: [AUTH_SERVER],
    bearer_methods_supported: ["header"],
    scopes_supported: ["email"],
  };
}

function unauthorized() {
  const metadataUrl = `${MCP_URL}/.well-known/oauth-protected-resource`;
  return json({ error: "unauthorized" }, 401, {
    "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl}"`,
  });
}

function bearer(req: Request) {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

async function validateToken(token: string) {
  if (!token) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: publishableKey(),
      },
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

function publishableKey() {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    const selected = keys.default || Object.values(keys)[0];
    if (typeof selected === "string" && selected.startsWith("sb_publishable_")) return selected;
    if (typeof selected === "string") return Deno.env.get(selected) || selected;
  } catch (_) {}
  return "";
}

function query(params: Record<string, unknown>) {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== "") p.set(key, String(value));
  }
  return p.toString();
}

async function callApi(token: string, url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  const apiKey = publishableKey();
  if (apiKey) headers.set("apikey", apiKey);

  const res = await fetch(url, { ...options, headers });
  const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!res.ok || body?.ok === false) {
    const error = new Error(String(body?.error || `HTTP ${res.status}`));
    (error as any).status = res.status;
    throw error;
  }
  return body;
}

const pairSchema = {
  type: "object",
  additionalProperties: false,
  required: ["manager", "master"],
  properties: {
    manager: { type: "string", minLength: 1 },
    master: { type: "string", minLength: 1 },
  },
};

const tools = [
  {
    name: "get_today",
    title: "Получить график на день",
    description: "Возвращает плановый график МА График и фактическое состояние смен за указанную дату. Если дата не указана, используется текущая дата сервиса.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { date: { type: "string", description: "Дата YYYY-MM-DD" } },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_schedule",
    title: "Получить график за период",
    description: "Возвращает плановый график двух точек за ограниченный период. Используй для вопросов о будущих и прошлых сменах.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["from", "to"],
      properties: {
        from: { type: "string", description: "Начальная дата YYYY-MM-DD" },
        to: { type: "string", description: "Конечная дата YYYY-MM-DD" },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_employee_schedule",
    title: "Получить график сотрудника",
    description: "Возвращает рабочие и выходные дни одного сотрудника за указанный период.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["name", "from", "to"],
      properties: {
        name: { type: "string", minLength: 1, description: "Имя сотрудника" },
        from: { type: "string", description: "Начальная дата YYYY-MM-DD" },
        to: { type: "string", description: "Конечная дата YYYY-MM-DD" },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_employees",
    title: "Получить сотрудников",
    description: "Возвращает действующий состав на дату и показывает, кто назначен на смену, а у кого выходной.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { date: { type: "string", description: "Дата YYYY-MM-DD" } },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "preview_schedule_change",
    title: "Предпросмотр замены в графике",
    description: "Проверяет однодневную замену без сохранения. Сначала получи актуальный график через get_today/get_schedule и передай configUpdatedAt и текущую пару. Этот инструмент не меняет данные.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["date", "service", "expectedConfigUpdatedAt", "expectedCurrent", "target"],
      properties: {
        date: { type: "string", description: "Дата YYYY-MM-DD" },
        service: { type: "string", description: "Название точки, например Моба или Нова" },
        expectedConfigUpdatedAt: { type: "string", minLength: 1, description: "configUpdatedAt из последнего чтения" },
        expectedCurrent: pairSchema,
        target: pairSchema,
        reason: { type: "string", maxLength: 250, description: "Короткая причина замены" },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "apply_schedule_change",
    title: "Применить замену в графике",
    description: "Сохраняет только одну однодневную замену через dayOverrides. Используй только после preview_schedule_change и только когда пользователь явно попросил применить изменение. Требует актуальную версию графика и confirm=true.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["date", "service", "expectedConfigUpdatedAt", "expectedCurrent", "target", "confirm"],
      properties: {
        date: { type: "string", description: "Дата YYYY-MM-DD" },
        service: { type: "string", description: "Название точки, например Моба или Нова" },
        expectedConfigUpdatedAt: { type: "string", minLength: 1, description: "configUpdatedAt из последнего чтения/предпросмотра" },
        expectedCurrent: pairSchema,
        target: pairSchema,
        reason: { type: "string", maxLength: 250, description: "Короткая причина замены" },
        confirm: { type: "boolean", const: true, description: "Должно быть true только после подтверждения изменения" },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
];

async function runTool(token: string, toolName: string, args: Record<string, unknown>) {
  switch (toolName) {
    case "get_today": {
      const qs = query({ date: args.date });
      return await callApi(token, `${READ_API}/today${qs ? `?${qs}` : ""}`);
    }
    case "get_schedule": {
      const qs = query({ from: args.from, to: args.to });
      return await callApi(token, `${READ_API}/schedule?${qs}`);
    }
    case "get_employee_schedule": {
      const qs = query({ name: args.name, from: args.from, to: args.to });
      return await callApi(token, `${READ_API}/employee?${qs}`);
    }
    case "get_employees": {
      const qs = query({ date: args.date });
      return await callApi(token, `${READ_API}/employees${qs ? `?${qs}` : ""}`);
    }
    case "preview_schedule_change": {
      return await callApi(token, `${WRITE_API}/preview-change`, {
        method: "POST",
        body: JSON.stringify(args),
      });
    }
    case "apply_schedule_change": {
      return await callApi(token, `${WRITE_API}/apply-change`, {
        method: "POST",
        body: JSON.stringify(args),
      });
    }
    default:
      throw new Error(`Неизвестный инструмент: ${toolName}`);
  }
}

function toolResponse(data: any) {
  return {
    structuredContent: data,
    content: [{ type: "text", text: JSON.stringify(data) }],
    isError: false,
  };
}

function toolError(message: string) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const marker = "/ma-grafik-mcp";
  const index = url.pathname.indexOf(marker);
  const route = (index >= 0 ? url.pathname.slice(index + marker.length) : url.pathname).replace(/\/+$/, "") || "/";

  if (req.method === "GET" && route === "/.well-known/oauth-protected-resource") {
    return json(protectedResourceMetadata());
  }

  if (req.method === "GET" && (route === "/" || route === "/health")) {
    return json({ ok: true, service: "MA Grafik MCP", version: "1.0.0", oauth: true });
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = bearer(req);
  if (!(await validateToken(token))) return unauthorized();

  let message: any;
  try {
    message = await req.json();
  } catch (_) {
    return rpcError(null, -32700, "Parse error");
  }

  const id = message?.id ?? null;
  const method = String(message?.method || "");

  try {
    if (method === "initialize") {
      return rpcResult(id, {
        protocolVersion: SUPPORTED_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "MA Grafik", version: "1.0.0" },
        instructions: "Read the current schedule before any change. Preview every change first. Apply only after explicit user intent/confirmation and only with the same configUpdatedAt version.",
      });
    }

    if (method === "notifications/initialized") return new Response(null, { status: 204, headers: cors });
    if (method === "ping") return rpcResult(id, {});
    if (method === "tools/list") return rpcResult(id, { tools });

    if (method === "tools/call") {
      const toolName = String(message?.params?.name || "");
      const args = (message?.params?.arguments && typeof message.params.arguments === "object")
        ? message.params.arguments
        : {};
      try {
        return rpcResult(id, toolResponse(await runTool(token, toolName, args)));
      } catch (e: any) {
        return rpcResult(id, toolError(String(e?.message || "Ошибка инструмента")));
      }
    }

    return rpcError(id, -32601, "Method not found");
  } catch (e: any) {
    console.error("MA Grafik MCP", e);
    return rpcError(id, -32603, "Internal error");
  }
});
