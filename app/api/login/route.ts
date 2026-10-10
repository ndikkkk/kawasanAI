import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { code } = await request.json().catch(() => ({ code: "" }));
  if (!process.env.ACCESS_CODE || code !== process.env.ACCESS_CODE) {
    return NextResponse.json({ error: "Invalid access code" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("chat_session", "authenticated", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}