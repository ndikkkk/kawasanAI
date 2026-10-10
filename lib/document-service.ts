import { createHmac, timingSafeEqual } from "node:crypto";
import { validateExtractedText } from "./document-text";

type Environment = Record<string, string | undefined>;
const API = "/documentintelligence/documentModels/prebuilt-read";
const VERSION = "api-version=2024-11-30";
const starts = new Map<string, { count: number; expires: number }>();
export class DocumentError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

// Best-effort per process; production also needs a distributed limit and budget.
export function limitDocumentStarts(subject: string, now = Date.now()) {
  starts.forEach((value, key) => { if (value.expires <= now) starts.delete(key); });
  const current = starts.get(subject) || { count: 0, expires: now + 10 * 60 * 1000 };
  if (current.count >= 5) throw new DocumentError("Maksimal 5 upload dokumen per kode dalam 10 menit. Tunggu sebelum mencoba lagi.", 429);
  current.count++;
  starts.set(subject, current);
}

function configuration(env: Environment) {
  try {
    const endpoint = new URL(env.DOCUMENT_INTELLIGENCE_ENDPOINT || "");
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/" || !env.DOCUMENT_INTELLIGENCE_KEY || env.DOCUMENT_INTELLIGENCE_TIER !== "S0" || (env.SESSION_SECRET?.length ?? 0) < 32) throw new Error();
    return { endpoint: endpoint.origin, key: env.DOCUMENT_INTELLIGENCE_KEY };
  } catch { throw new DocumentError("Pembaca PDF/DOCX dan OCR belum dikonfigurasi. Admin perlu mengisi endpoint, key, dan tier S0 Azure Document Intelligence. File teks tetap dapat dibaca.", 503); }
}

function signature(payload: string, env: Environment) {
  return createHmac("sha256", env.SESSION_SECRET!).update(`document:${payload}`).digest("base64url");
}

export function operationToken(id: string, subject: string, env: Environment, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ id, subject, expires: now + 10 * 60 * 1000 })).toString("base64url");
  return `${payload}.${signature(payload, env)}`;
}

export function readOperation(token: string, subject: string, env: Environment, now = Date.now()): string {
  try {
    if (token.length > 2048) throw new Error();
    const [payload, signed, extra] = token.split(".");
    const expected = signature(payload, env);
    if (extra || !signed || Buffer.byteLength(signed) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(signed), Buffer.from(expected))) throw new Error();
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.subject !== subject || !Number.isFinite(data.expires) || data.expires <= now || data.expires > now + 10 * 60 * 1000 || !/^[0-9a-f-]{36}$/i.test(data.id)) throw new Error();
    return data.id;
  } catch { throw new DocumentError("Sesi ekstraksi tidak valid atau kedaluwarsa. Pilih dokumen kembali.", 400); }
}

async function azure(url: string, key: string, body?: Uint8Array) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25000),
    headers: { "Ocp-Apim-Subscription-Key": key, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify({ base64Source: Buffer.from(body).toString("base64") }) } : {}),
  });
  if (!response.ok) {
    const hints: Record<number, string> = { 400: "Dokumen rusak, terenkripsi, atau format tidak valid. Ekspor ulang tanpa password.", 401: "Key Azure ditolak; hubungi admin.", 403: "Akses Azure ditolak; hubungi admin.", 429: "Kuota OCR tercapai. Tunggu sebelum mencoba lagi." };
    throw new DocumentError(hints[response.status] || "Layanan pembaca dokumen gagal. Coba lagi nanti.", response.status === 400 ? 422 : response.status === 429 ? 429 : 502);
  }
  return response;
}

export async function startDocument(bytes: Uint8Array, subject: string, env: Environment = process.env) {
  const { endpoint, key } = configuration(env);
  limitDocumentStarts(subject);
  const response = await azure(`${endpoint}${API}:analyze?_overload=analyzeDocument&${VERSION}&stringIndexType=utf16CodeUnit`, key, bytes);
  const location = response.headers.get("operation-location");
  if (response.status !== 202 || !location) throw new DocumentError("Respons awal ekstraksi tidak valid.");
  const url = new URL(location);
  const id = url.pathname.slice(`${API}/analyzeResults/`.length);
  if (url.origin !== endpoint || !url.pathname.startsWith(`${API}/analyzeResults/`) || !/^[0-9a-f-]{36}$/i.test(id)) throw new DocumentError("Lokasi hasil ekstraksi tidak valid.");
  return operationToken(id, subject, env);
}

export async function pollDocument(token: string, subject: string, env: Environment = process.env) {
  const { endpoint, key } = configuration(env);
  const id = readOperation(token, subject, env);
  const response = await azure(`${endpoint}${API}/analyzeResults/${id}?${VERSION}`, key);
  const data = await response.json();
  if (data.status === "running" || data.status === "notStarted") return { status: "running" as const };
  if (data.status === "failed") throw new DocumentError("Ekstraksi gagal. Dokumen mungkin rusak atau terkunci; ekspor ulang tanpa password.", 422);
  if (data.status !== "succeeded") throw new DocumentError("Status ekstraksi tidak dikenal.");
  try { return { status: "succeeded" as const, text: validateExtractedText(data.analyzeResult?.content) }; }
  catch (error) { throw new DocumentError(error instanceof Error ? error.message : "Teks tidak terbaca.", 422); }
}