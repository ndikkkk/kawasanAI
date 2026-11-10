const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { randomBytes } = require("node:crypto");
const path = require("node:path");

async function main() {
  const calls = [];
  let providerMode = "json";
  const provider = http.createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    calls.push({ url: req.url, body: JSON.parse(raw) });
    if (providerMode === "504") { res.writeHead(504); res.end("Gateway timeout"); return; }
    if (providerMode === "stream" || providerMode === "truncated") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"content":"Halo Dika, "}}]}\n\n');
      if (providerMode === "truncated") { res.end(); return; }
      setTimeout(() => res.end('data: {"choices":[{"delta":{"content":"ini respons mock."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'), 150);
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: "Halo Dika, ini respons mock." } }] }));
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  const portProbe = http.createServer();
  portProbe.listen(0, "127.0.0.1");
  await once(portProbe, "listening");
  const port = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  // Next 14 normalizes its local Request URL to localhost; browser Origin must match.
  const base = `http://localhost:${port}`;
  let logs = "";
  // Never use an inherited paid OCR configuration during smoke tests.
  process.env.DOCUMENT_INTELLIGENCE_ENDPOINT = "";
  process.env.DOCUMENT_INTELLIGENCE_KEY = "";
  process.env.DOCUMENT_INTELLIGENCE_TIER = "";
  process.env.DOCUMENT_PARSER = process.env.KAWASAN_LOCAL_PDF ? "opendataloader" : "azure";
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
      cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "production", ACCESS_CODE: "smoke-code-one, smoke-code-two, ,smoke-code-three", ACCESS_CODE_2: "", SESSION_SECRET: randomBytes(32).toString("hex"), TOKEN_GATEWAY_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`, TOKEN_GATEWAY_API_KEY: "mock-key-not-real", SYSTEM_PROMPT: "Test system instruction" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => { logs += data; });
  child.stderr.on("data", (data) => { logs += data; });
  async function post(route, body, cookie) {
    return fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  }
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/login`)).ok) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(ready, `Server did not start: ${logs}`);
    assert.equal((await fetch(base, { redirect: "manual" })).status, 307);
    assert.equal((await post("/api/chat", {})).status, 401);
    assert.equal((await post("/api/documents", {})).status, 401);
    assert.equal((await fetch(`${base}/api/documents?token=invalid`)).status, 401);
    assert.equal((await post("/api/chat", {}, "chat_session=authenticated")).status, 401);
    assert.equal((await post("/api/login", { code: "wrong" })).status, 401);
    const login = await post("/api/login", { code: "smoke-code-one" });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get("set-cookie");
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=strict/i);
    assert.match(setCookie, /Max-Age=600/i);
    const cookie = setCookie.split(";")[0];
    assert.equal((await post("/api/session", {})).status, 401);
    assert.equal((await post("/api/session", {}, "chat_session=authenticated")).status, 401);
    const renewal = await post("/api/session", {}, cookie);
    assert.equal(renewal.status, 200);
    assert.match(renewal.headers.get("set-cookie"), /Max-Age=600/i);
    assert.equal((await fetch(`${base}/api/session`, { method: "POST", headers: { Cookie: cookie, Origin: "https://evil.test" } })).status, 403);
    async function uploadDocument(body, type = "application/pdf", origin) {
      return fetch(`${base}/api/documents`, { method: "POST", headers: { Cookie: cookie, "Content-Type": type, ...(origin ? { Origin: origin } : {}) }, body });
    }
    assert.equal((await uploadDocument("%PDF-test", "application/pdf", "https://evil.test")).status, 403);
    assert.equal((await uploadDocument("not supported", "image/png")).status, 415);
    assert.equal((await uploadDocument("broken pdf")).status, 422);
    assert.equal((await uploadDocument("broken docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).status, process.env.KAWASAN_LOCAL_PDF ? 415 : 422);
    assert.equal((await uploadDocument("%PDF-" + "x".repeat(4 * 1024 * 1024))).status, 413);
    if (process.env.KAWASAN_LOCAL_PDF) {
      const parsed = await uploadDocument(require("./pdf-fixture.cjs")());
      assert.equal(parsed.status, 200, await parsed.clone().text());
      const data = await parsed.json();
      assert.equal(data.source, "OpenDataLoader PDF");
      assert.match(data.text, /THESIS_PAGE_ONE/);
      assert.match(data.text, /THESIS_PAGE_TWO/);
      console.log("PASS real OpenDataLoader PDF through production route (both pages)");
    } else {
      const noOcr = await uploadDocument("%PDF-test");
      assert.equal(noOcr.status, 503);
      assert.match((await noOcr.json()).error, /belum dikonfigurasi/);
    }
    const second = await post("/api/login", { code: "smoke-code-two" });
    assert.equal(second.status, 200);
    const secondCookie = second.headers.get("set-cookie").split(";")[0];
    assert.notEqual(secondCookie, cookie);
    assert.equal((await post("/api/login", { code: "smoke-code-three" })).status, 200);
    assert.equal((await post("/api/login", { code: "smoke-code-one,smoke-code-two" })).status, 401);
    const page = await fetch(base, { headers: { Cookie: cookie } });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Kawasan AI/);
    assert.match(html, /rel="icon"[^>]*icon\.svg/);
    const icon = await fetch(`${base}/icon.svg`);
    assert.equal(icon.status, 200);
    assert.match(await icon.text(), /Kawasan AI/);
    assert.ok(!html.includes("SUPABASE"));
    const avatar = await fetch(`${base}/avatars/user.svg`);
    assert.equal(avatar.status, 200);
    assert.match(await avatar.text(), /<svg/);
    assert.equal((await post("/api/chat", { model: "invalid", messages: [{ role: "user", content: "Hi" }] }, cookie)).status, 400);
    assert.equal((await post("/api/chat", { messages: [null] }, cookie)).status, 400);
    assert.equal(calls.length, 0);
    const chat = await post("/api/chat", { model: "gpt-5.4-mini", preferences: { name: "Dika", instructions: "Ringkas" }, messages: [{ role: "user", content: "Halo" }] }, cookie);
    assert.equal(chat.status, 200);
    assert.match((await chat.json()).content, /Dika/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/v1/chat/completions");
    assert.equal(calls[0].body.model, "gpt-5.4-mini");
    assert.equal(calls[0].body.stream, true);
    assert.match(calls[0].body.messages[0].content, /Dika/);
    assert.match(calls[0].body.messages[0].content, /Ringkas/);
    const instructions = "Instruksi panjang dengan contoh. ".repeat(200);
    const longPreferences = await post("/api/chat", { preferences: { name: "Dika", instructions }, messages: [{ role: "user", content: "Halo" }] }, cookie);
    assert.equal(longPreferences.status, 200);
    assert.ok(calls[1].body.messages[0].content.includes(instructions));
    assert.equal((await post("/api/chat", { preferences: { name: "Dika", instructions: 123 }, messages: [{ role: "user", content: "Halo" }] }, cookie)).status, 400);
    assert.equal((await post("/api/chat", { preferences: { name: "Dika", instructions: "x".repeat(3 * 1024 * 1024) }, messages: [{ role: "user", content: "Halo" }] }, cookie)).status, 413);
    assert.equal(calls.length, 2);
    const selectedText = "Teks ekstraksi bagian kedua. ".repeat(3000) + "END_OF_SELECTED_DOCUMENT";
    const documentChat = await post("/api/chat", { messages: [{ role: "user", content: `Analisis bagian 2/2\n${selectedText}` }] }, cookie);
    assert.equal(documentChat.status, 200);
    assert.ok(calls[2].body.messages.at(-1).content.endsWith(selectedText));
    providerMode = "504";
    const timedOut = await post("/api/chat", { messages: [{ role: "user", content: "Timeout test" }] }, cookie);
    assert.equal(timedOut.status, 504);
    assert.match((await timedOut.json()).error, /90 detik/);
    providerMode = "stream";
    const streamed = await post("/api/chat", { messages: [{ role: "user", content: "Streaming test" }] }, cookie);
    assert.match(streamed.headers.get("content-type"), /text\/event-stream/);
    assert.match(streamed.headers.get("cache-control"), /no-transform/);
    const streamReader = streamed.body.getReader();
    const firstChunk = new TextDecoder().decode((await streamReader.read()).value);
    assert.match(firstChunk, /Halo Dika/);
    let tail = "";
    while (true) { const { value, done } = await streamReader.read(); if (done) break; tail += new TextDecoder().decode(value); }
    assert.match(firstChunk + tail, /\[DONE\]/);
    if (process.env.KAWASAN_BROWSER) await require("./browser.cjs")(base, cookie, process.env.KAWASAN_BROWSER);
    const logout = await post("/api/logout", {}, cookie);
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /1970/);
    console.log("PASS: auth without audit/database storage, chat payload limits, document auth/origin/format/size/configuration errors, favicon, complete selected text reaching AI mock, personalization, logout. No real external requests; OCR accuracy not tested.");
  } finally {
    child.kill();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });