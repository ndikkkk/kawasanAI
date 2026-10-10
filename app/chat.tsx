"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AVAILABLE_MODELS } from "../lib/models";

type ChatMessage = { role: "user" | "assistant"; content: string; attachment?: { name: string; type: string; size: number } };
type Attachment = { name: string; type: string; size: number; content: string; isImage: boolean };

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function formatSize(size: number) {
  return size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState<string>(AVAILABLE_MODELS[0]);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("ruang-ai-messages");
    if (saved) setMessages(JSON.parse(saved));
  }, []);
  useEffect(() => { localStorage.setItem("ruang-ai-messages", JSON.stringify(messages)); bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.name.toLowerCase().endsWith(".exe")) return setError("File .exe tidak diizinkan.");
    if (file.size > MAX_FILE_SIZE) return setError("Ukuran file maksimal 8 MB.");
    setError("");
    const isImage = file.type.startsWith("image/");
    const content = isImage || file.type.startsWith("text/") || file.type === "application/json" ? await readFile(file) : "";
    setAttachment({ name: file.name, type: file.type || "application/octet-stream", size: file.size, content, isImage });
  }

  function readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if ((!input.trim() && !attachment) || busy) return;
    setBusy(true); setError("");
    const userText = input.trim() || "Tolong analisis file yang saya lampirkan.";
    const next = [...messages, { role: "user" as const, content: userText, attachment: attachment ? { name: attachment.name, type: attachment.type, size: attachment.size } : undefined }];
    setMessages(next); setInput(""); setAttachment(null);
    const fileContext = attachment?.content && !attachment.isImage ? `\n\nIsi file ${attachment.name}:\n${attachment.content.slice(0, 120000)}` : attachment ? `\n\nFile terlampir: ${attachment.name} (${attachment.type}, ${formatSize(attachment.size)}).` : "";
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: next.map(({ role, content }, index) => ({ role, content: index === next.length - 1 ? content + fileContext : content })) }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error || "Gagal menghubungi AI.");
    else setMessages((current) => [...current, { role: "assistant", content: data.content }]);
    setBusy(false);
  }

  async function logout() { await fetch("/api/logout", { method: "POST" }); window.location.href = "/login"; }

  return <main className="app-shell">
    <header className="topbar"><div className="top-brand"><span className="brand-dot">✦</span><span>kawasan<span className="brand-accent">.</span>ai</span></div><div className="top-actions"><span className="status"><i /> online</span><button onClick={logout} className="logout-button">Keluar</button></div></header>
    <section className="chat-layout"><div className="welcome"><p className="eyebrow">KAWASAN AI</p><h1>Apa yang ingin<br /><em>kamu jelajahi?</em></h1><p className="welcome-copy">Tanyakan apa saja, unggah file, dan biarkan ide berkembang.</p></div>
      <div className="messages">{messages.length === 0 && <div className="empty-hint"><span>✦</span><p>Mulai percakapan baru di bawah.</p></div>}{messages.map((message, index) => <div className={`message-row ${message.role}`} key={`${index}-${message.content}`}><div className="message-avatar">{message.role === "assistant" ? <span role="img" aria-label="Asisten AI">✦</span> : <Image className="user-avatar" src="/avatars/user.svg" alt="Avatar pengirim" width={30} height={30} unoptimized />}</div><div className="message-bubble"><p>{message.content}</p>{message.attachment && <div className="attachment"><span>▧</span><div><strong>{message.attachment.name}</strong><small>{formatSize(message.attachment.size)}</small></div></div>}</div></div>)}{busy && <div className="message-row assistant"><div className="message-avatar">✦</div><div className="message-bubble typing"><i /><i /><i /></div></div>}<div ref={bottom} /></div>
      {error && <p className="error-text chat-error">{error}</p>}
      {attachment && <div className="pending-file"><span>▧</span><strong>{attachment.name}</strong><small>{formatSize(attachment.size)}</small><button onClick={() => setAttachment(null)}>×</button></div>}
      <div className="composer-tools"><label className="model-picker"><span>Model</span><select value={model} onChange={(event) => setModel(event.target.value)} disabled={busy}>{AVAILABLE_MODELS.map((availableModel) => <option value={availableModel} key={availableModel}>{availableModel}</option>)}</select></label><span className="model-hint">pilih model untuk pesan berikutnya</span></div>
      <form className="composer" onSubmit={send}><button type="button" className="attach-button" onClick={() => fileInput.current?.click()} aria-label="Lampirkan file">＋</button><input ref={fileInput} type="file" hidden onChange={selectFile} /><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Tulis pesanmu di sini..." disabled={busy} /><button className="send-button" aria-label="Kirim" disabled={busy || (!input.trim() && !attachment)}>↑</button></form><p className="composer-note">AI dapat membuat kesalahan. Periksa kembali informasi penting.</p>
    </section>
  </main>;
}