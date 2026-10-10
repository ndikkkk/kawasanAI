"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AVAILABLE_MODELS } from "../lib/models";
import { Attachment, ChatMessage, Conversation, fileError, MAX_FILE_TEXT, messageContent, newConversation, textFile } from "../lib/chat-store";
import SettingsDialog from "./settings-dialog";
import useSharedWorkspace from "./use-shared-workspace";
import WorkspaceStatus from "./workspace-status";
import AutoTextarea from "./auto-textarea";
import useConfirmation from "./use-confirmation";

function formatSize(size: number) {
  return size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function Chat() {
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const { confirm, confirmationDialog } = useConfirmation();
  const { workspace, setWorkspace, storageError, saving, pending, save, reload, exportHistory } = useSharedWorkspace(busy || reading, confirm);
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const active = workspace?.conversations.find((chat) => chat.id === workspace.activeId);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [active?.id, active?.messages.length, busy]);
  useEffect(() => {
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setMobileOpen(false); }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);

  function updateChat(id: string, change: (chat: Conversation) => Conversation) {
    setWorkspace((current) => current ? { ...current, conversations: current.conversations.map((chat) => chat.id === id ? change(chat) : chat) } : current);
  }

  function resetComposer() { setInput(""); setAttachment(null); setError(""); setNotice(""); setEditingId(null); setMobileOpen(false); }
  function createChat() {
    if (sending.current || reading || saving) return;
    if ((workspace?.conversations.length ?? 0) >= 100) { setError("Maksimal 100 percakapan bersama. Ekspor lalu hapus percakapan yang tidak diperlukan."); return; }
    const chat = newConversation();
    setWorkspace((current) => current ? { ...current, conversations: [chat, ...current.conversations], activeId: chat.id } : current);
    resetComposer();
  }
  function selectChat(id: string) {
    if (sending.current || reading || saving) return;
    setWorkspace((current) => current ? { ...current, activeId: id } : current);
    resetComposer();
  }
  function rename(event: FormEvent, id: string) {
    event.preventDefault();
    if (!title.trim() || sending.current || reading || saving) return;
    updateChat(id, (chat) => ({ ...chat, title: title.trim().slice(0, 70) }));
    setEditingId(null);
  }
  async function deleteChat(chat: Conversation) {
    if (sending.current || reading || saving) return;
    if (!await confirm({ title: "Hapus percakapan?", description: `“${chat.title}” akan dihapus dari riwayat bersama untuk semua pengguna. Percakapan ini tidak bisa dikembalikan.`, label: "Hapus percakapan", danger: true })) return;
    if (sending.current || reading || saving) return;
    setWorkspace((current) => {
      if (!current) return current;
      const remaining = current.conversations.filter((item) => item.id !== chat.id);
      if (!remaining.length) remaining.push(newConversation());
      return { ...current, conversations: remaining, activeId: current.activeId === chat.id ? remaining[0].id : current.activeId };
    });
    resetComposer();
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || sending.current) return;
    const invalid = fileError(file);
    if (invalid) { setError(invalid); return; }
    setReading(true); setError(""); setNotice("");
    try {
      let text: string | undefined;
      if (textFile(file)) {
        const extracted = await file.text();
        if (extracted.includes("\u0000")) throw new Error("Isi file tampak biner, bukan teks yang dapat dibaca.");
        text = extracted.slice(0, MAX_FILE_TEXT);
        if (extracted.length > MAX_FILE_TEXT) setNotice("File dipilih, tetapi hanya 100.000 karakter pertama yang dikirim agar konteks tidak terlalu besar.");
      } else {
        setNotice("Format ini hanya dilampirkan sebagai nama/ukuran. AI belum bisa membaca isi gambar, PDF, Office, audio, video, atau arsip pada versi ini.");
      }
      setAttachment({ name: file.name, type: file.type || "application/octet-stream", size: file.size, text });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "File tidak dapat dibaca."); }
    finally { setReading(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!active || !workspace || (!input.trim() && !attachment) || sending.current || reading || saving) return;
    const userText = input.trim() || "Tolong analisis file yang saya lampirkan.";
    const userMessage: ChatMessage = { role: "user", content: userText, ...(attachment ? { attachment } : {}) };
    const next = [...active.messages, userMessage];
    const body = JSON.stringify({ model: active.model, preferences: workspace.preferences, messages: next.map((message) => ({ role: message.role, content: messageContent(message) })) });
    // Reserve one message for the assistant so the completed turn remains persistable.
    if (next.length >= 200 || new Blob([body]).size > 3 * 1024 * 1024) { setError("Konteks terlalu panjang. Mulai New Brainstorm agar dapat melanjutkan."); return; }
    sending.current = true; setBusy(true); setError("");
    const id = active.id;
    updateChat(id, (chat) => ({ ...chat, messages: next, updatedAt: Date.now(), title: chat.messages.length === 0 && chat.title === "New Brainstorm" ? userText.slice(0, 70) : chat.title }));
    setInput(""); setAttachment(null); setNotice("");
    controller.current = new AbortController();
    const timer = window.setTimeout(() => controller.current?.abort(), 65000);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.current.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.content !== "string") throw new Error(data.error || `Chat gagal (${response.status}).`);
      if (data.content.length > 150000) throw new Error("Jawaban terlalu panjang untuk disimpan. Coba minta jawaban lebih ringkas.");
      updateChat(id, (chat) => ({ ...chat, messages: [...chat.messages, { role: "assistant", content: data.content }], updatedAt: Date.now() }));
    } catch (reason) {
      // Roll back this failed turn so retrying does not duplicate the prompt.
      updateChat(id, (chat) => ({ ...chat, messages: active.messages }));
      setInput(userText); setAttachment(attachment);
      setError(reason instanceof Error && reason.name !== "AbortError" ? reason.message : "Permintaan melewati batas waktu. Silakan kirim ulang.");
    } finally { window.clearTimeout(timer); sending.current = false; setBusy(false); controller.current = null; }
  }

  async function logout() {
    if (pending && !await confirm({ title: "Keluar tanpa menyimpan?", description: "Ada perubahan yang belum tersimpan. Batalkan dan ekspor cadangan jika ingin menyimpannya sebelum keluar.", label: "Tetap keluar", danger: true })) return;
    try {
      const response = await fetch("/api/logout", { method: "POST", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      window.location.href = "/login";
    } catch { setError("Gagal keluar. Periksa koneksi dan coba lagi."); }
  }

  if (!workspace || !active) return <><WorkspaceStatus error={storageError} actionError={error} onRetry={reload} onLogout={logout} />{confirmationDialog}</>;
  const locked = busy || reading || saving;

  return <main className={`workspace ${workspace.collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "mobile-sidebar-open" : ""}`}>
    {mobileOpen && <button className="sidebar-backdrop" aria-label="Tutup sidebar" onClick={() => setMobileOpen(false)} />}
    <aside id="chat-sidebar" className="sidebar" aria-label="Riwayat brainstorm">
      <div className="sidebar-heading"><span className="sidebar-label top-brand">kawasan.ai</span><button className="desktop-toggle icon-button" aria-label={workspace.collapsed ? "Perbesar sidebar" : "Perkecil sidebar"} aria-expanded={!workspace.collapsed} onClick={() => setWorkspace({ ...workspace, collapsed: !workspace.collapsed })}>{workspace.collapsed ? "☰" : "‹"}</button><button className="mobile-toggle icon-button" aria-label="Tutup sidebar" onClick={() => setMobileOpen(false)}>×</button></div>
      <button className="new-chat" disabled={locked} onClick={createChat} title="New Brainstorm" aria-label="New Brainstorm"><span>＋</span><span className="sidebar-label">New Brainstorm</span></button>
      <p className="sidebar-label eyebrow">RIWAYAT BRAINSTORM</p>
      <nav className="history-list" aria-label="Percakapan tersimpan">
        {[...workspace.conversations].sort((a, b) => b.updatedAt - a.updatedAt).map((chat) => <div key={chat.id} className={`history-item ${chat.id === active.id ? "selected" : ""}`}>
          {editingId === chat.id ? <form className="rename-form" onSubmit={(event) => rename(event, chat.id)}><input aria-label="Judul brainstorm" autoFocus maxLength={70} value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setEditingId(null); }} /><button aria-label="Simpan judul" disabled={!title.trim()}>✓</button><button type="button" aria-label="Batal ubah judul" onClick={() => setEditingId(null)}>×</button></form> : <>
            <button className="history-select" aria-current={chat.id === active.id ? "page" : undefined} title={chat.title} disabled={locked} onClick={() => selectChat(chat.id)}><span aria-hidden="true">◇</span><span className="sidebar-label history-title">{chat.title}</span></button>
            <div className="history-actions sidebar-label"><button aria-label={`Ubah judul ${chat.title}`} disabled={locked} onClick={() => { setEditingId(chat.id); setTitle(chat.title); }}>✎</button><button aria-label={`Hapus ${chat.title}`} disabled={locked} onClick={() => deleteChat(chat)}>×</button></div>
          </>}
        </div>)}
      </nav>
      <div className="sidebar-footer"><button className="settings-button" title="Pengaturan" aria-label="Pengaturan" onClick={() => setSettingsOpen(true)}><span>⚙</span><span className="sidebar-label">{workspace.preferences.name || "Pengaturan"}</span></button><p className="sidebar-label storage-note">Riwayat bersama semua pengguna.<br />Pembaruan otomatis tiap 10 detik.</p></div>
    </aside>
    <div className="app-shell workspace-main">
      <header className="topbar"><button className="mobile-toggle icon-button" aria-label="Buka sidebar" aria-controls="chat-sidebar" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>☰</button><div className="top-brand"><span className="brand-dot">✦</span><span>kawasan<span className="brand-accent">.</span>ai</span></div><div className="top-actions"><button onClick={logout} disabled={locked} className="logout-button">Keluar</button></div></header>
      <section className="chat-layout">
        {active.messages.length === 0 ? <div className="welcome"><p className="eyebrow">KAWASAN AI{workspace.preferences.name ? ` · Halo, ${workspace.preferences.name}` : ""}</p><h1>Apa yang ingin<br /><em>kamu jelajahi?</em></h1><p className="welcome-copy">Mulai brainstorm, unggah file, dan biarkan ide berkembang.</p></div> : <h1 className="conversation-heading">{active.title}</h1>}
        {storageError && <p role="alert" className="error-text">{storageError}</p>}
        <div className="history-sync"><span role="status">{saving ? "Menyimpan…" : pending ? "Perubahan belum tersimpan" : "Riwayat bersama dimuat"}</span><button disabled={locked || !pending} onClick={() => void save()}>Coba simpan</button><button disabled={locked} onClick={reload}>Muat ulang</button><button onClick={exportHistory}>Ekspor cadangan</button></div>
        <div className="messages" role="log" aria-label="Pesan chat" aria-live="polite">
          {active.messages.map((message, index) => <div className={`message-row ${message.role}`} key={`${active.id}-${index}`}><div className="message-avatar">{message.role === "assistant" ? <span role="img" aria-label="Asisten AI">✦</span> : <Image className="user-avatar" src="/avatars/user.svg" alt={workspace.preferences.name ? `Avatar ${workspace.preferences.name}` : "Avatar pengirim"} width={30} height={30} unoptimized />}</div><div className="message-bubble"><p>{message.content}</p>{message.attachment && <div className="attachment"><span>▧</span><div><strong>{message.attachment.name}</strong><small>{formatSize(message.attachment.size)} · {message.attachment.text === undefined ? "Metadata saja" : "Konteks teks"}</small></div></div>}</div></div>)}
          {busy && <div className="message-row assistant"><div className="message-avatar">✦</div><div className="message-bubble typing" aria-label="AI sedang merespons"><i /><i /><i /></div></div>}
          <div ref={bottom} />
        </div>
        {error && <p role="alert" className="error-text chat-error">{error}</p>}
        {notice && <p role="status" className="file-notice">{notice}</p>}
        {attachment && <div className="pending-file"><span>▧</span><strong>{attachment.name}</strong><small>{formatSize(attachment.size)}</small><button disabled={locked} aria-label="Hapus lampiran" onClick={() => { setAttachment(null); setNotice(""); }}>×</button></div>}
        <div className="composer-tools"><label className="model-picker"><span>Model</span><select value={active.model} disabled={locked} onChange={(event) => updateChat(active.id, (chat) => ({ ...chat, model: event.target.value }))}>{AVAILABLE_MODELS.map((model) => <option key={model}>{model}</option>)}</select></label><span className="model-hint">File maks. 20 MB</span></div>
        <form className="composer" onSubmit={send}><button type="button" className="attach-button" disabled={locked} onClick={() => fileInput.current?.click()} aria-label="Lampirkan file maksimal 20 MB">＋</button><input ref={fileInput} type="file" hidden onChange={selectFile} /><AutoTextarea rows={2} maxLength={20000} aria-label="Pesan" value={input} onChange={(event) => setInput(event.target.value)} placeholder={reading ? "Membaca file…" : "Tulis idemu…"} disabled={locked} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button className="send-button" aria-label="Kirim" disabled={locked || (!input.trim() && !attachment)}>↑</button></form>
        <p className="composer-note">Enter untuk kirim · Shift+Enter untuk baris baru. AI dapat membuat kesalahan.</p>
        <p className="file-support">AI membaca 100.000 karakter pertama file teks/kode. PDF, gambar, Word, dan format lainnya baru mengirim info file, bukan isinya.</p>
      </section>
    </div>
    {settingsOpen && <SettingsDialog initial={workspace.preferences} onClose={() => setSettingsOpen(false)} onSave={(preferences) => setWorkspace((current) => current ? { ...current, preferences } : current)} />}
    {confirmationDialog}
  </main>;
}