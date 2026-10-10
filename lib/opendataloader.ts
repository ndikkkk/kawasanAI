import { execFile } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { DocumentError, limitDocumentStarts } from "./document-service";
import { DOCUMENT_UPLOAD_BYTES, validateExtractedText } from "./document-text";

const execute = promisify(execFile);
let active = false;

export function documentParser(env = process.env): "azure" | "opendataloader" {
  const parser = env.DOCUMENT_PARSER || "azure";
  if (parser !== "azure" && parser !== "opendataloader") throw new DocumentError("DOCUMENT_PARSER harus azure atau opendataloader.", 503);
  return parser;
}

// Invoke the bundled CLI directly: the SDK does not expose process cancellation,
// heap/output limits or a timeout. Never interpolate uploaded names into a shell.
export async function extractLocalPdf(bytes: Uint8Array, subject: string, signal?: AbortSignal) {
  if (bytes.length > DOCUMENT_UPLOAD_BYTES) throw new DocumentError("PDF maksimal 4 MB.", 413);
  if (Buffer.from(bytes.slice(0, 5)).toString("ascii") !== "%PDF-") throw new DocumentError("Isi file bukan PDF.", 422);
  if (active) throw new DocumentError("Pembaca PDF sedang sibuk. Coba lagi setelah dokumen sebelumnya selesai.", 429);
  limitDocumentStarts(subject);
  active = true;
  let directory: string | undefined;
  try {
    signal?.throwIfAborted();
    const jar = join(process.cwd(), "node_modules", "@opendataloader", "pdf", "lib", "opendataloader-pdf-cli.jar");
    await access(jar);
    directory = await mkdtemp(join(tmpdir(), "kawasan-opendataloader-"));
    const input = join(directory, "document.pdf");
    await writeFile(input, bytes, { mode: 0o600 });
    const { stdout } = await execute("java", [
      "-Xmx512m", "-Djava.awt.headless=true", "-jar", jar, input,
      "--format", "markdown", "--image-output", "off", "--hybrid", "off", "--to-stdout", "--quiet",
    ], { cwd: directory, encoding: "utf8", windowsHide: true, timeout: 20000, killSignal: "SIGKILL", maxBuffer: 2 * 1024 * 1024, signal });
    try { return validateExtractedText(stdout); }
    catch (error) { throw new DocumentError(error instanceof Error ? error.message : "Teks PDF tidak terbaca.", 422); }
  } catch (error) {
    if (error instanceof DocumentError) throw error;
    const failure = error as NodeJS.ErrnoException & { killed?: boolean };
    if (failure.code === "ENOENT") throw new DocumentError("OpenDataLoader belum siap. Instal dependency proyek dan Java 11+ di PATH server.", 503);
    if (failure.killed || failure.name === "AbortError") throw new DocumentError("Pembacaan PDF dibatalkan atau melewati 20 detik. Pisahkan PDF per bab.", 408);
    if (failure.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") throw new DocumentError("Hasil PDF terlalu besar. Pisahkan dokumen per bab.", 422);
    // Do not return Java stderr: it may contain document contents or server paths.
    throw new DocumentError("OpenDataLoader gagal membaca PDF. File mungkin rusak, terkunci, atau melampaui kapasitas parser. Scan memerlukan OCR terpisah.", 422);
  } finally {
    try { if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
    finally { active = false; }
  }
}