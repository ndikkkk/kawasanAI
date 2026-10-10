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