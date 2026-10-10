import { documentError, documentFile, ExtractedDocument, validateExtractedText } from "./document-text";

export async function documentConfiguration(): Promise<"azure" | "opendataloader"> {
  const response = await fetch("/api/documents?configuration=1", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !["azure", "opendataloader"].includes(data.parser)) throw new Error(data.error || "Konfigurasi pembaca dokumen tidak tersedia.");
  return data.parser;
}

export async function readDocument(file: File, signal: AbortSignal, progress: (message: string) => void): Promise<ExtractedDocument> {
  const invalid = documentError(file);
  if (invalid) throw new Error(invalid);
  signal.throwIfAborted();
  let text: string;
  let source: ExtractedDocument["source"] = "UTF-8";
  if (!documentFile(file)) {
    progress("Membaca teks UTF-8 di browser…");
    text = validateExtractedText(await file.text());
  } else {
    progress("Mengunggah dokumen ke pembaca server…");
    const type = /\.pdf$/i.test(file.name) ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": type }, body: file, signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Upload gagal (${response.status}).`);
    if (data.status === "succeeded" && data.source === "OpenDataLoader PDF") {
      text = validateExtractedText(data.text);
      source = "OpenDataLoader PDF";
    } else {
      if (typeof data.token !== "string") throw new Error("Respons upload tidak valid.");
      source = "Azure teks/OCR";
      text = "";
      for (let attempt = 0; attempt < 90; attempt++) {
      signal.throwIfAborted();
      progress(`Ekstraksi teks/OCR sedang diproses… (${attempt + 1})`);
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(new DOMException("Dibatalkan", "AbortError")); };
        const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 2000);
        signal.addEventListener("abort", abort, { once: true });
      });
      const result = await fetch(`/api/documents?token=${encodeURIComponent(data.token)}`, { cache: "no-store", signal });
      const extracted = await result.json().catch(() => ({}));
      if (!result.ok) throw new Error(extracted.error || `Ekstraksi gagal (${result.status}).`);
      if (extracted.status === "succeeded") { text = validateExtractedText(extracted.text); break; }
      if (extracted.status !== "running") throw new Error("Respons ekstraksi tidak valid.");
      }
      if (!text) throw new Error("Ekstraksi terlalu lama. Pisahkan dokumen menjadi lebih kecil. Pemrosesan Azure mungkin tetap berjalan dan dikenai biaya.");
    }
  }
  signal.throwIfAborted();
  return { file: { name: file.name, size: file.size, type: file.type || "application/octet-stream" }, text, source };
}