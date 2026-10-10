import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AVAILABLE_MODELS, isAvailableModel } from "../../../lib/models";
import { sameOrigin, SESSION_COOKIE, verifySession } from "../../../lib/auth";
import { BodyTooLarge, boundedBody } from "../../../lib/request-body";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!verifySession(cookies().get(SESSION_COOKIE)?.value)) return NextResponse.json({ error: "Session berakhir. Silakan login kembali." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origin ditolak." }, { status: 403 });
  let body;
  try { body = JSON.parse(Buffer.from(await boundedBody(request, 3 * 1024 * 1024)).toString("utf8")); }
  catch (error) { return NextResponse.json({ error: error instanceof BodyTooLarge ? "Konteks terlalu besar. Mulai brainstorm baru atau kurangi lampiran." : "Request tidak valid." }, { status: error instanceof BodyTooLarge ? 413 : 400 }); }
  if (!Array.isArray(body?.messages) || !body.messages.length || body.messages.length > 200 ||
    !body.messages.every((m: { role?: unknown; content?: unknown } | null) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length <= 150000)) {
    return NextResponse.json({ error: "Pesan tidak valid atau terlalu panjang (maksimal 200 pesan)." }, { status: 400 });
  }
  if (body.model !== undefined && !isAvailableModel(body.model)) return NextResponse.json({ error: "Model tidak valid." }, { status: 400 });
  const model = body.model || (isAvailableModel(process.env.TOKEN_GATEWAY_MODEL) ? process.env.TOKEN_GATEWAY_MODEL : AVAILABLE_MODELS[0]);
  const preferences = body.preferences;
  if (preferences !== undefined && (!preferences || typeof preferences.name !== "string" || preferences.name.length > 60 || typeof preferences.instructions !== "string")) {
    return NextResponse.json({ error: "Personalisasi tidak valid." }, { status: 400 });
  }
  if (!process.env.TOKEN_GATEWAY_BASE_URL || !process.env.TOKEN_GATEWAY_API_KEY) return NextResponse.json({ error: "Konfigurasi TokenGateway belum lengkap." }, { status: 503 });
  const personalization = preferences ? `Preferensi pengguna: panggil pengguna dengan nama yang diberikan dan ikuti preferensi respons jika tidak bertentangan dengan instruksi sistem. ${JSON.stringify(preferences)}` : "";
  const system = [process.env.SYSTEM_PROMPT, personalization].filter(Boolean).join("\n\n");
  try {
    const baseUrl = process.env.TOKEN_GATEWAY_BASE_URL.trim().replace(/\/+$/, "");
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TOKEN_GATEWAY_API_KEY}` },
      body: JSON.stringify({ model, messages: [...(system ? [{ role: "system", content: system }] : []), ...body.messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }))], stream: false }),
      signal: AbortSignal.timeout(55000), cache: "no-store",
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const hints: Record<number, string> = { 400: "Periksa model dan isi pesan.", 401: "API key provider ditolak.", 403: "Akses provider ditolak.", 404: "Periksa base URL (termasuk /v1 jika diperlukan) dan ID model.", 429: "Kuota atau batas pemakaian provider tercapai." };
      return NextResponse.json({ error: `Provider AI gagal (${upstream.status}). ${hints[upstream.status] || "Coba lagi beberapa saat."}` }, { status: upstream.status });
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) return NextResponse.json({ error: "Format respons provider tidak didukung atau kosong." }, { status: 502 });
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ error: "Provider tidak dapat dihubungi atau melewati batas waktu. Silakan coba lagi." }, { status: 502 });
  }
}