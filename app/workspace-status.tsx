"use client";

import { useState } from "react";

type Props = { error?: string; actionError?: string; onRetry?: () => Promise<void>; onLogout?: () => Promise<void> };

export default function WorkspaceStatus({ error, actionError, onRetry, onLogout }: Props) {
  const [action, setAction] = useState<"retry" | "logout" | null>(null);
  async function run(kind: "retry" | "logout", callback: () => Promise<void>) {
    if (action) return;
    setAction(kind);
    try { await callback(); } finally { setAction(null); }
  }
  const failed = Boolean(error) && action !== "retry";

  return <main className="workspace-status-shell">
    <header className="workspace-status-header"><span className="top-brand"><span className="brand-dot" aria-hidden="true">✦</span>kawasan.ai</span><span className="eyebrow">RUANG UNTUK IDEMU</span></header>
    <section className="workspace-status-content" aria-labelledby="workspace-status-title" aria-busy={!failed}>
      <div className={`workspace-status-mark ${failed ? "is-paused" : ""}`} aria-hidden="true"><span>✦</span></div>
      <p className="eyebrow">{failed ? "SEBENTAR, YA" : "SELAMAT DATANG DI KAWASAN AI"}</p>
      <h1 id="workspace-status-title">{failed ? <>Ruangmu belum<br />bisa dibuka.</> : <>Ide besar dimulai<br />dari <em>ruang kecil.</em></>}</h1>
      <p className="workspace-status-copy" role="status">{failed ? "Kami belum berhasil terhubung ke riwayat bersama. Coba hubungkan kembali dalam beberapa saat." : "Sedang menyiapkan percakapan dan ruang untuk ide-idemu."}</p>
      {!failed && <div className="workspace-status-progress" aria-hidden="true"><span /></div>}
      {failed && <details className="workspace-status-detail"><summary>Detail kendala</summary><p>{error}</p></details>}
      {actionError && <p className="error-text" role="alert">{actionError}</p>}
      {(onRetry || onLogout) && <div className="workspace-status-actions">
        {failed && onRetry && <button className="primary-button" disabled={Boolean(action)} onClick={() => void run("retry", onRetry)}>Hubungkan kembali <span aria-hidden="true">↗</span></button>}
        {onLogout && <button className="workspace-exit" disabled={Boolean(action)} onClick={() => void run("logout", onLogout)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M9 5H5v14h4M9 12h12m-4-4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>{action === "logout" ? "Keluar…" : "Kembali ke login"}</button>}
      </div>}
    </section>
    <footer className="workspace-status-footer">SEBUAH RUANG UNTUK BERTANYA, BERPIKIR, DAN BERTUMBUH.</footer>
  </main>;
}