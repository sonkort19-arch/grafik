const UPSTREAM_MCP = "https://yedzfmibceboncrytbqz.supabase.co/functions/v1/ma-grafik-mcp";
const PUBLIC_MCP_URL = "https://grafik-umber.vercel.app/mcp";
const PUBLIC_METADATA_URL = "https://grafik-umber.vercel.app/.well-known/oauth-protected-resource";

const OAUTH_SCHEME = { type: "oauth2", scopes: ["openid", "email"] };

function copyRequestHeaders(req) {
  const headers = new Headers();
  for (const name of ["authorization", "content-type", "mcp-protocol-version", "mcp-session-id", "accept"]) {
    const value = req.headers[name];
    if (value) headers.set(name, Array.isArray(value) ? value[0] : value);
  }
  return headers;
}

function rewriteToolMetadata(payload) {
  const tools = payload?.result?.tools;
  if (!Array.isArray(tools)) return payload;
  payload.result.tools = tools.map((tool) => ({
    ...tool,
    securitySchemes: [OAUTH_SCHEME]
  }));
  return payload;
}

function rewriteAuthenticate(value) {
  if (!value) return value;
  return String(value).replace(
    /https:\/\/yedzfmibceboncrytbqz\.supabase\.co\/functions\/v1\/ma-grafik-mcp\/\.well-known\/oauth-protected-resource/g,
    PUBLIC_METADATA_URL
  );
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, mcp-protocol-version, mcp-session-id");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    return res.status(204).end();
  }

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const headers = copyRequestHeaders(req);
    const options = { method: req.method, headers };
    if (req.method === "POST") {
      options.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    }

    const upstream = await fetch(UPSTREAM_MCP, options);
    const text = await upstream.text();
    let output = text;

    const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";
    if (text && contentType.includes("application/json")) {
      try {
        const parsed = rewriteToolMetadata(JSON.parse(text));
        if (parsed?.resource && String(parsed.resource).includes("supabase.co")) parsed.resource = PUBLIC_MCP_URL;
        output = JSON.stringify(parsed);
      } catch (_) {}
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    const protocol = upstream.headers.get("mcp-protocol-version");
    if (protocol) res.setHeader("MCP-Protocol-Version", protocol);
    const session = upstream.headers.get("mcp-session-id");
    if (session) res.setHeader("MCP-Session-Id", session);
    const authenticate = rewriteAuthenticate(upstream.headers.get("www-authenticate"));
    if (authenticate) res.setHeader("WWW-Authenticate", authenticate);

    if (upstream.status === 204) return res.status(204).end();
    return res.status(upstream.status).send(output);
  } catch (error) {
    console.error("MA Grafik MCP proxy", error);
    return res.status(502).json({ ok: false, error: "MCP upstream unavailable" });
  }
}
