"use client";

import { useEffect, useRef, useState } from "react";

export default function CopyAnswer({ content }: { content: string }) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    clearTimeout(timer.current);
    setStatus("copying");
    try {
      await navigator.clipboard.writeText(content);
      setStatus("copied");
      timer.current = setTimeout(() => setStatus("idle"), 2500);
    } catch { setStatus("error"); }
  }

  return <div className="answer-actions">
    <button type="button" className="copy-answer" aria-label="Salin jawaban AI" disabled={status === "copying"} onClick={copy}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>
      {status === "copied" ? "Tersalin" : status === "copying" ? "Menyalin…" : "Salin"}
    </button>
    <span role="status" className={status === "error" ? "error-text" : "copy-status"}>{status === "error" ? "Gagal menyalin. Izinkan clipboard atau pilih teks dan salin manual." : status === "copied" ? "Jawaban berhasil disalin." : ""}</span>
  </div>;
}