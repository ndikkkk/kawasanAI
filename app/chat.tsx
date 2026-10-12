"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AVAILABLE_MODELS } from "../lib/models";
import { Attachment, ChatMessage, Conversation, messageContent, newConversation } from "../lib/chat-store";
import { documentError, documentFile, documentParts, ExtractedDocument, partAttachment } from "../lib/document-text";
import { documentConfiguration, readDocument } from "../lib/read-document";
import { HISTORY_BYTES } from "../lib/shared-history";
import DocumentPreview from "./document-preview";
import SettingsDialog from "./settings-dialog";
import useSharedWorkspace from "./use-shared-workspace";
import WorkspaceStatus from "./workspace-status";
import AutoTextarea from "./auto-textarea";
import MarkdownContent from "./markdown-content";
import useConfirmation from "./use-confirmation";
import useSessionPresence from "./use-session-presence";
import { readAiResponse } from "../lib/ai-stream";
import CopyAnswer from "./copy-answer";
import useChatScroll from "./use-chat-scroll";

function formatSize(size: number) {
  return size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function Chat() {
  useSessionPresence();
  const [streamed, setStreamed] = useState("");
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [document, setDocument] = useState<ExtractedDocument | null>(null);
  const [selectedPart, setSelectedPart] = useState<number | null>(null);
  const extraction = useRef<AbortController | null>(null);
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
  const sending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); extraction.current?.abort(); }, []);

  const active = workspace?.conversations.find((chat) => chat.id === workspace.activeId);
  const { scrollRef, contentRef, away, latest, onScroll } = useChatScroll(active?.id);
  useEffect(() => {
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setMobileOpen(false); }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);

  function updateChat(id: string, change: (chat: Conversation) => Conversation) {
    setWorkspace((current) => current ? { ...current, conversations: current.conversations.map((chat) => chat.id === id ? change(chat) : chat) } : current);
  }

  function resetComposer() { setInput(""); setAttachment(null); setDocument(null); setSelectedPart(null); setError(""); setStreamed(""); setNotice(""); setEditingId(null); setMobileOpen(false); }
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
    if (!file || sending.current || extraction.current || saving) return;
    const invalid = documentError(file);
    if (invalid) { setError(invalid); return; }
    setReading(true); setError(""); setNotice("");
    const abort = new AbortController();
    extraction.current = abort;
    let timer: number | undefined;
    try {
      if (documentFile(file)) {
        const parser = await documentConfiguration();
        if (parser === "opendataloader" && /\.docx$/i.test(file.name)) throw new Error("OpenDataLoader hanya membaca PDF. Ekspor DOCX ke PDF atau gunakan mode Azure.");
        if (!await confirm({ title: parser === "opendataloader" ? "Baca PDF dengan OpenDataLoader?" : "Baca dokumen melalui Azure?", description: parser === "opendataloader"
          ? "PDF diproses di server aplikasi, bukan di browser, tanpa API Azure dan tanpa biaya parser per halaman. Mode ini belum menjalankan OCR: scan serta gambar dapat tidak terbaca, termasuk pada PDF campuran. Hasil yang dikirim ke AI terlihat dalam riwayat bersama dan tetap memakai token AI. Periksa kelengkapan hasil sebelum mengirim."
          : "File ini akan dikirim ke Azure Document Intelligence untuk ekstraksi teks/OCR. Pemrosesan dikenai biaya Azure per halaman, terpisah dari token AI. Hasil yang Anda kirim ke chat akan terlihat oleh semua pemegang kode. Jangan unggah dokumen rahasia tanpa izin. Membatalkan setelah upload tidak menjamin biaya berhenti.", label: "Setuju, baca dokumen" })) return;
      }
      timer = window.setTimeout(() => abort.abort(), 240000);
      const extracted = await readDocument(file, abort.signal, setNotice);
      setDocument(extracted);
      const parts = documentParts(extracted.text);
      setSelectedPart(parts.length === 1 ? 0 : null);
      setAttachment(parts.length === 1 ? partAttachment(extracted, 0) : null);
      setNotice(parts.length === 1 ? "Teks siap dilampirkan. Periksa pratinjau sebelum mengirim." : `Dokumen dibaca menjadi ${parts.length} bagian tanpa pemotongan. Pilih bagian yang akan dianalisis.`);
    } catch (reason) { setNotice(""); setError(abort.signal.aborted ? "Pembacaan dibatalkan atau melewati 4 menit. Jika memakai Azure, job dapat tetap berjalan dan dikenai biaya." : reason instanceof Error ? reason.message : "File tidak dapat dibaca."); }
    finally { window.clearTimeout(timer); extraction.current = null; setReading(false); }
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
    const projected = workspace.conversations.map((chat) => chat.id === active.id ? { ...chat, messages: next } : chat);
    // Reserve room for an assistant response (up to 150,000 characters with JSON escaping).
    if (new Blob([JSON.stringify({ revision: "0".repeat(36), conversations: projected })]).size > HISTORY_BYTES - 950000) { setError("Riwayat bersama hampir penuh. Ekspor lalu hapus percakapan lama sebelum menambah dokumen; ruang disisihkan untuk jawaban AI."); return; }
    latest();
    sending.current = true; setBusy(true); setError(""); setStreamed("");
    const id = active.id;
    updateChat(id, (chat) => ({ ...chat, messages: next, updatedAt: Date.now(), title: chat.messages.length === 0 && chat.title === "New Brainstorm" ? userText.slice(0, 70) : chat.title }));
    setInput(""); setAttachment(null); setSelectedPart(null); setNotice("");
    controller.current = new AbortController();
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.current.signal });
      if (response.status === 401) { window.location.replace("/login?expired=1"); return; }
      const content = await readAiResponse(response, setStreamed);
      updateChat(id, (chat) => ({ ...chat, messages: [...chat.messages, { role: "assistant", content }], updatedAt: Date.now() }));
      setStreamed("");
    } catch (reason) {
      // Roll back this failed turn so retrying does not duplicate the prompt.
      updateChat(id, (chat) => ({ ...chat, messages: active.messages }));
      setInput(userText); setAttachment(attachment); setSelectedPart(selectedPart);
      setError(reason instanceof Error && reason.name !== "AbortError" ? reason.message : "Respons dihentikan. Pesan dikembalikan ke kolom input; teks sementara belum disimpan.");
    } finally { sending.current = false; setBusy(false); controller.current = null; }
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
      <div className="conversation-bar"><h1 className="conversation-heading">{active.title}</h1></div>
      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
      <section className="chat-layout" ref={contentRef}>
        {active.messages.length === 0 && <div className="welcome"><p className="eyebrow">KAWASAN AI{workspace.preferences.name ? ` · Halo, ${workspace.preferences.name}` : ""}</p><h2>Apa yang ingin<br /><em>kamu jelajahi?</em></h2><p className="welcome-copy">Mulai brainstorm, unggah file, dan biarkan ide berkembang.</p></div>}
        {storageError && <p role="alert" className="error-text">{storageError}</p>}
        <div className="history-sync"><span role="status">{saving ? "Menyimpan…" : pending ? "Perubahan belum tersimpan" : "Riwayat bersama dimuat"}</span><button disabled={locked || !pending} onClick={() => void save()}>Coba simpan</button><button disabled={locked} onClick={reload}>Muat ulang</button><button onClick={exportHistory}>Ekspor cadangan</button></div>
        <div className="messages" role="log" aria-label="Pesan chat" aria-live="polite">
          {active.messages.map((message, index) => <div className={`message-row ${message.role}`} key={`${active.id}-${index}`}><div className="message-avatar">{message.role === "assistant" ? <span role="img" aria-label="Asisten AI">✦</span> : <Image className="user-avatar" src="/avatars/user.svg" alt={workspace.preferences.name ? `Avatar ${workspace.preferences.name}` : "Avatar pengirim"} width={30} height={30} unoptimized />}</div><div className="message-bubble"><MarkdownContent content={message.content} />{message.role === "assistant" && <CopyAnswer content={message.content} />}{message.attachment && <div className="attachment"><span>▧</span><div><strong>{message.attachment.name}</strong><small>{formatSize(message.attachment.size)} · {message.attachment.text === undefined ? "Metadata saja" : "Konteks teks"}</small></div></div>}</div></div>)}
          {streamed && <div className="message-row assistant"><div className="message-avatar">✦</div><div className="message-bubble"><small>{busy ? "Sedang menjawab…" : "Jawaban sementara — belum lengkap dan belum disimpan"}</small><MarkdownContent content={streamed} /></div></div>}
          {busy && !streamed && <div className="message-row assistant"><div className="message-avatar">✦</div><div className="message-bubble typing" aria-label="AI sedang merespons"><i /><i /><i /></div></div>}
        </div>
        {error && <p role="alert" className="error-text chat-error">{error}</p>}
        {busy && <button type="button" className="document-cancel" onClick={() => controller.current?.abort()}>Hentikan respons</button>}
        {notice && <p role="status" className="file-notice">{notice}</p>}
        {reading && <button type="button" className="document-cancel" onClick={() => extraction.current?.abort()}>Batalkan pembacaan</button>}
        {document && <DocumentPreview document={document} selected={selectedPart} locked={locked} onSelect={(index) => { setSelectedPart(index); setAttachment(partAttachment(document, index)); setNotice(`Bagian ${index + 1} siap dikirim. Bagian lain tidak otomatis dibaca AI.`); }} onClose={() => { setDocument(null); setSelectedPart(null); setAttachment(null); setNotice(""); }} />}
        {attachment && <div className="pending-file"><span>▧</span><strong>{attachment.name}</strong><small>{formatSize(attachment.size)}</small><button disabled={locked} aria-label="Hapus lampiran" onClick={() => { setAttachment(null); setNotice(""); }}>×</button></div>}
      </section>
      </div>
      <footer className="composer-dock">
        {away && <button type="button" className="latest-message" onClick={latest}>↓ Pesan terbaru</button>}
        <div className="composer-inner">
        <div className="composer-tools"><label className="model-picker"><span>Model</span><select value={active.model} disabled={locked} onChange={(event) => updateChat(active.id, (chat) => ({ ...chat, model: event.target.value }))}>{AVAILABLE_MODELS.map((model) => <option key={model}>{model}</option>)}</select></label><span className="model-hint">PDF/DOCX 4 MB · Teks 20 MB</span></div>
        <form className="composer" onSubmit={send}>
          <button type="button" className="attach-button" disabled={locked} onClick={() => fileInput.current?.click()} aria-label="Lampirkan file maksimal 20 MB"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" /></svg></button>
          <input ref={fileInput} type="file" hidden onChange={selectFile} />
          <AutoTextarea rows={1} maxLength={500000} aria-label="Pesan" value={input} onChange={(event) => setInput(event.target.value)} placeholder={reading ? "Membaca file…" : "Tulis idemu…"} disabled={locked} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
          <button className="send-button" aria-label="Kirim" disabled={locked || (!input.trim() && !attachment)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 19V5m-6 6 6-6 6 6" /></svg></button>
        </form>
        <p className="composer-note">Enter untuk kirim · Shift+Enter untuk baris baru. AI dapat membuat kesalahan.</p>
        <details className="file-support"><summary>Format dan batas file</summary><p>PDF diproses lokal dengan OpenDataLoader atau Azure sesuai konfigurasi. DOCX melalui Azure. Teks/kode UTF-8 dibaca di browser. Maks. 500.000 karakter hasil ekstraksi, dipilih per bagian maks. 500.000 karakter; tidak dipotong diam-diam. Batas konteks model dan request 3 MB tetap berlaku. Gambar/audio/DOC lama belum didukung.</p></details>
        </div>
      </footer>
    </div>
    {settingsOpen && <SettingsDialog initial={workspace.preferences} onClose={() => setSettingsOpen(false)} onSave={(preferences) => setWorkspace((current) => current ? { ...current, preferences } : current)} />}
    {confirmationDialog}
  </main>;
}