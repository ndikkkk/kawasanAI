import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, sameOrigin, verifySession } from "../../../lib/auth";
import { HISTORY_BYTES, validConversations, validRevision } from "../../../lib/shared-history";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function authorize(request: Request, mutation = false) {
  if (!verifySession(cookies().get(SESSION_COOKIE)?.value)) return json({ error: "Session berakhir. Silakan login kembali." }, 401);
  if (mutation && !sameOrigin(request)) return json({ error: "Origin ditolak." }, 403);
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return json({ error: "Database belum dikonfigurasi. Isi SUPABASE_URL dan SUPABASE_SECRET_KEY di Vercel, jalankan SQL, lalu redeploy." }, 503);
  return null;
}

async function database(method: string, revision?: string, conversations?: unknown) {
  const url = `${process.env.SUPABASE_URL!.replace(/\/+$/, "")}/rest/v1/kawasan_history?id=eq.shared${revision ? `&revision=eq.${revision}` : ""}&select=revision,conversations`;
  return fetch(url, {
    method, cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: { apikey: process.env.SUPABASE_SECRET_KEY!, "Content-Type": "application/json", Prefer: "return=representation" },
    ...(method === "PATCH" ? { body: JSON.stringify({ conversations, revision: randomUUID() }) } : {}),
  });
}

export async function GET(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  try {
    const response = await database("GET");
    if (!response.ok) throw new Error();
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length !== 1 || !validRevision(rows[0].revision) || !validConversations(rows[0].conversations)) throw new Error();
    return json(rows[0]);
  } catch { return json({ error: "Riwayat bersama belum dapat dibaca. Periksa koneksi, secret key, dan SQL Supabase." }, 503); }
}

export async function PUT(request: Request) {
  const denied = authorize(request, true);
  if (denied) return denied;
  // Bound bytes while reading, not only after allocating an arbitrarily large body.
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Data tidak valid." }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  let body;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > HISTORY_BYTES) {
        await reader.cancel();
        return json({ error: "Riwayat bersama maksimal 3 MB. Ekspor cadangan lalu kurangi percakapan atau lampiran." }, 413);
      }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return json({ error: "JSON tidak valid." }, 400); }
  if (!validRevision(body?.revision) || !validConversations(body?.conversations)) return json({ error: "Riwayat tidak valid. Maksimal 100 percakapan, masing-masing 200 pesan; judul maksimal 70 karakter." }, 400);
  try {
    const response = await database("PATCH", body.revision, body.conversations);
    if (!response.ok) throw new Error();
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error();
    if (rows.length === 0) return json({ error: "Riwayat berubah di perangkat lain. Ekspor perubahan lokal jika diperlukan, lalu muat ulang riwayat bersama." }, 409);
    if (rows.length !== 1 || !validRevision(rows[0].revision)) throw new Error();
    return json({ revision: rows[0].revision });
  } catch { return json({ error: "Gagal menyimpan riwayat bersama. Perubahan masih ada di layar; coba simpan lagi atau ekspor sebelum keluar." }, 503); }
}