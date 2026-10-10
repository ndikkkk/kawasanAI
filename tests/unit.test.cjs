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
const auth = require("../lib/auth.ts");
const store = require("../lib/chat-store.ts");
const { allowLogin } = require("../lib/login-limit.ts");
const env = { ACCESS_CODE: "test-code-one", ACCESS_CODE_2: "test-code-two", SESSION_SECRET: "a-test-secret-that-is-at-least-32-characters" };

test("both access codes work and have separate storage identities", () => {
  const first = auth.verifySession(auth.issueSession(env.ACCESS_CODE, env), env);
  const second = auth.verifySession(auth.issueSession(env.ACCESS_CODE_2, env), env);
  assert.ok(first && second);
  assert.notEqual(first.subject, second.subject);
  assert.equal(first.canMigrateLegacy, true);
  assert.equal(second.canMigrateLegacy, false);
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

test("missing active conversation falls back; metadata never pretends to include contents", () => {
  const workspace = store.newWorkspace();
  workspace.activeId = "deleted";
  assert.equal(store.restoreWorkspace(JSON.stringify(workspace)).activeId, workspace.conversations[0].id);
  const content = store.messageContent({ role: "user", content: "Baca", attachment: { name: "file.pdf", type: "application/pdf", size: 100 } });
  assert.match(content, /Isi file tidak tersedia/);
});