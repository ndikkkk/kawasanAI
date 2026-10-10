import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AVAILABLE_MODELS, isAvailableModel } from "../../../lib/models";

type Message = { role: "user" | "assistant" | "system"; content: string };

export async function POST(request: Request) {
  if (cookies().get("chat_session")?.value !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { messages?: Message[]; model?: unknown } | null;
  if (!body?.messages?.length || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "Pesan tidak valid." }, { status: 400 });
  }
  if (!process.env.TOKEN_GATEWAY_BASE_URL || !process.env.TOKEN_GATEWAY_API_KEY) {
    return NextResponse.json({ error: "Konfigurasi TokenGateway belum lengkap di environment Vercel." }, { status: 500 });
  }
  const model = isAvailableModel(body.model)
    ? body.model
    : (isAvailableModel(process.env.TOKEN_GATEWAY_MODEL) ? process.env.TOKEN_GATEWAY_MODEL : AVAILABLE_MODELS[0]);

  const baseUrl = process.env.TOKEN_GATEWAY_BASE_URL.replace(/\/$/, "");
  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TOKEN_GATEWAY_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [
        ...(process.env.SYSTEM_PROMPT ? [{ role: "system" as const, content: process.env.SYSTEM_PROMPT }] : []),
        ...body.messages,
      ],
      temperature: 0.7,
      stream: false,
    }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const message = data?.error?.message || data?.message || "Provider AI mengembalikan error.";
    return NextResponse.json({ error: message }, { status: upstream.status });
  }
  return NextResponse.json({ content: data?.choices?.[0]?.message?.content || "Tidak ada respons dari model." });
}