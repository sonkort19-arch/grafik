const PUBLIC_MCP_URL = "https://grafik-umber.vercel.app/mcp";
const AUTH_SERVER = "https://yedzfmibceboncrytbqz.supabase.co/auth/v1";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    resource: PUBLIC_MCP_URL,
    authorization_servers: [AUTH_SERVER],
    scopes_supported: ["openid", "email"],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://grafik-umber.vercel.app/plugin/"
  });
}
