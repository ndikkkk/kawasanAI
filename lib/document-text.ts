import { Attachment, fileError, MAX_FILE_TEXT, textFile } from "./chat-store";

export const DOCUMENT_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_EXTRACTED_TEXT = 500000;
export type ExtractedDocument = { file: Attachment; text: string; source: "UTF-8" | "OpenDataLoader PDF" | "Azure teks/OCR" };

export function documentFile(file: { name: string }) {
  return /\.(pdf|docx)$/i.test(file.name);
}

export function documentError(file: { name: string; size: number; type: string }) {
  const invalid = fileError(file);
  if (invalid) return invalid;
  if (!file.size) return "File kosong tidak dapat dibaca.";
  if (file.name.length > 200) return "Nama file maksimal 200 karakter.";
  if (documentFile(file)) return file.size > DOCUMENT_UPLOAD_BYTES ? "PDF/DOCX maksimal 4 MB. Kompres atau pisahkan dokumen per bab." : null;
  return textFile(file) ? null : "Format belum didukung. Gunakan PDF, DOCX, atau file teks/kode UTF-8. DOC lama, gambar, audio, dan arsip belum didukung.";
}

export function validateExtractedText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Tidak ada teks terbaca. Dokumen mungkin kosong atau scan kurang jelas; gunakan scan lebih jelas atau lakukan OCR ulang.");
  if (value.includes("\u0000") || value.includes("\ufffd")) throw new Error("Teks tidak valid atau bukan UTF-8. Konversi encoding atau ekspor ulang dokumen.");
  if (value.length > MAX_EXTRACTED_TEXT) throw new Error("Hasil ekstraksi melebihi 500.000 karakter. Pisahkan dokumen per bab; tidak ada teks yang dipotong atau dikirim.");
  return value;
}

// Preserve every character, including surrogate pairs at chunk boundaries.
export function documentParts(text: string): string[] {
  validateExtractedText(text);
  const parts: string[] = [];
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(offset + MAX_FILE_TEXT, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    parts.push(text.slice(offset, end));
    offset = end;
  }
  return parts;
}

export function partAttachment(document: ExtractedDocument, index: number): Attachment {
  const parts = documentParts(document.text);
  if (!Number.isInteger(index) || index < 0 || index >= parts.length) throw new Error("Bagian dokumen tidak valid.");
  return { ...document.file, name: parts.length > 1 ? `${document.file.name} — bagian ${index + 1}/${parts.length}` : document.file.name, text: parts[index] };
}