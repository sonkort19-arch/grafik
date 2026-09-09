export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method Not Allowed");
  }
  const token = String(process.env.OPENAI_APPS_CHALLENGE || "").trim();
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  if (!token) return res.status(404).send("Challenge not configured");
  return res.status(200).send(token);
}
