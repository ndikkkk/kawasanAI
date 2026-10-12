// OpenAI-compatible SSE, including CRLF, split UTF-8 bytes and multi-line events.
export async function readAiResponse(response: Response, onContent: (content: string) => void) {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `Chat gagal (${response.status}). Koneksi gateway/hosting mungkin terputus.`);
  }
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = await response.json().catch(() => null);
    if (typeof data?.content !== "string" || !data.content.trim()) throw new Error("Respons provider kosong atau tidak didukung.");
    if (data.content.length > 500000) throw new Error("Jawaban terlalu panjang untuk disimpan.");
    onContent(data.content);
    return data.content as string;
  }
  if (!response.body) throw new Error("Stream provider tidak tersedia.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventData: string[] = [];
  let eventSize = 0;
  let content = "";
  let complete = false;
  let finished = false;
  function event() {
    const data = eventData.join("\n");
    eventData = []; eventSize = 0;
    if (!data) return;
    if (data === "[DONE]") { complete = true; return; }
    let value;
    try { value = JSON.parse(data); } catch { throw new Error("Format stream provider tidak valid."); }
    if (value.error) throw new Error("Provider menghentikan respons. Jawaban sementara belum lengkap; coba lagi atau pilih model lain.");
    const choice = value.choices?.[0];
    const delta = choice?.delta?.content;
    if (typeof delta === "string") {
      content += delta;
      if (content.length > 500000) throw new Error("Jawaban terlalu panjang untuk disimpan. Minta jawaban lebih ringkas.");
      onContent(content);
    }
    if (choice?.finish_reason) {
      if (choice.finish_reason !== "stop") throw new Error("Jawaban dihentikan provider sebelum selesai (batas output/filter/format). Coba permintaan lebih spesifik atau model lain.");
      finished = true;
    }
  }
  function line(value: string) {
    if (value.endsWith("\r")) value = value.slice(0, -1);
    if (!value) event();
    else if (value.startsWith("data:")) {
      const data = value.slice(5).replace(/^ /, "");
      eventSize += data.length;
      if (eventSize > 3 * 1024 * 1024) throw new Error("Event provider terlalu besar.");
      eventData.push(data);
    }
  }
  try {
    while (!complete) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let end;
      while (!complete && (end = buffer.indexOf("\n")) !== -1) {
        line(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      }
      if (buffer.length > 3 * 1024 * 1024) throw new Error("Event provider terlalu besar.");
      if (done) { if (buffer) line(buffer); if (eventData.length) event(); break; }
    }
    if (!complete && !finished) throw new Error("Koneksi terputus sebelum jawaban selesai. Teks sementara belum disimpan; kirim ulang jika diperlukan.");
    if (!content.trim()) throw new Error("Provider tidak mengirim jawaban teks.");
    return content;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}