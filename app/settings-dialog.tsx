"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { Preferences } from "../lib/chat-store";

export default function SettingsDialog({ initial, onSave, onClose }: { initial: Preferences; onSave: (value: Preferences) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(initial.name);
  const [instructions, setInstructions] = useState(initial.instructions);
  useEffect(() => { dialog.current?.showModal(); }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({ name: name.trim(), instructions: instructions.trim() });
    dialog.current?.close();
  }
  return <dialog ref={dialog} className="settings-dialog" onClose={onClose} aria-labelledby="settings-title">
    <form onSubmit={submit}>
      <div className="dialog-heading"><h2 id="settings-title">Pengaturan</h2><button type="button" aria-label="Tutup pengaturan" onClick={() => dialog.current?.close()}>×</button></div>
      <label htmlFor="preferred-name">Mau dipanggil apa?</label>
      <input id="preferred-name" autoFocus maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama panggilan" />
      <label htmlFor="personal-instructions">Personalisasi jawaban</label>
      <textarea id="personal-instructions" maxLength={2000} rows={6} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Contoh: gunakan bahasa Indonesia santai, jelaskan bertahap, dan beri contoh kode." />
      <small>{instructions.length}/2000 karakter</small>
      <p className="muted">Preferensi berlaku untuk pesan berikutnya dan dikirim ke provider AI. Jangan masukkan kata sandi atau API key. Riwayat dan pengaturan tersimpan di browser ini, terpisah menurut kode akses.</p>
      <div className="dialog-actions"><button type="button" onClick={() => dialog.current?.close()}>Batal</button><button className="primary-button">Simpan pengaturan</button></div>
    </form>
  </dialog>;
}