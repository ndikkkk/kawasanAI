import { NextResponse } from "next/server";
import { sameOrigin, SESSION_COOKIE } from "../../../lib/auth";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origin ditolak." }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", expires: new Date(0), path: "/" });
  return response;
}