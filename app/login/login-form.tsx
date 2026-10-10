"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (response.ok) router.replace("/");
    else setError("Kode akses salah. Silakan coba lagi.");
    setLoading(false);
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark">✦</div>
        <p className="eyebrow">RUANG PRIBADI</p>
        <h1>Selamat datang.</h1>
        <p className="muted">Masukkan kode akses untuk mulai berbincang dengan AI.</p>
        <form onSubmit={submit} className="login-form">
          <label htmlFor="code">Kode akses</label>
          <input id="code" type="password" autoFocus value={code} onChange={(event) => setCode(event.target.value)} placeholder="Masukkan kode rahasia" required />
          {error && <p className="error-text">{error}</p>}
          <button className="primary-button" disabled={loading}>{loading ? "Memeriksa…" : "Masuk ke ruang chat"}<span>→</span></button>
        </form>
        <p className="login-note">Akses ini hanya untuk penggunaan pribadi.</p>
      </section>
    </main>
  );
}