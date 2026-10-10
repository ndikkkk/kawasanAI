import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, sameOrigin, verifySession } from "../../../lib/auth";
import { DOCUMENT_UPLOAD_BYTES } from "../../../lib/document-text";
import { DocumentError, pollDocument, startDocument } from "../../../lib/document-service";
import { BodyTooLarge, boundedBody } from "../../../lib/request-body";
import { documentParser, extractLocalPdf } from "../../../lib/opendataloader";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const session = verifySession(cookies().get(SESSION_COOKIE)?.value);
  if (!session) return json({ error: "Session berakhir. Silakan login kembali." }, 401);
  if (!sameOrigin(request)) return json({ error: "Origin ditolak." }, 403);
  const format = request.headers.get("content-type");
  if (format !== "application/pdf" && format !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return json({ error: "Gunakan PDF atau DOCX." }, 415);
  try {
    const parser = documentParser();
    if (parser === "opendataloader" && format !== "application/pdf") return json({ error: "OpenDataLoader hanya membaca PDF. Ekspor DOCX ke PDF atau gunakan mode Azure.", }, 415);
    const bytes = await boundedBody(request, DOCUMENT_UPLOAD_BYTES);
    const signature = Buffer.from(bytes.slice(0, 5)).toString("ascii");
    if ((format === "application/pdf" && signature !== "%PDF-") || (format !== "application/pdf" && (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4))) return json({ error: "Isi dokumen tidak cocok dengan PDF/DOCX atau file rusak." }, 422);
    if (parser === "opendataloader") return json({ status: "succeeded", text: await extractLocalPdf(bytes, session.subject, request.signal), source: "OpenDataLoader PDF" });
    const token = await startDocument(bytes, session.subject);
    return json({ token }, 202);
  } catch (error) { return failure(error); }
}

export async function GET(request: Request) {
  const session = verifySession(cookies().get(SESSION_COOKIE)?.value);
  if (!session) return json({ error: "Session berakhir. Silakan login kembali." }, 401);
  if (!sameOrigin(request)) return json({ error: "Origin ditolak." }, 403);
  try {
    const params = new URL(request.url).searchParams;
    if (params.has("configuration")) return json({ parser: documentParser() });
    return json(await pollDocument(params.get("token") || "", session.subject));
  }
  catch (error) { return failure(error); }
}

function failure(error: unknown) {
  if (error instanceof BodyTooLarge) return json({ error: "PDF/DOCX maksimal 4 MB. Kompres atau pisahkan per bab." }, 413);
  if (error instanceof DocumentError) return json({ error: error.message }, error.status);
  return json({ error: "Pembaca dokumen tidak dapat dihubungi atau melewati batas waktu. Coba lagi nanti." }, 502);
}