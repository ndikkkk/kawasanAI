"use client";

import { documentParts, ExtractedDocument } from "../lib/document-text";

export default function DocumentPreview({ document, selected, locked, onSelect, onClose }: {
  document: ExtractedDocument; selected: number | null; locked: boolean; onSelect: (index: number) => void; onClose: () => void;
}) {
  const parts = documentParts(document.text);
  return <section className="document-preview" aria-label="Hasil pembacaan dokumen">
    <div className="document-heading"><strong>{document.file.name}</strong><button type="button" disabled={locked} onClick={onClose}>Tutup dokumen</button></div>
    <p>{document.source} · {document.text.length.toLocaleString("id-ID")} karakter · {parts.length} bagian. Hanya bagian yang dilampirkan akan dikirim ke AI dan disimpan di riwayat bersama.</p>
    {document.source === "OpenDataLoader PDF" && <p>Mode lokal tanpa OCR: halaman scan, gambar, dan rumus berbentuk gambar dapat terlewat. Periksa kelengkapan dengan PDF asli. Markdown ditampilkan sebagai teks, bukan layout PDF.</p>}
    <p>Periksa hasil sebelum mengirim: OCR, tabel, rumus, urutan kolom, dan nomor halaman dapat keliru. Gambar di DOCX tidak diekstrak. Pratinjau hilang saat pindah percakapan atau memuat ulang.</p>
    <label>Bagian dokumen <select disabled={locked} value={selected ?? ""} onChange={(event) => onSelect(Number(event.target.value))}>
      <option value="" disabled>Pilih bagian untuk dilampirkan</option>
      {parts.map((part, index) => <option key={index} value={index}>Bagian {index + 1}/{parts.length} · {part.length.toLocaleString("id-ID")} karakter</option>)}
    </select></label>
    {selected !== null && <details><summary>Pratinjau teks bagian {selected + 1}</summary><pre>{parts[selected]}</pre></details>}
    {parts.length > 1 && <p>Analisis per bagian, lalu minta sintesis. Jika konteks model penuh, mulai brainstorm baru dengan ringkasan sebelumnya. Ini bukan pencarian otomatis seluruh dokumen.</p>}
  </section>;
}