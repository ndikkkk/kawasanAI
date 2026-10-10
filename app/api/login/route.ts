import { NextResponse } from "next/server";
import { authConfigured, issueSession, sameOrigin, SESSION_COOKIE, SESSION_SECONDS } from "../../../lib/auth";
import { allowLogin } from "../../../lib/login-limit";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origin ditolak." }, { status: 403 });
  if (!authConfigured()) {
    return NextResponse.json({ error: "Login belum dikonfigurasi. Isi ACCESS_CODE dan SESSION_SECRET (minimal 32 karakter), lalu redeploy." }, { status: 503 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowLogin(ip)) return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." }, { status: 429 });
  const text = await request.text();
  if (text.length > 4096) return NextResponse.json({ error: "Request terlalu besar." }, { status: 413 });
  let code: unknown;
  try { code = JSON.parse(text)?.code; } catch { code = null; }
  const token = issueSession(code);
  if (!token) return NextResponse.json({ error: "Kode akses salah. Silakan coba lagi." }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return response;
}