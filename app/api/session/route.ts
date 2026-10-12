import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { renewSession, sameOrigin, SESSION_COOKIE, SESSION_SECONDS } from "../../../lib/auth";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origin ditolak." }, { status: 403 });
  const token = renewSession(cookies().get(SESSION_COOKIE)?.value);
  if (!token) return NextResponse.json({ error: "Session berakhir. Silakan login kembali." }, { status: 401 });
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: SESSION_SECONDS,
  });
  return response;
}