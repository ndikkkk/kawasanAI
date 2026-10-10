import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "chat_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
type Environment = Record<string, string | undefined>;
type Session = { subject: string; expires: number; version: string; nonce: string };

function codes(env: Environment) {
  // Keep ACCESS_CODE_2 compatible while existing deployments migrate to one variable.
  return Array.from(new Set([env.ACCESS_CODE, env.ACCESS_CODE_2]
    .flatMap((value) => (value || "").split(","))
    .map((code) => code.trim())
    .filter(Boolean)));
}

function equal(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

export function authConfigured(env: Environment = process.env) {
  return codes(env).length > 0 && (env.SESSION_SECRET?.length ?? 0) >= 32;
}

function sign(value: string, env: Environment) {
  return createHmac("sha256", env.SESSION_SECRET!).update(value).digest("base64url");
}

function identity(code: string, env: Environment) {
  return sign(`user:${code}`, env).slice(0, 32);
}

export function issueSession(code: unknown, env: Environment = process.env, now = Date.now()) {
  if (!authConfigured(env) || typeof code !== "string" || code.length > 1024) return null;
  const match = codes(env).find((candidate) => equal(candidate, code.trim()));
  if (!match) return null;
  const session: Session = {
    subject: identity(match, env), expires: now + SESSION_SECONDS * 1000,
    version: sign(`code:${match}`, env), nonce: randomBytes(16).toString("hex"),
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload, env)}`;
}

export function verifySession(token: string | undefined, env: Environment = process.env, now = Date.now()) {
  if (!authConfigured(env) || !token || token.length > 2048) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 2 || !equal(sign(parts[0], env), parts[1])) return null;
    const session = JSON.parse(Buffer.from(parts[0], "base64url").toString()) as Session;
    if (!Number.isFinite(session.expires) || session.expires <= now || session.expires > now + SESSION_SECONDS * 1000) return null;
    const match = codes(env).find((code) => identity(code, env) === session.subject && sign(`code:${code}`, env) === session.version);
    if (!match) return null;
    return { subject: session.subject };
  } catch { return null; }
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}