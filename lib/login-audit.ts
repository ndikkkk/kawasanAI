import { isIP } from "node:net";

type Environment = Record<string, string | undefined>;

export function loginMetadata(request: Request, env: Environment = process.env) {
  const vercel = env.VERCEL === "1";
  const trusted = vercel || env.TRUST_PROXY_HEADERS === "true";
  const rawIp = trusted ? request.headers.get(vercel ? "x-vercel-forwarded-for" : "x-forwarded-for")?.split(",")[0]?.trim() : null;
  function geo(name: string) {
    if (!vercel) return null;
    const value = request.headers.get(`x-vercel-ip-${name}`);
    if (!value) return null;
    try { return decodeURIComponent(value).slice(0, 120); } catch { return null; }
  }
  return {
    ip_address: rawIp && isIP(rawIp) ? rawIp : null,
    country: geo("country"), region: geo("country-region"), city: geo("city"),
    location_source: vercel ? "vercel-ip" : "unavailable",
    user_agent: request.headers.get("user-agent")?.slice(0, 512) || null,
  };
}

export async function recordLogin(request: Request, subject: string) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error("Audit database unavailable");
  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/kawasan_login_events`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(10000),
    headers: { apikey: process.env.SUPABASE_SECRET_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ subject, ...loginMetadata(request) }),
  });
  if (!response.ok) throw new Error("Audit database unavailable");
}