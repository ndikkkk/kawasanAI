const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");

// Use the project's existing TypeScript compiler, without an extra test framework.
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  module._compile(outputText, filename);
};
globalThis.crypto ??= require("node:crypto").webcrypto;
require.extensions[".tsx"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } });
  module._compile(outputText, filename);
};
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const WorkspaceStatus = require("../app/workspace-status.tsx").default;
const SettingsDialog = require("../app/settings-dialog.tsx").default;
const { ConfirmationDialog } = require("../app/use-confirmation.tsx");
const ThemeToggle = require("../app/theme-toggle.tsx").default;
const documents = require("../lib/document-text.ts");
const documentService = require("../lib/document-service.ts");
const { readDocument } = require("../lib/read-document.ts");
const { boundedBody, BodyTooLarge } = require("../lib/request-body.ts");
const DocumentPreview = require("../app/document-preview.tsx").default;
const { documentParser, extractLocalPdf } = require("../lib/opendataloader.ts");
const { readAiResponse } = require("../lib/ai-stream.ts");
const { loginMetadata } = require("../lib/login-audit.ts");

function streamResponse(text, byteSize = 7) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new Response(new ReadableStream({ pull(controller) {
    if (offset >= bytes.length) return controller.close();
    controller.enqueue(bytes.slice(offset, offset += byteSize));
  } }), { headers: { "content-type": "text/event-stream" } });
}

test("stream parser handles split UTF-8, CRLF, comments, multiple events and completion", async () => {
  const changes = [];
  const response = streamResponse(': heartbeat\r\n\r\ndata: {"choices":[{"delta":{"content":"Halo 🌏"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":" dunia"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\r\n\r\n', 1);
  assert.equal(await readAiResponse(response, (content) => changes.push(content)), "Halo 🌏 dunia");
  assert.deepEqual(changes, ["Halo 🌏", "Halo 🌏 dunia"]);
});

test("stream parser retains partial callback but rejects truncation, provider errors and output limits", async () => {
  const delta = 'data: {"choices":[{"delta":{"content":"Sebagian"}}]}\n\n';
  let partial;
  await assert.rejects(readAiResponse(streamResponse(delta), (text) => { partial = text; }), /terputus/);
  assert.equal(partial, "Sebagian");
  await assert.rejects(readAiResponse(streamResponse(delta + 'data: {"error":{"message":"secret upstream diagnostic"}}\n\n'), () => {}), /Provider menghentikan/);
  await assert.rejects(readAiResponse(streamResponse(delta + 'data: {"choices":[{"finish_reason":"length"}]}\n\n'), () => {}), /sebelum selesai/);
  await assert.rejects(readAiResponse(streamResponse('data: [DONE]\n\n'), () => {}), /tidak mengirim/);
  await assert.rejects(readAiResponse(streamResponse('data: invalid\n\n'), () => {}), /tidak valid/);
  await assert.rejects(readAiResponse(streamResponse(`data: ${JSON.stringify({ choices: [{ delta: { content: "x".repeat(500001) } }] })}\n\n`, 65536), () => {}), /terlalu panjang/);
  assert.equal(await readAiResponse(Response.json({ content: "JSON fallback" }), () => {}), "JSON fallback");
});

test("login metadata only trusts configured proxy headers, validates IP and never collects codes", () => {
  const request = new Request("https://app.test", { headers: {
    "x-forwarded-for": "198.51.100.10, 10.0.0.1", "x-vercel-forwarded-for": "2001:db8::1",
    "x-vercel-ip-country": "ID", "x-vercel-ip-city": "Kota%20Bandung", "user-agent": "Test browser",
  } });
  assert.equal(loginMetadata(request, {}).ip_address, null);
  assert.equal(loginMetadata(request, {}).city, null);
  assert.equal(loginMetadata(request, { TRUST_PROXY_HEADERS: "true" }).ip_address, "198.51.100.10");
  const metadata = loginMetadata(request, { VERCEL: "1" });
  assert.equal(metadata.ip_address, "2001:db8::1");
  assert.equal(metadata.city, "Kota Bandung");
  assert.equal(metadata.country, "ID");
  assert.equal(loginMetadata(new Request("https://app.test", { headers: { "x-forwarded-for": "spoof" } }), { TRUST_PROXY_HEADERS: "true" }).ip_address, null);
});

test("parser configuration fails closed and local input limits precede Java execution", async () => {
  assert.equal(documentParser({}), "azure");
  assert.equal(documentParser({ DOCUMENT_PARSER: "opendataloader" }), "opendataloader");
  assert.throws(() => documentParser({ DOCUMENT_PARSER: "typo" }), /DOCUMENT_PARSER/);
  await assert.rejects(extractLocalPdf(Buffer.from("not pdf"), "invalid"), /bukan PDF/);
  await assert.rejects(extractLocalPdf(Buffer.alloc(documents.DOCUMENT_UPLOAD_BYTES + 1), "large"), /4 MB/);
});

test("local PDF response is read without polling and source comes from server", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ status: "succeeded", source: "OpenDataLoader PDF", text: "Isi penelitian lengkap" }));
  const file = new File(["%PDF-test"], "thesis.pdf", { type: "application/pdf" });
  const result = await readDocument(file, new AbortController().signal, () => {});
  assert.equal(result.source, "OpenDataLoader PDF");
  assert.equal(result.text, "Isi penelitian lengkap");
  assert.equal(fetch.mock.callCount(), 1);
  const html = renderToStaticMarkup(React.createElement(DocumentPreview, { document: result, selected: 0, locked: false, onSelect() {}, onClose() {} }));
  assert.match(html, /tanpa OCR/);
  fetch.mock.mockImplementation(async () => Response.json({ status: "succeeded", source: "OpenDataLoader PDF", text: "" }));
  await assert.rejects(readDocument(file, new AbortController().signal, () => {}), /Tidak ada teks/);
  fetch.mock.mockImplementation(async () => Response.json({ error: "Parser tidak tersedia" }, { status: 503 }));
  await assert.rejects(readDocument(file, new AbortController().signal, () => {}), /Parser tidak tersedia/);
});

test("document formats and upload limits are explicit", () => {
  for (const name of ["thesis.pdf", "thesis.DOCX"]) assert.equal(documents.documentError({ name, size: documents.DOCUMENT_UPLOAD_BYTES, type: "" }), null);
  assert.match(documents.documentError({ name: "x.pdf", size: documents.DOCUMENT_UPLOAD_BYTES + 1, type: "" }), /4 MB/);
  for (const name of ["x.doc", "x.png", "x.mp3", "x.zip"]) assert.match(documents.documentError({ name, size: 1, type: "" }), /belum didukung/);
  assert.match(documents.documentError({ name: "empty.txt", size: 0, type: "text/plain" }), /kosong/);
  assert.match(documents.documentError({ name: "x.exe", size: 1, type: "" }), /executable/);
});

test("extraction rejects empty, binary, invalid UTF-8 and oversized content without truncation", () => {
  for (const value of [undefined, "", "  ", "x\0y", "\ufffd", "x".repeat(500001)]) assert.throws(() => documents.validateExtractedText(value));
  assert.equal(documents.validateExtractedText("x".repeat(500000)).length, 500000);
});

test("long documents preserve every character and explicitly label selected parts", () => {
  const text = "a".repeat(500000);
  const parts = documents.documentParts(text);
  assert.equal(parts.join(""), text);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].length, 500000);
  const document = { file: { name: "skripsi.pdf", size: 30, type: "application/pdf" }, text, source: "Azure teks/OCR" };
  const attachment = documents.partAttachment(document, 0);
  assert.doesNotMatch(attachment.name, /bagian/);
  assert.equal(attachment.text, parts[0]);
  assert.throws(() => documents.partAttachment(document, -1));
  const html = renderToStaticMarkup(React.createElement(DocumentPreview, { document, selected: null, locked: false, onSelect() {}, onClose() {} }));
  assert.ok(html.includes("1 bagian"));
  assert.doesNotMatch(html, /<pre>/);
});

test("UTF-8 reading is local, complete, and cancellation-aware", async () => {
  const file = new File(["isi skripsi\n".repeat(12000)], "skripsi.txt", { type: "text/plain" });
  const result = await readDocument(file, new AbortController().signal, () => {});
  assert.equal(result.text, await file.text());
  assert.equal(result.source, "UTF-8");
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readDocument(file, controller.signal, () => {}), /abort/i);
});

test("streamed request bodies enforce actual byte limits", async () => {
  assert.equal(new TextDecoder().decode(await boundedBody(new Request("https://test", { method: "POST", body: "é" }), 2)), "é");
  await assert.rejects(boundedBody(new Request("https://test", { method: "POST", body: "é" }), 1), BodyTooLarge);
  assert.equal((await boundedBody(new Request("https://test"), 1)).length, 0);
});

const documentEnv = { DOCUMENT_INTELLIGENCE_ENDPOINT: "https://ocr.example.test", DOCUMENT_INTELLIGENCE_KEY: "test-secret", DOCUMENT_INTELLIGENCE_TIER: "S0", SESSION_SECRET: "s".repeat(32) };
const operationId = "01234567-89ab-4cde-8fab-0123456789ab";
test("document operation tokens reject tampering, other subjects and expiration", () => {
  const token = documentService.operationToken(operationId, "subject", documentEnv, 1000);
  assert.equal(documentService.readOperation(token, "subject", documentEnv, 1001), operationId);
  for (const [value, subject, now] of [[token + "x", "subject", 1001], [token, "other", 1001], [token, "subject", 601000], ["", "subject", 1001]]) assert.throws(() => documentService.readOperation(value, subject, documentEnv, now));
});

test("Azure REST contract submits binary input and returns extracted text (mock, not OCR accuracy)", async (t) => {
  const requests = [];
  const text = "Hasil OCR skripsi Bab I: metode penelitian.";
  let running = true;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options });
    if (options.method === "POST") return new Response(null, { status: 202, headers: { "operation-location": `https://ocr.example.test/documentintelligence/documentModels/prebuilt-read/analyzeResults/${operationId}?api-version=2024-11-30` } });
    if (running) { running = false; return Response.json({ status: "running" }); }
    return Response.json({ status: "succeeded", analyzeResult: { content: text } });
  });
  for (const [index, bytes] of [Buffer.from("%PDF-text"), Buffer.from("%PDF-scanned"), Buffer.from([0x50, 0x4b, 3, 4])].entries()) {
    const subject = `rest-${index}`;
    const token = await documentService.startDocument(bytes, subject, documentEnv);
    assert.ok(!token.includes("test-secret"));
    if (index === 0) assert.deepEqual(await documentService.pollDocument(token, subject, documentEnv), { status: "running" });
    assert.deepEqual(await documentService.pollDocument(token, subject, documentEnv), { status: "succeeded", text });
    const call = requests.filter((request) => request.options.method === "POST").at(-1);
    assert.deepEqual(Buffer.from(JSON.parse(call.options.body).base64Source, "base64"), bytes);
    assert.equal(call.options.headers["Ocp-Apim-Subscription-Key"], "test-secret");
    assert.equal(call.options.redirect, "error");
  }
});

test("Azure errors, unreadable scans, oversized results, F0 and unsafe operation URLs fail explicitly", async (t) => {
  let response = () => Response.json({}, { status: 400 });
  t.mock.method(globalThis, "fetch", async () => response());
  await assert.rejects(documentService.startDocument(Buffer.from("pdf"), "errors", documentEnv), /rusak/);
  await assert.rejects(documentService.startDocument(Buffer.from("pdf"), "errors", { ...documentEnv, DOCUMENT_INTELLIGENCE_TIER: "F0" }), /S0/);
  await assert.rejects(documentService.startDocument(Buffer.from("pdf"), "errors", {}), /belum dikonfigurasi/);
  response = () => new Response(null, { status: 202, headers: { "operation-location": `https://evil.test/documentintelligence/documentModels/prebuilt-read/analyzeResults/${operationId}` } });
  await assert.rejects(documentService.startDocument(Buffer.from("pdf"), "errors", documentEnv), /Lokasi/);
  const token = documentService.operationToken(operationId, "errors", documentEnv);
  for (const data of [{ status: "failed" }, { status: "unknown" }, { status: "succeeded", analyzeResult: { content: "" } }, { status: "succeeded", analyzeResult: { content: "x".repeat(500001) } }]) {
    response = () => Response.json(data);
    await assert.rejects(documentService.pollDocument(token, "errors", documentEnv));
  }
  response = () => Response.json({}, { status: 429 });
  await assert.rejects(documentService.pollDocument(token, "errors", documentEnv), /Kuota/);
});

test("document start throttling is bounded per subject and expires", () => {
  for (let index = 0; index < 5; index++) documentService.limitDocumentStarts("limited", 1000);
  assert.throws(() => documentService.limitDocumentStarts("limited", 1001), /5 upload/);
  assert.doesNotThrow(() => documentService.limitDocumentStarts("different", 1001));
  assert.doesNotThrow(() => documentService.limitDocumentStarts("limited", 601000));
});

test("confirmation dialog labels destructive actions and escapes conversation text", () => {
  const html = renderToStaticMarkup(React.createElement(ConfirmationDialog, {
    options: { title: "Hapus percakapan?", description: '<script>chat</script> dihapus untuk semua pengguna.', label: "Hapus percakapan", danger: true },
    onAnswer: () => {},
  }));
  assert.match(html, /<dialog/);
  assert.match(html, /aria-labelledby="confirmation-title"/);
  assert.match(html, /aria-describedby="confirmation-description"/);
  assert.match(html, /&lt;script&gt;chat&lt;\/script&gt;/);
  assert.match(html, /autofocus="">Batal/);
  assert.match(html, /class="danger-button"/);
});

test("settings accepts personalization longer than 2000 characters", () => {
  const instructions = "Gunakan contoh. ".repeat(500);
  const html = renderToStaticMarkup(React.createElement(SettingsDialog, {
    initial: { name: "Dika", instructions }, onSave: () => {}, onClose: () => {},
  }));
  assert.ok(html.includes(instructions));
  assert.doesNotMatch(html, /<textarea[^>]*maxLength/i);
});

test("theme switch has an accessible action label", () => {
  const html = renderToStaticMarkup(React.createElement(ThemeToggle));
  assert.match(html, /aria-label="Gunakan tema gelap"/);
  assert.match(html, /class="theme-toggle"/);
});

test("workspace loading renders branded status without recovery actions", () => {
  const html = renderToStaticMarkup(React.createElement(WorkspaceStatus));
  assert.match(html, /workspace-status-shell/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Sedang menyiapkan percakapan/);
  assert.doesNotMatch(html, /<button|<details/);
});

test("workspace recovery keeps technical details collapsed and actions accessible", () => {
  const html = renderToStaticMarkup(React.createElement(WorkspaceStatus, {
    error: "Database <unavailable>", actionError: "Gagal keluar.",
    onRetry: async () => {}, onLogout: async () => {},
  }));
  assert.match(html, /aria-busy="false"/);
  assert.match(html, /<details class="workspace-status-detail">/);
  assert.match(html, /Database &lt;unavailable&gt;/);
  assert.match(html, /Hubungkan kembali/);
  assert.match(html, /Kembali ke login/);
  assert.match(html, /role="alert">Gagal keluar/);
});

const auth = require("../lib/auth.ts");
const store = require("../lib/chat-store.ts");
const { allowLogin } = require("../lib/login-limit.ts");
const env = { ACCESS_CODE: "test-code-one", ACCESS_CODE_2: "test-code-two", SESSION_SECRET: "a-test-secret-that-is-at-least-32-characters" };

test("both access codes work and retain distinct session subjects for revocation", () => {
  const first = auth.verifySession(auth.issueSession(env.ACCESS_CODE, env), env);
  const second = auth.verifySession(auth.issueSession(env.ACCESS_CODE_2, env), env);
  assert.ok(first && second);
  assert.notEqual(first.subject, second.subject);
  assert.equal(auth.issueSession("wrong", env), null);
  assert.equal(auth.issueSession(null, env), null);
});

test("ten-minute lease can only be renewed before expiry and preserves code identity", () => {
  const now = 1700000000000;
  const token = auth.issueSession(env.ACCESS_CODE, env, now);
  assert.equal(auth.SESSION_SECONDS, 600);
  assert.ok(auth.verifySession(token, env, now + 599999));
  assert.equal(auth.verifySession(token, env, now + 600000), null);
  assert.equal(auth.renewSession(token, env, now + 600000), null);
  assert.equal(auth.renewSession("authenticated", env, now), null);
  const renewed = auth.renewSession(token, env, now + 30000);
  assert.equal(auth.verifySession(renewed, env, now + 600000).subject, auth.verifySession(token, env, now).subject);
  assert.equal(auth.verifySession(renewed, env, now + 630000), null);
  assert.equal(auth.renewSession(token, { ...env, ACCESS_CODE: "revoked" }, now), null);
});

test("fixed cookie, tampered signature, expiry and removed codes are rejected", () => {
  const now = 1700000000000;
  const token = auth.issueSession(env.ACCESS_CODE, env, now);
  assert.ok(auth.verifySession(token, env, now));
  assert.equal(auth.verifySession("authenticated", env, now), null);
  assert.equal(auth.verifySession(token + "x", env, now), null);
  assert.equal(auth.verifySession(token, env, now + auth.SESSION_SECONDS * 1000), null);
  assert.equal(auth.verifySession(token, { ...env, ACCESS_CODE: "replacement" }, now), null);
  assert.equal(auth.verifySession(token, { ...env, SESSION_SECRET: "another-test-secret-longer-than-32-characters" }, now), null);
  assert.equal(auth.verifySession("bad.json", env, now), null);
});

test("comma-separated codes support whitespace, duplicates and empty entries", () => {
  const config = { ...env, ACCESS_CODE: " first-code, second-code, ,first-code,third-code, ", ACCESS_CODE_2: "" };
  for (const code of ["first-code", "second-code", "third-code", " second-code "]) {
    assert.ok(auth.verifySession(auth.issueSession(code, config), config));
  }
  assert.equal(auth.issueSession(config.ACCESS_CODE, config), null);
  assert.equal(auth.issueSession("FIRST-CODE", config), null);
  assert.equal(auth.issueSession("   ", config), null);
  assert.equal(auth.authConfigured({ ...config, ACCESS_CODE: " , , " }), false);
});

test("list changes retain registered sessions and revoke only removed codes", () => {
  const config = { ...env, ACCESS_CODE: "first,second", ACCESS_CODE_2: "" };
  const first = auth.issueSession("first", config);
  const second = auth.issueSession("second", config);
  assert.ok(auth.verifySession(first, { ...config, ACCESS_CODE: "third,second,first" }));
  assert.equal(auth.verifySession(first, { ...config, ACCESS_CODE: "second" }), null);
  assert.ok(auth.verifySession(second, { ...config, ACCESS_CODE: "second" }));
});

test("missing or short session secret fails closed; foreign origins rejected", () => {
  assert.equal(auth.authConfigured({ ACCESS_CODE: "code" }), false);
  assert.equal(auth.issueSession("code", { ACCESS_CODE: "code", SESSION_SECRET: "short" }), null);
  assert.equal(auth.sameOrigin(new Request("https://example.test/api/chat", { headers: { origin: "https://evil.test" } })), false);
});

test("per-instance login limiter caps attempts and expires", () => {
  for (let i = 0; i < 10; i++) assert.equal(allowLogin("test-ip", 1000), true);
  assert.equal(allowLogin("test-ip", 1000), false);
  assert.equal(allowLogin("test-ip", 901001), true);
});

test("20 MB boundary and executable rejection", () => {
  assert.equal(store.fileError({ name: "notes.txt", size: store.MAX_FILE_SIZE }), null);
  assert.match(store.fileError({ name: "notes.txt", size: store.MAX_FILE_SIZE + 1 }), /20 MB/);
  assert.match(store.fileError({ name: "APP.EXE", size: 100 }), /executable/);
  assert.equal(store.textFile({ name: "main.py", type: "" }), true);
  assert.equal(store.textFile({ name: "paper.pdf", type: "application/pdf" }), false);
});

test("workspace round trip preserves conversations, title, model, settings, attachment context", () => {
  const workspace = store.newWorkspace();
  const first = workspace.conversations[0];
  first.title = "Judul buatan sendiri";
  first.messages.push({ role: "user", content: "Ringkas", attachment: { name: "catatan.txt", size: 10, type: "text/plain", text: "isi catatan" } });
  workspace.conversations.push(store.newConversation());
  workspace.activeId = workspace.conversations[1].id;
  workspace.preferences = { name: "Dika", instructions: "Jawab ringkas" };
  workspace.collapsed = true;
  assert.deepEqual(store.restoreWorkspace(JSON.stringify(workspace)), workspace);
  assert.match(store.messageContent(first.messages[0]), /isi catatan/);
});

test("migration retains old messages; malformed history is not silently accepted", () => {
  const messages = [{ role: "user", content: "Ide skripsi" }, { role: "assistant", content: "Mari diskusikan" }];
  const restored = store.migrateLegacy(JSON.stringify(messages));
  assert.deepEqual(restored.conversations[0].messages, messages);
  assert.equal(restored.conversations[0].title, "Ide skripsi");
  assert.throws(() => store.restoreWorkspace("not-json"));
  assert.throws(() => store.restoreWorkspace('{"conversations":[]}'));
  assert.throws(() => store.migrateLegacy('[{"role":"system","content":"bad"}]'));
});

test("restoring preferences does not truncate long personalization", () => {
  const workspace = store.newWorkspace();
  workspace.preferences.instructions = "Preferensi panjang. ".repeat(1000);
  assert.equal(store.restoreWorkspace(JSON.stringify(workspace)).preferences.instructions, workspace.preferences.instructions);
});

test("missing active conversation falls back; metadata never pretends to include contents", () => {
  const workspace = store.newWorkspace();
  workspace.activeId = "deleted";
  assert.equal(store.restoreWorkspace(JSON.stringify(workspace)).activeId, workspace.conversations[0].id);
  const content = store.messageContent({ role: "user", content: "Baca", attachment: { name: "file.pdf", type: "application/pdf", size: 100 } });
  assert.match(content, /Isi file tidak tersedia/);
});

test("shared history validates bounded conversations and revision filters", () => {
  const shared = require("../lib/shared-history.ts");
  const chat = store.newConversation();
  assert.equal(shared.validRevision(chat.id), true);
  assert.equal(shared.validRevision("x&revision=neq.y"), false);
  assert.equal(shared.validConversations([]), true);
  assert.equal(shared.validConversations([chat]), true);
  assert.equal(shared.validConversations([chat, chat]), false);
  for (const patch of [{ id: "bad" }, { title: "x".repeat(71) }, { model: "bad" }, { updatedAt: -1 }, { messages: [null] }, { messages: [{ role: "system", content: "bad" }] }]) {
    assert.equal(shared.validConversations([{ ...chat, ...patch }]), false);
  }
  const attachment = { name: "test.txt", size: 20, type: "text/plain", text: "a".repeat(store.MAX_FILE_TEXT) };
  assert.equal(shared.validConversations([{ ...chat, messages: [{ role: "user", content: "Read", attachment }] }]), true);
  assert.equal(shared.validConversations([{ ...chat, messages: [{ role: "user", content: "Read", attachment: { ...attachment, text: attachment.text + "a" } }] }]), false);
  assert.equal(shared.validConversations(Array.from({ length: 101 }, () => store.newConversation())), false);
  assert.equal(shared.validConversations([{ ...chat, messages: Array.from({ length: 201 }, () => ({ role: "user", content: "hello" })) }]), false);
});