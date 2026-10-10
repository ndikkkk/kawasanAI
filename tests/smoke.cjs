const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { randomBytes, randomUUID } = require("node:crypto");
const path = require("node:path");

async function main() {
  const calls = [];
  const provider = http.createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    calls.push({ url: req.url, body: JSON.parse(raw) });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: "Halo Dika, ini respons mock." } }] }));
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  let history = { revision: randomUUID(), conversations: [] };
  let databaseDown = false;
  const databaseCalls = [];
  const database = http.createServer(async (req, res) => {
    databaseCalls.push({ url: req.url, key: req.headers.apikey, authorization: req.headers.authorization });
    res.setHeader("content-type", "application/json");
    if (databaseDown) { res.writeHead(503); res.end('{"error":"mock database unavailable"}'); return; }
    if (req.headers.apikey !== "sb_secret_mock_not_real") { res.writeHead(401); res.end("{}"); return; }
    const url = new URL(req.url, "http://mock.test");
    if (url.pathname !== "/rest/v1/kawasan_history" || url.searchParams.get("id") !== "eq.shared") { res.writeHead(400); res.end("{}"); return; }
    if (req.method === "GET") { res.end(JSON.stringify([history])); return; }
    if (req.method === "PATCH") {
      let raw = "";
      for await (const part of req) raw += part;
      const update = JSON.parse(raw);
      if (url.searchParams.get("revision") !== `eq.${history.revision}`) { res.end("[]"); return; }
      history = update;
      res.end(JSON.stringify([history]));
      return;
    }
    res.writeHead(405); res.end("{}");
  });
  database.listen(0, "127.0.0.1");
  await once(database, "listening");
  const portProbe = http.createServer();
  portProbe.listen(0, "127.0.0.1");
  await once(portProbe, "listening");
  const port = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let logs = "";
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "production", ACCESS_CODE: "smoke-code-one, smoke-code-two, ,smoke-code-three", ACCESS_CODE_2: "", SESSION_SECRET: randomBytes(32).toString("hex"), SUPABASE_URL: `http://127.0.0.1:${database.address().port}`, SUPABASE_SECRET_KEY: "sb_secret_mock_not_real", TOKEN_GATEWAY_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`, TOKEN_GATEWAY_API_KEY: "mock-key-not-real", SYSTEM_PROMPT: "Test system instruction" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => { logs += data; });
  child.stderr.on("data", (data) => { logs += data; });
  async function post(route, body, cookie) {
    return fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  }
  async function getHistory(cookie) {
    return fetch(`${base}/api/history`, { headers: cookie ? { Cookie: cookie } : {} });
  }
  async function putHistory(body, cookie, origin) {
    return fetch(`${base}/api/history`, { method: "PUT", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
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
    assert.equal((await post("/api/chat", {}, "chat_session=authenticated")).status, 401);
    assert.equal((await post("/api/login", { code: "wrong" })).status, 401);
    const login = await post("/api/login", { code: "smoke-code-one" });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get("set-cookie");
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=strict/i);
    const cookie = setCookie.split(";")[0];
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
    assert.ok(!html.includes("sb_secret_mock_not_real"));
    assert.equal((await getHistory()).status, 401);
    assert.equal((await getHistory("chat_session=authenticated")).status, 401);
    assert.equal((await putHistory({})).status, 401);
    assert.equal(databaseCalls.length, 0);
    const firstHistoryResponse = await getHistory(cookie);
    assert.equal(firstHistoryResponse.status, 200);
    assert.match(firstHistoryResponse.headers.get("cache-control"), /no-store/);
    const firstHistory = await firstHistoryResponse.json();
    assert.deepEqual(firstHistory.conversations, []);
    const conversation = { id: randomUUID(), title: "Shared brainstorm", updatedAt: Date.now(), model: "gpt-5.4-mini", messages: [{ role: "user", content: "Shared message", attachment: { name: "notes.txt", size: 4, type: "text/plain", text: "data" } }] };
    const saved = await putHistory({ revision: firstHistory.revision, conversations: [conversation] }, cookie);
    assert.equal(saved.status, 200);
    const savedRevision = (await saved.json()).revision;
    assert.notEqual(savedRevision, firstHistory.revision);
    const onSecondDevice = await (await getHistory(secondCookie)).json();
    assert.deepEqual(onSecondDevice, { revision: savedRevision, conversations: [conversation] });
    assert.equal((await putHistory({ revision: firstHistory.revision, conversations: [] }, secondCookie)).status, 409);
    assert.deepEqual(history.conversations, [conversation]);
    assert.equal((await putHistory({ revision: savedRevision, conversations: [] }, secondCookie, "https://foreign.test")).status, 403);
    assert.equal((await putHistory({ revision: "bad&injection=true", conversations: [] }, cookie)).status, 400);
    assert.equal((await putHistory({ revision: savedRevision, conversations: [null] }, cookie)).status, 400);
    assert.equal((await putHistory({ revision: savedRevision, conversations: [{ ...conversation, model: "bad" }] }, cookie)).status, 400);
    assert.equal((await putHistory({ padding: "x".repeat(3 * 1024 * 1024) }, cookie)).status, 413);
    const renamed = await putHistory({ revision: savedRevision, conversations: [{ ...conversation, title: "Renamed by second code" }] }, secondCookie);
    assert.equal(renamed.status, 200);
    const renamedRevision = (await renamed.json()).revision;
    assert.equal((await (await getHistory(cookie)).json()).conversations[0].title, "Renamed by second code");
    assert.equal((await putHistory({ revision: renamedRevision, conversations: [] }, cookie)).status, 200);
    assert.deepEqual((await (await getHistory(secondCookie)).json()).conversations, []);
    databaseDown = true;
    assert.equal((await getHistory(cookie)).status, 503);
    assert.equal((await putHistory({ revision: history.revision, conversations: [conversation] }, cookie)).status, 503);
    databaseDown = false;
    assert.ok(databaseCalls.every((call) => call.key === "sb_secret_mock_not_real" && call.authorization === undefined));
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
    assert.match(calls[0].body.messages[0].content, /Dika/);
    assert.match(calls[0].body.messages[0].content, /Ringkas/);
    const instructions = "Instruksi panjang dengan contoh. ".repeat(200);
    const longPreferences = await post("/api/chat", { preferences: { name: "Dika", instructions }, messages: [{ role: "user", content: "Halo" }] }, cookie);
    assert.equal(longPreferences.status, 200);
    assert.ok(calls[1].body.messages[0].content.includes(instructions));
    assert.equal((await post("/api/chat", { preferences: { name: "Dika", instructions: 123 }, messages: [{ role: "user", content: "Halo" }] }, cookie)).status, 400);
    assert.equal((await post("/api/chat", { preferences: { name: "Dika", instructions: "x".repeat(3 * 1024 * 1024) }, messages: [{ role: "user", content: "Halo" }] }, cookie)).status, 413);
    assert.equal(calls.length, 2);
    const logout = await post("/api/logout", {}, cookie);
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /1970/);
    console.log("PASS: comma-separated codes, signed sessions, shared history across codes, atomic conflicts, rename/delete, history validation/size/origin/access checks, database failure, server-only secret header, avatar, AI mock, personalization, logout. No real external requests.");
  } finally {
    child.kill();
    provider.closeAllConnections();
    database.closeAllConnections();
    await Promise.all([new Promise((resolve) => provider.close(resolve)), new Promise((resolve) => database.close(resolve))]);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });